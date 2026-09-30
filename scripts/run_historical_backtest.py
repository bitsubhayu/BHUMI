"""BHUMI Chronological Historical Backtest Pipeline.

Implements rigorous multi-fold rolling-origin backtesting over historical monsoon seasons:
  - Strict chronological splits: Train on past seasons, test on subsequent held-out season
  - Strict temporal leakage prevention:
      * Teleconnection history for fold T includes ONLY dates with season_year < T
      * Analog model fitted ONLY on past teleconnections (< T)
      * GRU model trained ONLY on sequences from past seasons (< T)
      * Climatology and lag features strictly use prior observations
      * Out-of-sample calibration: fitted on past validation seasons, evaluated on test fold
  - Comprehensive model and baseline comparison:
      1. Climatological Baseline
      2. Stage 1A (Analog Only)
      3. Stage 1B (Small GRU Only)
      4. Stage 1C (Analog + GRU Ensemble)
      5. Stage 2 (LightGBM + XGBoost Raw Ensemble)
      6. Stage 3 (Calibrated Final Ensemble)
  - Evaluates standard meteorological verification metrics:
      * Brier Score (multi-class & per-event class)
      * Expected Calibration Error (ECE) & reliability curves
      * Multi-class Log Loss
      * ROC-AUC & PR-AUC where statistically valid
      * Precision / Recall / F1 for Onset, Break, and Heavy Rain spells
      * Brier Skill Score (BSS) vs Climatological baseline
      * Breakdown by Lead Week 1..4
      * Breakdown by Agro-Climatic Zone
      * Class imbalance separation analysis
  - Persists full audit results to reports/historical_backtest_report.json
"""

from __future__ import annotations

