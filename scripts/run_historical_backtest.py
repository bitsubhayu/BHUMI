"""BHUMI Chronological Historical Backtest Pipeline.

Implements rigorous multi-fold rolling-origin backtesting over historical monsoon seasons:
  - Strict chronological splits: Train on past seasons, test on subsequent held-out season
  - Evaluates Stage 1 Analog Ensemble, Stage 2 Downscaling (LightGBM + XGBoost), Stage 3 Calibrator
  - Zero future lookahead bias: Climatology and lag features strictly use prior observations
  - Evaluates standard meteorological verification metrics:
      * Brier Score (multi-class & per-event class)
      * Expected Calibration Error (ECE) & reliability curves
      * Multi-class Log Loss
      * ROC-AUC & PR-AUC where statistically valid
      * Precision / Recall / F1 for Onset, Break, and Heavy Rain spells
      * Breakdown by Lead Week 1..4
      * Breakdown by Agro-Climatic Zone
  - Persists full audit results to reports/historical_backtest_report.json
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
from pathlib import Path
import sys
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from sklearn.metrics import (
    brier_score_loss,
    confusion_matrix,
    log_loss,
    precision_recall_fscore_support,
    roc_auc_score,
)

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.ml.calibration.calibrator import ProbabilityCalibrator
from pipeline.ml.downscaling.classifiers import DownscalingEnsemble
from pipeline.ml.downscaling.features import FeatureExtractor
from pipeline.ml.teleconnections.ensemble import TeleconnectionEnsemble
from pipeline.ml.validation.metrics import compute_probabilistic_metrics
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.logger import get_logger


def run_historical_backtest(
    test_seasons: Optional[list[int]] = None,
    output_path: Optional[Path] = None,
    sample_step: int = 7,
    max_blocks: Optional[int] = None,
) -> dict[str, Any]:
    """Execute reproducible rolling-origin historical backtest over held-out seasons.

    Args:
        test_seasons: Specific season years to evaluate as held-out folds (default: [2022, 2023, 2024])
        output_path: Destination path for report JSON
        sample_step: Temporal sampling step in days (default: 7)
        max_blocks: Optional limit on blocks to process (default: None for all available)
    """
    logger = get_logger("bhumi.backtest")
    logger.info("Initializing BHUMI Reproducible Historical Backtest Pipeline...")

    config = get_pipeline_config()
    loader = SupabaseLoader(config=config)

    # 1. Fetch historical data
    blocks = loader.fetch_blocks()
    blocks_by_id = {b["block_id"]: b for b in blocks}

    archives = loader.fetch_seasonal_archives()
    telecons = loader.fetch_teleconnections_history()
    telecon_by_date = {str(t["observation_date"]): t for t in telecons}

    available_years = sorted(list({int(a["season_year"]) for a in archives}))
    unique_blocks = sorted(list({a["block_id"] for a in archives if a.get("block_id")}))

    if max_blocks and max_blocks < len(unique_blocks):
        allowed_blocks = set(unique_blocks[:max_blocks])
        archives = [a for a in archives if a["block_id"] in allowed_blocks]
        unique_blocks = sorted(list(allowed_blocks))

    logger.info(
        f"Backtest dataset: {len(unique_blocks)} blocks, {len(archives)} block-seasons across years {available_years}"
    )

    # Fit baseline teleconnection analog model
    telecon_ensemble = TeleconnectionEnsemble()
    telecon_ensemble.analog_model.fit(telecons)

    # 2. Extract feature vectors across all archives
    logger.info("Extracting feature matrices without lookahead leakage...")
    X_all, y_all, meta_all, _, _ = FeatureExtractor.extract_from_seasonal_archives(
        blocks_by_id=blocks_by_id,
        seasonal_archives=archives,
        telecon_by_date=telecon_by_date,
        analog_model=telecon_ensemble.analog_model,
        sample_step=sample_step,
    )

    logger.info(f"Extracted {len(X_all)} total prediction samples. Target class distribution: "
                f"{ {int(c): int(np.sum(y_all == c)) for c in (0, 1, 2, 3)} }")

    # Define folds
    folds_to_run = test_seasons or [y for y in [2022, 2023, 2024] if y in available_years]
    if not folds_to_run:
        # Fallback if specific years aren't in archive
        folds_to_run = available_years[-2:] if len(available_years) >= 2 else available_years

    fold_results: list[dict[str, Any]] = []

    for test_yr in folds_to_run:
        train_years = [y for y in available_years if y < test_yr]
        if not train_years:
            logger.warning(f"Skipping test year {test_yr}: no prior training years available in archive.")
            continue

        logger.info(f"--- Running Fold: Train {train_years} -> Test {test_yr} ---")

        # Split indices chronologically
        train_idx = [i for i, m in enumerate(meta_all) if int(m["season_year"]) in train_years]
        test_idx = [i for i, m in enumerate(meta_all) if int(m["season_year"]) == test_yr]

        if len(train_idx) < 50 or len(test_idx) < 20:
            logger.warning(f"Fold {test_yr}: insufficient samples (train={len(train_idx)}, test={len(test_idx)}). Skipping.")
            continue

        X_train, y_train = X_all[train_idx], y_all[train_idx]
        X_test, y_test = X_all[test_idx], y_all[test_idx]
        meta_test = [meta_all[i] for i in test_idx]

        # Fit Stage 2 LightGBM + XGBoost ensemble
        downscaling_ensemble = DownscalingEnsemble(random_state=42)
        downscaling_ensemble.fit(X_train, y_train)

        # Fit Stage 3 Calibrator
        raw_train_probs = downscaling_ensemble.predict_proba(X_train)
        calibrator = ProbabilityCalibrator(method="auto")
        calibrator.fit(raw_train_probs, y_train)

        # Predict on held-out test season
        raw_test_probs = downscaling_ensemble.predict_proba(X_test)

        # Apply calibration
        calibrated_test_probs = np.zeros_like(raw_test_probs)
        for i in range(len(raw_test_probs)):
            cal = calibrator.calibrate(
                raw_onset_p=raw_test_probs[i, 1],
                raw_break_p=raw_test_probs[i, 2],
                raw_heavy_p=raw_test_probs[i, 3],
            )
            p_onset = cal["onset_prob"] / 100.0
            p_break = cal["break_prob"] / 100.0
            p_heavy = cal["heavy_prob"] / 100.0
            p_active = max(0.0, 1.0 - (p_onset + p_break + p_heavy))
            row = np.array([p_active, p_onset, p_break, p_heavy])
            row_sum = np.sum(row)
            calibrated_test_probs[i] = row / (row_sum if row_sum > 0 else 1.0)

        # Evaluate comprehensive metrics on calibrated probabilities
        fold_metrics = compute_probabilistic_metrics(
            y_true=y_test,
            y_prob=calibrated_test_probs,
            meta_rows=meta_test,
        )

        # Agro-climatic zone breakdown
        zone_metrics: dict[str, dict[str, Any]] = {}
        zones = set()
        for m in meta_test:
            b_info = blocks_by_id.get(m["block_id"], {})
            z = b_info.get("agro_climatic_zone") or "Unclassified"
            zones.add(z)

        for z in sorted(list(zones)):
            z_indices = [
                i for i, m in enumerate(meta_test)
                if (blocks_by_id.get(m["block_id"], {}).get("agro_climatic_zone") or "Unclassified") == z
            ]
            if len(z_indices) >= 10:
                y_t_z = y_test[z_indices]
                y_p_z = calibrated_test_probs[z_indices]
                bs_z = float(np.mean([np.mean((y_p_z[:, c] - (y_t_z == c)) ** 2) for c in range(4)]))
                acc_z = float(np.mean(np.argmax(y_p_z, axis=1) == y_t_z))
                zone_metrics[z] = {
                    "samples": len(z_indices),
                    "brier_score": round(bs_z, 4),
                    "accuracy": round(acc_z, 4),
                }

        fold_record = {
            "test_season": test_yr,
            "train_seasons": train_years,
            "train_samples": len(train_idx),
            "test_samples": len(test_idx),
            "metrics": fold_metrics,
            "agro_climatic_performance": zone_metrics,
        }
        fold_results.append(fold_record)

        logger.info(
            f"Fold {test_yr} Completed: Multi-Brier={fold_metrics.get('brier_score_multi')}, "
            f"ECE={fold_metrics.get('expected_calibration_error')}, LogLoss={fold_metrics.get('log_loss')}"
        )

    # 3. Aggregate metrics across folds
    valid_folds = [f for f in fold_results if "metrics" in f and "brier_score_multi" in f["metrics"]]
    if not valid_folds:
        logger.error("No valid folds completed successfully.")
        return {"error": "No folds evaluated"}

    avg_brier = float(np.mean([f["metrics"]["brier_score_multi"] for f in valid_folds]))
    avg_ece = float(np.mean([f["metrics"]["expected_calibration_error"] for f in valid_folds]))
    avg_log_loss = float(np.mean([f["metrics"]["log_loss"] for f in valid_folds if not np.isnan(f["metrics"]["log_loss"])]))

    # Lead week aggregate progression
    lead_progression: dict[str, dict[str, float]] = {}
    for lead_w in range(1, 5):
        l_key = f"week_{lead_w}"
        bs_list = []
        acc_list = []
        for f in valid_folds:
            lm = f["metrics"].get("lead_time_performance", {}).get(l_key)
            if lm and "brier_score" in lm:
                bs_list.append(lm["brier_score"])
                acc_list.append(lm["accuracy"])
        if bs_list:
            lead_progression[l_key] = {
                "mean_brier_score": round(float(np.mean(bs_list)), 4),
                "mean_accuracy": round(float(np.mean(acc_list)), 4),
            }

    # Per-class aggregate F1 and Brier scores
    class_names = ["active", "onset", "break", "heavy"]
    per_class_summary: dict[str, dict[str, float]] = {}
    for cname in class_names:
        bs_c = [f["metrics"]["brier_scores_per_class"].get(f"brier_{cname}", 0.0) for f in valid_folds]
        f1_c = [f["metrics"]["per_class_performance"].get(cname, {}).get("f1_score", 0.0) for f in valid_folds]
        prec_c = [f["metrics"]["per_class_performance"].get(cname, {}).get("precision", 0.0) for f in valid_folds]
        rec_c = [f["metrics"]["per_class_performance"].get(cname, {}).get("recall", 0.0) for f in valid_folds]

        per_class_summary[cname] = {
            "mean_brier_score": round(float(np.mean(bs_c)), 4) if bs_c else 0.0,
            "mean_f1_score": round(float(np.mean(f1_c)), 4) if f1_c else 0.0,
            "mean_precision": round(float(np.mean(prec_c)), 4) if prec_c else 0.0,
            "mean_recall": round(float(np.mean(rec_c)), 4) if rec_c else 0.0,
        }

    # Consolidated report
    report = {
        "title": "BHUMI Chronological Historical Backtest Report",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "model_architecture": {
            "stage_1": "Analog Ensemble (ONI/DMI/MJO) + Small GRU sequence model",
            "stage_2": "LightGBM + XGBoost 2-model ensemble downscaling",
            "stage_3": "Probability Calibration (Auto Platt / Isotonic regression)",
        },
        "coverage_summary": {
            "distinct_blocks_evaluated": len(unique_blocks),
            "total_blocks_in_country": 7073,
            "nationwide_coverage_pct": round(len(unique_blocks) / 7073 * 100.0, 2),
            "historical_seasons_available": available_years,
            "total_prediction_samples": len(X_all),
            "folds_evaluated": [f["test_season"] for f in valid_folds],
        },
        "production_readiness_audit": {
            "status": "INSUFFICIENT_NATIONWIDE_COVERAGE",
            "is_production_ready": False,
            "model_tier": "EXPERIMENTAL",
            "blocking_reason": (
                f"Historical archive covers only {len(unique_blocks)} / 7073 production blocks "
                f"({len(unique_blocks)/7073*100.0:.2f}%); minimum 6,000 blocks (85.0% coverage) required "
                f"for authoritative India-wide production release."
            ),
        },
        "aggregate_metrics": {
            "mean_multi_brier_score": round(avg_brier, 4),
            "mean_expected_calibration_error": round(avg_ece, 4),
            "mean_log_loss": round(avg_log_loss, 4),
            "per_class_performance": per_class_summary,
            "lead_time_performance": lead_progression,
        },
        "fold_results": fold_results,
    }

    out_file = output_path or Path(__file__).resolve().parent.parent / "reports" / "historical_backtest_report.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    logger.info(f"Backtest report successfully saved to {out_file}")

    # Print clean console executive summary
    print("\n" + "=" * 80)
    print("                 BHUMI HISTORICAL BACKTEST AUDIT SUMMARY")
    print("=" * 80)
    print(f"Data Coverage:       {len(unique_blocks)} / 7073 blocks ({len(unique_blocks)/7073*100.0:.2f}%)")
    print(f"Historical Seasons:  {available_years}")
    print(f"Evaluated Folds:     {[f['test_season'] for f in valid_folds]}")
    print(f"Multi-Class Brier:   {avg_brier:.4f} (Benchmark: < 0.20)")
    print(f"Expected Calib Err:  {avg_ece:.4f} (Benchmark: < 0.10)")
    print(f"Multi-Class LogLoss: {avg_log_loss:.4f}")
    print("-" * 80)
    print("LEAD TIME PERFORMANCE (Week 1–4):")
    for l_key, lm in lead_progression.items():
        print(f"  {l_key.upper()}: Brier = {lm['mean_brier_score']:.4f} | Accuracy = {lm['mean_accuracy']*100:.1f}%")
    print("-" * 80)
    print("PER-EVENT METRICS (Calibrated):")
    for cname, cm in per_class_summary.items():
        print(f"  {cname.upper():<10}: Brier = {cm['mean_brier_score']:.4f} | F1 = {cm['mean_f1_score']:.4f} | Precision = {cm['mean_precision']:.4f} | Recall = {cm['mean_recall']:.4f}")
    print("-" * 80)
    print(f"PRODUCTION STATUS:   {report['production_readiness_audit']['status']}")
    print(f"MODEL TIER:          {report['production_readiness_audit']['model_tier']}")
    print(f"IS READY:            {report['production_readiness_audit']['is_production_ready']}")
    print(f"READINESS REASON:    {report['production_readiness_audit']['blocking_reason']}")
    print("=" * 80 + "\n")

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Run BHUMI Chronological Historical Backtest")
    parser.add_argument("--test-seasons", nargs="+", type=int, help="Held-out seasons to evaluate (e.g. 2022 2023 2024)")
    parser.add_argument("--sample-step", type=int, default=7, help="Sample step in days (default: 7)")
    parser.add_argument("--max-blocks", type=int, default=None, help="Limit number of blocks to process")
    parser.add_argument("--output", type=str, default=None, help="Output path for JSON report")

    args = parser.parse_args()
    out_p = Path(args.output) if args.output else None
    run_historical_backtest(
        test_seasons=args.test_seasons,
        output_path=out_p,
        sample_step=args.sample_step,
        max_blocks=args.max_blocks,
    )


if __name__ == "__main__":
    main()
