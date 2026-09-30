"""Seasonal Model Training & Rolling-Origin Validation Pipeline.

Executes offline retraining for Pre-Kharif (May) and Pre-Rabi (October) cycles:
  1. Ingests historical seasonal archives and teleconnections from Supabase.
  2. Extracts time-respecting tabular features without lookahead bias.
  3. Trains Stage 1 Analog Ensemble + Supervised GRU (or strictly disables GRU if data is insufficient).
  4. Applies strict ModelReadinessEvaluator gates.
  5. Trains Stage 2 LightGBM + XGBoost downscaling ensemble.
  6. Trains Stage 3 Probability calibrator.
  7. Computes rigorous multi-class probabilistic metrics.
  8. Serializes compact, versioned artifacts with explicit readiness metadata.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any, Optional

import numpy as np

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.ml.calibration.calibrator import ProbabilityCalibrator
from pipeline.ml.downscaling.classifiers import DownscalingEnsemble
from pipeline.ml.downscaling.features import FEATURE_NAMES, FeatureExtractor
from pipeline.ml.teleconnections.ensemble import TeleconnectionEnsemble
from pipeline.ml.validation.metrics import compute_probabilistic_metrics
from pipeline.ml.validation.readiness import ModelReadinessEvaluator
from pipeline.ml.validation.rolling_split import RollingOriginSplitter
from pipeline.utils.config import PipelineConfig, get_pipeline_config
from pipeline.utils.logger import get_logger


class SeasonalModelTrainer:
    """Trainer orchestrating seasonal model updates, supervised training, and rolling validation."""

    def __init__(
        self,
        config: Optional[PipelineConfig] = None,
        artifacts_dir: Optional[Path] = None,
        dry_run: bool = False,
    ) -> None:
        self.config = config or get_pipeline_config()
        self.artifacts_dir = artifacts_dir or Path(__file__).resolve().parent / "artifacts"
        self.dry_run = dry_run
        if not self.dry_run:
            self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        self.logger = get_logger("bhumi.ml.trainer")
        self.loader = SupabaseLoader(config=self.config, dry_run=dry_run)

    def train_and_evaluate(self) -> dict[str, Any]:
        """Execute full training and evaluation pass against available real historical data."""
        self.logger.info(f"Starting seasonal training and rolling validation cycle (dry_run={self.dry_run})...")

        # 1. Fetch data from Supabase
        blocks = self.loader.fetch_blocks()
        blocks_by_id = {b["block_id"]: b for b in blocks}

        archives = self.loader.fetch_seasonal_archives()
        telecons = self.loader.fetch_teleconnections_history()
        telecon_by_date = {str(t["observation_date"]): t for t in telecons}

        unique_blocks = {a["block_id"] for a in archives if a.get("block_id")}
        unique_blocks_count = len(unique_blocks)

        self.logger.info(
            f"Fetched {len(blocks)} blocks ({unique_blocks_count} distinct in archives), "
            f"{len(archives)} seasonal archives, and {len(telecons)} teleconnection records from Supabase"
        )

        # 2. Extract features and sequences
        self.logger.info("Extracting tabular feature matrices and GRU sequences from seasonal archives...")
        telecon_ensemble = TeleconnectionEnsemble()
        telecon_ensemble.analog_model.fit(telecons)

        X, y, meta, X_gru, y_gru = FeatureExtractor.extract_from_seasonal_archives(
            blocks_by_id=blocks_by_id,
            seasonal_archives=archives,
            telecon_by_date=telecon_by_date,
            analog_model=telecon_ensemble.analog_model,
            sample_step=7,
        )

        n_samples = len(X)
        distinct_seasons = sorted(list({int(a["season_year"]) for a in archives}))
        class_counts = {int(c): int(np.sum(y == c)) for c in (0, 1, 2, 3)}

        self.logger.info(
            f"Extracted {n_samples} tabular samples and {len(X_gru)} GRU sequence pairs. "
            f"Class distribution: {class_counts}"
        )

        # 4. Supervised GRU Training or Explicit Disabling
        self.logger.info("Evaluating Stage 1 GRU sequence training...")
        telecon_ensemble.fit(telecons, X_seqs=X_gru, y_targets=y_gru)
        self.logger.info(f"Stage 1 GRU status: {telecon_ensemble.gru_status} (enabled={telecon_ensemble.gru_enabled})")

        # 5. Fit Downscaling Ensemble (LightGBM + XGBoost) and Calibrator
        splitter = RollingOriginSplitter()
        splits = list(splitter.split(meta)) if meta else []
        active_split = splits[-1] if splits else None

        test_class_counts: dict[int, int] = {}
        if active_split and active_split.test_indices:
            y_test_tmp = y[active_split.test_indices]
            test_class_counts = {int(c): int(np.sum(y_test_tmp == c)) for c in (0, 1, 2, 3)}

        if n_samples < 10 or len(np.unique(y)) < 2:
            self.logger.warning("Insufficient samples or class diversity in archive. Initializing baseline fallback.")
            downscaling_ensemble = DownscalingEnsemble()
            calibrator = ProbabilityCalibrator()
            metrics = {
                "brier_score_multi": 0.25,
                "log_loss": 1.38,
                "expected_calibration_error": 0.50,
                "status": "INSUFFICIENT_DATA_BASELINE",
            }
        else:
            if active_split and len(active_split.train_indices) > 5:
                X_train = X[active_split.train_indices]
                y_train = y[active_split.train_indices]
                X_val = X[active_split.val_indices] if active_split.val_indices else X_train
                y_val = y[active_split.val_indices] if active_split.val_indices else y_train
                X_test = X[active_split.test_indices] if active_split.test_indices else X_val
                y_test = y[active_split.test_indices] if active_split.test_indices else y_val
                meta_test = [meta[i] for i in active_split.test_indices] if active_split.test_indices else meta
            else:
                X_train, y_train = X, y
                X_val, y_val = X, y
                X_test, y_test = X, y
                meta_test = meta

            self.logger.info("Fitting Stage 2 Downscaling Ensemble (LightGBM + XGBoost)...")
            downscaling_ensemble = DownscalingEnsemble()
            downscaling_ensemble.fit(X_train, y_train)

            self.logger.info("Fitting Stage 3 Probability Calibrator...")
            raw_train_probs = downscaling_ensemble.predict_proba(X_train)
            raw_val_probs = downscaling_ensemble.predict_proba(X_val)
            calibrator = ProbabilityCalibrator(method="auto")
            calibrator.fit(raw_train_probs, y_train, val_raw_probs=raw_val_probs, val_y_true=y_val)

            # Evaluate on held-out test split
            raw_test_probs = downscaling_ensemble.predict_proba(X_test)
            metrics = compute_probabilistic_metrics(y_true=y_test, y_prob=raw_test_probs, meta_rows=meta_test)
            self.logger.info(
                f"Validation Results: Multi-Brier={metrics.get('brier_score_multi')}, "
                f"ECE={metrics.get('expected_calibration_error')}, LogLoss={metrics.get('log_loss')}"
            )

        # 6. Strict Model Readiness Evaluation Gate (Evaluated after training & validation)
        readiness = ModelReadinessEvaluator.evaluate(
            seasons=distinct_seasons,
            blocks_count=unique_blocks_count,
            samples_count=n_samples,
            class_counts=class_counts,
            test_class_counts=test_class_counts,
            val_metrics=metrics,
            gru_status=telecon_ensemble.gru_status,
            require_nationwide_coverage=True,
        )

        self.logger.info(
            f"MODEL READINESS EVALUATION: status={readiness['status']}, "
            f"tier={readiness['model_tier']}, is_production_ready={readiness['is_production_ready']}"
        )
        for r in readiness["reasons"]:
            self.logger.warning(f"  [Readiness Deficiency] {r}")

        metadata = {
            "model_version": "v1.0.0",
            "model_name": "BHUMI-Probabilistic-Downscaling-Engine",
            "trained_at": str(datetime.datetime.now(datetime.timezone.utc)),
            "model_tier": readiness["model_tier"],
            "model_readiness": readiness,
            "training_coverage": {
                "seasons_count": len(distinct_seasons),
                "seasons_list": distinct_seasons,
                "blocks_count": unique_blocks_count,
                "samples_generated": n_samples,
                "class_distribution": class_counts,
                "gru_sequences_count": len(X_gru),
                "gru_status": telecon_ensemble.gru_status,
                "gru_enabled": telecon_ensemble.gru_enabled,
            },
            "architecture": {
                "stage_1": "AnalogEnsemble (Euclidean on ONI/DMI/MJO) + SmallGRU sequence model",
                "stage_2": "LightGBM + XGBoost 2-model ensemble",
                "stage_3": "Platt Scaling / Isotonic Regression with time-based split",
                "stage_4": "Sequential Mann-Kendall & Pettitt Change-Point Detection",
            },
            "feature_version": "v1-terrain-telecon-lags-26feat",
            "feature_names": FEATURE_NAMES,
            "calibration_version": "v1-time-respecting",
            "validation_metrics": metrics,
        }

        if self.dry_run:
            self.logger.info("Dry-run mode active: completely skipping artifact serialization to disk.")
            metadata["dry_run"] = True
            return metadata

        # 6. Save versioned artifacts to pipeline/ml/artifacts/
        downscaling_ensemble.save(self.artifacts_dir)
        calibrator.save(self.artifacts_dir / "calibrator.json")
        telecon_ensemble.gru_model.save(self.artifacts_dir / "gru_weights.json")

        with open(self.artifacts_dir / "metadata.json", "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        self.logger.info("Saved model artifacts and readiness metadata to pipeline/ml/artifacts/")
        return metadata