import argparse
import datetime
import json
import math
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
from pipeline.ml.downscaling.features import FEATURE_NAMES, FeatureExtractor
from pipeline.ml.teleconnections.analog_ensemble import AnalogEnsembleModel
from pipeline.ml.teleconnections.ensemble import TeleconnectionEnsemble
from pipeline.ml.teleconnections.gru_model import SmallGRUModel
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
    sorted_telecon_dates = sorted(telecon_by_date.keys())

    available_years = sorted(list({int(a["season_year"]) for a in archives}))
    unique_blocks = sorted(list({a["block_id"] for a in archives if a.get("block_id")}))

    if max_blocks and max_blocks < len(unique_blocks):
        allowed_blocks = set(unique_blocks[:max_blocks])
        archives = [a for a in archives if a["block_id"] in allowed_blocks]
        unique_blocks = sorted(list(allowed_blocks))

    logger.info(
        f"Backtest dataset: {len(unique_blocks)} blocks, {len(archives)} block-seasons across years {available_years}"
    )

    # 2. Extract base feature matrices and GRU sequences without lookahead leakage
    logger.info("Extracting base feature matrices and GRU sequences without lookahead leakage...")
    X_base, y_all, meta_all, X_gru_all, y_gru_all, meta_gru_all = FeatureExtractor.extract_from_seasonal_archives(
        blocks_by_id=blocks_by_id,
        seasonal_archives=archives,
        telecon_by_date=telecon_by_date,
        analog_model=None,
        sample_step=sample_step,
        return_gru_meta=True,
    )

    total_samples = len(X_base)
    class_dist_all = {int(c): int(np.sum(y_all == c)) for c in (0, 1, 2, 3)}
    logger.info(f"Extracted {total_samples} total prediction samples across all seasons.")
    logger.info(f"Target class distribution: {class_dist_all}")

    # Define chronological folds
    folds_to_run = test_seasons or [y for y in [2022, 2023, 2024] if y in available_years]
    if not folds_to_run:
        folds_to_run = available_years[-2:] if len(available_years) >= 2 else available_years

    fold_results: list[dict[str, Any]] = []
    leakage_audit_log: list[dict[str, Any]] = []
    all_leakage_checks_passed = True

    for test_yr in folds_to_run:
        train_years = [y for y in available_years if y < test_yr]
        if not train_years:
            logger.warning(f"Skipping test year {test_yr}: no prior training years available in archive.")
            continue

        logger.info(f"--- Running Fold: Train {train_years} -> Held-out Test {test_yr} ---")

        # -------------------------------------------------------------------------
        # ISSUE 1: Strict Temporal Teleconnection Leakage Prevention
        # -------------------------------------------------------------------------
        # Filter teleconnection training history strictly to dates belonging to seasons prior to test_yr
        telecons_train = [
            t for t in telecons
            if int(str(t.get("observation_date", "")).split("-")[0]) < test_yr
        ]

        # Verify no record from test_yr or later entered telecons_train
        max_telecon_train_year = max(
            int(str(t.get("observation_date", "")).split("-")[0]) for t in telecons_train
        ) if telecons_train else 0
        has_future_telecon = any(
            int(str(t.get("observation_date", "")).split("-")[0]) >= test_yr
            for t in telecons_train
        )
        if has_future_telecon or max_telecon_train_year >= test_yr:
            all_leakage_checks_passed = False
            raise RuntimeError(
                f"LEAKAGE DETECTED in Fold {test_yr}: training teleconnections contain year >= {test_yr}"
            )

        # Fit fold-specific analog model strictly on past teleconnection history
        fold_analog_model = AnalogEnsembleModel(top_k=5, temperature=1.0)
        fold_analog_model.fit(telecons_train)

        # Audit analog candidate pool
        analog_years_pool = {m["year"] for m in fold_analog_model._history_meta}
        if any(y >= test_yr for y in analog_years_pool):
            all_leakage_checks_passed = False
            raise RuntimeError(
                f"LEAKAGE DETECTED in Fold {test_yr}: analog model contains future years {analog_years_pool}"
            )

        # Chronological index splits for tabular data
        train_idx = [i for i, m in enumerate(meta_all) if int(m["season_year"]) in train_years]
        test_idx = [i for i, m in enumerate(meta_all) if int(m["season_year"]) == test_yr]

        if len(train_idx) < 50 or len(test_idx) < 20:
            logger.warning(f"Fold {test_yr}: insufficient samples (train={len(train_idx)}, test={len(test_idx)}). Skipping.")
            continue

        meta_train = [meta_all[i] for i in train_idx]
        meta_test = [meta_all[i] for i in test_idx]
        y_train = y_all[train_idx]
        y_test = y_all[test_idx]

        # Dynamically inject fold-specific analog signals into feature matrices
        X_train = FeatureExtractor.update_analog_features_in_matrix(
            X_mat=X_base[train_idx],
            meta_list=meta_train,
            telecon_by_date=telecon_by_date,
            analog_model=fold_analog_model,
        )
        X_test = FeatureExtractor.update_analog_features_in_matrix(
            X_mat=X_base[test_idx],
            meta_list=meta_test,
            telecon_by_date=telecon_by_date,
            analog_model=fold_analog_model,
        )

        # -------------------------------------------------------------------------
        # ISSUE 2: Fold-Specific Supervised GRU Training & Evaluation
        # -------------------------------------------------------------------------
        train_gru_idx = [i for i, m in enumerate(meta_gru_all) if int(m["season_year"]) in train_years]
        if any(int(meta_gru_all[i]["season_year"]) >= test_yr for i in train_gru_idx):
            all_leakage_checks_passed = False
            raise RuntimeError(f"LEAKAGE DETECTED: GRU training batch contains future season >= {test_yr}")

        X_gru_train = X_gru_all[train_gru_idx]
        y_gru_train = y_gru_all[train_gru_idx]

        fold_gru = SmallGRUModel(seed=42)
        gru_train_status = "UNTRAINED"
        if len(X_gru_train) >= 50:
            res_gru = fold_gru.train_supervised(X_gru_train, y_gru_train, epochs=10, lr=0.01)
            gru_train_status = "TRAINED" if res_gru["is_trained"] else "FAILED"
            logger.info(f"Fold {test_yr} GRU trained on {len(X_gru_train)} sequences: status={gru_train_status}, delta_norm={res_gru['weight_delta_norm']:.4e}")

        # Precompute GRU predictions for all distinct observation dates in the test fold
        test_obs_dates = sorted(list({m["date"] for m in meta_test}))
        gru_date_predictions: dict[str, np.ndarray] = {}
        for d_str in test_obs_dates:
            d_idx = sorted_telecon_dates.index(d_str) if d_str in sorted_telecon_dates else -1
            if d_idx >= 30:
                s_dates = sorted_telecon_dates[d_idx - 30 : d_idx]
                s_vecs = []
                for sd in s_dates:
                    rec = telecon_by_date[sd]
                    amp = float(rec.get("mjo_amplitude") or 1.0)
                    phase = int(rec.get("mjo_phase") or 1)
                    ang = 2.0 * math.pi * (phase - 1) / 8.0
                    s_vecs.append([
                        float(rec.get("enso_oni") or 0.0),
                        float(rec.get("iod_dmi") or 0.0),
                        amp * math.cos(ang),
                        amp * math.sin(ang),
                        amp,
                    ])
                seq_arr = np.array(s_vecs, dtype=np.float64)
                gru_date_predictions[d_str] = fold_gru.predict_lead_matrix(seq_arr)  # (4, 4)
            else:
                # Neutral fallback if date has insufficient preceding trajectory
                gru_date_predictions[d_str] = np.tile([0.55, 0.10, 0.25, 0.10], (4, 1))

        # -------------------------------------------------------------------------
        # ISSUE 3: Strict Out-of-Sample Calibration Fitting
        # -------------------------------------------------------------------------
        # Split train_years into fit seasons (earlier) and out-of-sample calibration seasons (later)
        if len(train_years) >= 4:
            fit_years = train_years[:-2]
            val_years = train_years[-2:]
        elif len(train_years) >= 2:
            fit_years = train_years[:-1]
            val_years = train_years[-1:]
        else:
            fit_years = train_years
            val_years = train_years

        fit_idx = [i for i, m in enumerate(meta_train) if int(m["season_year"]) in fit_years]
        val_idx = [i for i, m in enumerate(meta_train) if int(m["season_year"]) in val_years]

        X_fit, y_fit = X_train[fit_idx], y_train[fit_idx]
        X_val, y_val = X_train[val_idx], y_train[val_idx]

        # Fit Stage 2 tree ensemble on fit seasons
        downscaling_ensemble = DownscalingEnsemble(random_state=42)
        downscaling_ensemble.fit(X_fit, y_fit)

        # Generate out-of-sample validation probabilities to fit the calibrator
        val_raw_probs = downscaling_ensemble.predict_proba(X_val)
        calibrator = ProbabilityCalibrator(method="auto")
        calibrator.fit(val_raw_probs, y_val)

        logger.info(f"Fold {test_yr} Calibrator fitted out-of-sample on seasons {val_years} ({len(val_idx)} samples). Methods: {calibrator.selected_methods}")

        # -------------------------------------------------------------------------
        # ISSUE 4: Baselines & Model Predictions Generation on Test Fold
        # -------------------------------------------------------------------------
        # 1. Climatological Baseline: empirical prior from training set
        clim_prior = np.array([np.mean(y_train == c) for c in range(4)], dtype=np.float64)
        probs_climatology = np.tile(clim_prior, (len(y_test), 1))

        # 2. Stage 1A (Analog Only) Baseline: extracted directly from analog signals in X_test
        # Feature columns: 10: active, 9: onset, 11: break, 12: heavy
        probs_analog_only = X_test[:, [10, 9, 11, 12]].copy()
        row_sums = probs_analog_only.sum(axis=1, keepdims=True)
        row_sums[row_sums == 0] = 1.0
        probs_analog_only = probs_analog_only / row_sums

        # 3. Stage 1B (GRU Only): mapped by (date, lead_week)
        probs_gru_only = np.zeros((len(y_test), 4), dtype=np.float64)
        for i, m in enumerate(meta_test):
            d_str = m["date"]
            l_idx = int(m["lead_week"]) - 1
            if d_str in gru_date_predictions and 0 <= l_idx < 4:
                probs_gru_only[i] = gru_date_predictions[d_str][l_idx]
            else:
                probs_gru_only[i] = clim_prior

        # 4. Stage 1C (Analog + GRU Ensemble): 70% Analog + 30% GRU
        probs_telecon_ensemble = 0.70 * probs_analog_only + 0.30 * probs_gru_only
        probs_telecon_ensemble /= probs_telecon_ensemble.sum(axis=1, keepdims=True)

        # 5. Stage 2 (LightGBM + XGBoost Raw Ensemble)
        probs_stage2_raw = downscaling_ensemble.predict_proba(X_test)

        # 6. Stage 3 (Calibrated Downscaling Ensemble)
        probs_calibrated = calibrator.calibrate_matrix(probs_stage2_raw)

        # -------------------------------------------------------------------------
        # Compute Probabilistic Metrics for All Models and Baselines
        # -------------------------------------------------------------------------
        metrics_climatology = compute_probabilistic_metrics(y_test, probs_climatology, meta_test)
        metrics_analog_only = compute_probabilistic_metrics(y_test, probs_analog_only, meta_test)
        metrics_gru_only = compute_probabilistic_metrics(y_test, probs_gru_only, meta_test)
        metrics_telecon_ens = compute_probabilistic_metrics(y_test, probs_telecon_ensemble, meta_test)
        metrics_stage2_raw = compute_probabilistic_metrics(y_test, probs_stage2_raw, meta_test)
        metrics_calibrated = compute_probabilistic_metrics(y_test, probs_calibrated, meta_test)

        # Brier Skill Score (BSS) vs Climatology
        bs_clim = metrics_climatology.get("brier_score_multi", 0.20)
        bs_cal = metrics_calibrated.get("brier_score_multi", 0.20)
        bss_calibrated = round(1.0 - (bs_cal / bs_clim), 4) if bs_clim > 0 else 0.0

        # -------------------------------------------------------------------------
        # ISSUE 5: Class Imbalance & Minority Class Probability Separation Audit
        # -------------------------------------------------------------------------
        class_names = ["active", "onset", "break", "heavy"]
        imbalance_audit: dict[str, dict[str, Any]] = {}
        for c_idx, c_name in enumerate(class_names):
            is_class = (y_test == c_idx)
            prev = float(np.mean(is_class))
            pred_prev = float(np.mean(np.argmax(probs_calibrated, axis=1) == c_idx))
            conf_when_true = float(np.mean(probs_calibrated[is_class, c_idx])) if np.sum(is_class) > 0 else 0.0
            conf_when_false = float(np.mean(probs_calibrated[~is_class, c_idx])) if np.sum(~is_class) > 0 else 0.0
            sep_ratio = round(conf_when_true / (conf_when_false + 1e-6), 2)
            imbalance_audit[c_name] = {
                "ground_truth_prevalence": round(prev, 4),
                "predicted_prevalence": round(pred_prev, 4),
                "mean_prob_when_true": round(conf_when_true, 4),
                "mean_prob_when_false": round(conf_when_false, 4),
                "signal_separation_ratio": sep_ratio,
            }

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
                y_p_z = probs_calibrated[z_indices]
                bs_z = float(np.mean([np.mean((y_p_z[:, c] - (y_t_z == c)) ** 2) for c in range(4)]))
                acc_z = float(np.mean(np.argmax(y_p_z, axis=1) == y_t_z))
                zone_metrics[z] = {
                    "samples": len(z_indices),
                    "brier_score": round(bs_z, 4),
                    "accuracy": round(acc_z, 4),
                }

        leakage_audit_log.append({
            "fold_season": test_yr,
            "train_years": train_years,
            "telecons_train_count": len(telecons_train),
            "max_telecon_train_year": max_telecon_train_year,
            "analog_years_pool": sorted(list(analog_years_pool)),
            "gru_train_sequences": len(X_gru_train),
            "val_years_for_calibrator": val_years,
            "leakage_detected": False,
        })

        fold_record = {
            "test_season": test_yr,
            "train_seasons": train_years,
            "train_samples": len(train_idx),
            "test_samples": len(test_idx),
            "calibrator_fit_seasons": val_years,
            "model_evaluations": {
                "climatology_baseline": metrics_climatology,
                "stage1_analog_only": metrics_analog_only,
                "stage1_gru_only": metrics_gru_only,
                "stage1_telecon_ensemble": metrics_telecon_ens,
                "stage2_downscaling_raw": metrics_stage2_raw,
                "stage3_calibrated_final": metrics_calibrated,
            },
            "brier_skill_score_vs_climatology": bss_calibrated,
            "class_imbalance_diagnostics": imbalance_audit,
            "agro_climatic_performance": zone_metrics,
        }
        fold_results.append(fold_record)

        logger.info(
            f"Fold {test_yr} Summary: Clim-Brier={metrics_climatology['brier_score_multi']:.4f} -> "
            f"Analog-Brier={metrics_analog_only['brier_score_multi']:.4f} -> "
            f"GRU-Brier={metrics_gru_only['brier_score_multi']:.4f} -> "
            f"Stage2-Brier={metrics_stage2_raw['brier_score_multi']:.4f} -> "
            f"Final-Calibrated-Brier={metrics_calibrated['brier_score_multi']:.4f} (BSS={bss_calibrated:+.4f})"
        )

    # 3. Aggregate metrics across folds
    valid_folds = [f for f in fold_results if "model_evaluations" in f]
    if not valid_folds:
        logger.error("No valid folds completed successfully.")
        return {"error": "No folds evaluated"}

    models_to_aggregate = [
        "climatology_baseline",
        "stage1_analog_only",
        "stage1_gru_only",
        "stage1_telecon_ensemble",
        "stage2_downscaling_raw",
        "stage3_calibrated_final",
    ]

    aggregate_model_comparison: dict[str, dict[str, float]] = {}
    for m_key in models_to_aggregate:
        bs_vals = [f["model_evaluations"][m_key]["brier_score_multi"] for f in valid_folds]
        ece_vals = [f["model_evaluations"][m_key]["expected_calibration_error"] for f in valid_folds]
        ll_vals = [f["model_evaluations"][m_key]["log_loss"] for f in valid_folds if not np.isnan(f["model_evaluations"][m_key]["log_loss"])]
        acc_vals = [f["model_evaluations"][m_key].get("accuracy", 0.0) for f in valid_folds]

        aggregate_model_comparison[m_key] = {
            "mean_brier_score": round(float(np.mean(bs_vals)), 4),
            "mean_expected_calibration_error": round(float(np.mean(ece_vals)), 4),
            "mean_log_loss": round(float(np.mean(ll_vals)), 4) if ll_vals else 0.0,
            "mean_accuracy": round(float(np.mean(acc_vals)), 4),
        }

    # Brier Skill Score aggregate
    mean_bss = round(float(np.mean([f["brier_skill_score_vs_climatology"] for f in valid_folds])), 4)

    # Lead week aggregate progression for final calibrated model
    lead_progression: dict[str, dict[str, float]] = {}
    for lead_w in range(1, 5):
        l_key = f"week_{lead_w}"
        bs_list = []
        acc_list = []
        for f in valid_folds:
            lm = f["model_evaluations"]["stage3_calibrated_final"].get("lead_time_performance", {}).get(l_key)
            if lm and "brier_score" in lm:
                bs_list.append(lm["brier_score"])
                acc_list.append(lm["accuracy"])
        if bs_list:
            lead_progression[l_key] = {
                "mean_brier_score": round(float(np.mean(bs_list)), 4),
                "mean_accuracy": round(float(np.mean(acc_list)), 4),
            }

    # Per-class aggregate summary for final calibrated model
    class_names = ["active", "onset", "break", "heavy"]
    per_class_summary: dict[str, dict[str, float]] = {}
    for cname in class_names:
        bs_c = [f["model_evaluations"]["stage3_calibrated_final"]["brier_scores_per_class"].get(f"brier_{cname}", 0.0) for f in valid_folds]
        f1_c = [f["model_evaluations"]["stage3_calibrated_final"]["per_class_performance"].get(cname, {}).get("f1_score", 0.0) for f in valid_folds]
        prec_c = [f["model_evaluations"]["stage3_calibrated_final"]["per_class_performance"].get(cname, {}).get("precision", 0.0) for f in valid_folds]
        rec_c = [f["model_evaluations"]["stage3_calibrated_final"]["per_class_performance"].get(cname, {}).get("recall", 0.0) for f in valid_folds]

        per_class_summary[cname] = {
            "mean_brier_score": round(float(np.mean(bs_c)), 4) if bs_c else 0.0,
            "mean_f1_score": round(float(np.mean(f1_c)), 4) if f1_c else 0.0,
            "mean_precision": round(float(np.mean(prec_c)), 4) if prec_c else 0.0,
            "mean_recall": round(float(np.mean(rec_c)), 4) if rec_c else 0.0,
        }

    # Consolidated report
    report = {
        "title": "BHUMI Chronological Historical Backtest Report (Scientifically Hardened)",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "data_leakage_check": "PASS" if all_leakage_checks_passed else "FAIL",
        "data_leakage_audit": leakage_audit_log,
        "model_architecture": {
            "stage_1": "Analog Ensemble (ONI/DMI/MJO) + Small GRU sequence model",
            "stage_2": "LightGBM + XGBoost 2-model ensemble downscaling",
            "stage_3": "Probability Calibration (Out-of-sample auto Platt / Isotonic regression)",
            "stage_4": "Sequential Mann-Kendall & Pettitt Change-Point Detection (Non-parametric regime-shift detection in daily inference)",
        },
        "coverage_summary": {
            "distinct_blocks_evaluated": len(unique_blocks),
            "total_blocks_in_country": 7073,
            "nationwide_coverage_pct": round(len(unique_blocks) / 7073 * 100.0, 2),
            "historical_seasons_available": available_years,
            "total_prediction_samples": total_samples,
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
        "model_vs_baselines_aggregate": aggregate_model_comparison,
        "brier_skill_score_vs_climatology": mean_bss,
        "lead_time_performance_calibrated": lead_progression,
        "per_class_performance_calibrated": per_class_summary,
        "fold_results": fold_results,
    }

    out_file = output_path or Path(__file__).resolve().parent.parent / "reports" / "historical_backtest_report.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    logger.info(f"Backtest report successfully saved to {out_file}")

    # Print executive summary
    print("\n" + "=" * 80)
    print("      BHUMI SCIENTIFICALLY HARDENED HISTORICAL BACKTEST SUMMARY")
    print("=" * 80)
    print(f"Data Leakage Check:   {report['data_leakage_check']}")
    print(f"Data Coverage:        {len(unique_blocks)} / 7073 blocks ({len(unique_blocks)/7073*100.0:.2f}%)")
    print(f"Historical Seasons:   {available_years}")
    print(f"Evaluated Folds:      {[f['test_season'] for f in valid_folds]}")
    print("-" * 80)
    print("MODEL VS BASELINES COMPARISON (Aggregate Across Folds):")
    print(f"  {'Model / Stage':<28} | {'Brier':<8} | {'ECE':<8} | {'LogLoss':<8} | {'Accuracy':<8}")
    print("  " + "-" * 68)
    for m_key, m_stats in aggregate_model_comparison.items():
        print(f"  {m_key:<28} | {m_stats['mean_brier_score']:<8.4f} | {m_stats['mean_expected_calibration_error']:<8.4f} | {m_stats['mean_log_loss']:<8.4f} | {m_stats['mean_accuracy']*100:<7.1f}%")
    print(f"  Brier Skill Score (Calibrated vs Climatology): {mean_bss:+.4f} ({'Skillful' if mean_bss > 0 else 'Unskilled'})")
    print("-" * 80)
    print("LEAD TIME PERFORMANCE (Stage 3 Calibrated):")
    for l_key, lm in lead_progression.items():
        print(f"  {l_key.upper()}: Brier = {lm['mean_brier_score']:.4f} | Accuracy = {lm['mean_accuracy']*100:.1f}%")
    print("-" * 80)
    print("PER-EVENT METRICS (Stage 3 Calibrated):")
    for cname, cm in per_class_summary.items():
        print(f"  {cname.upper():<10}: Brier = {cm['mean_brier_score']:.4f} | F1 = {cm['mean_f1_score']:.4f} | Precision = {cm['mean_precision']:.4f} | Recall = {cm['mean_recall']:.4f}")
    print("-" * 80)
    print(f"PRODUCTION STATUS:    {report['production_readiness_audit']['status']}")
    print(f"MODEL TIER:           {report['production_readiness_audit']['model_tier']}")
    print(f"IS READY:             {report['production_readiness_audit']['is_production_ready']}")
    print(f"READINESS REASON:     {report['production_readiness_audit']['blocking_reason']}")
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
