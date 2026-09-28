"""BHUMI Seasonal Offline Retraining Job.

Executes rolling-origin seasonal model retraining (Pre-Kharif in May, Pre-Rabi in October):
  - Ingests available real historical seasonal archives
  - Retrains Stage 1 Analog + GRU models
  - Retrains Stage 2 LightGBM + XGBoost downscaling ensemble
  - Retrains Stage 3 Probability calibrator
  - Calculates Brier score, ECE, log loss, ROC-AUC
  - Updates versioned artifacts in pipeline/ml/artifacts/
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pipeline.ml.trainer import SeasonalModelTrainer
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.logger import get_logger


def main() -> None:
    parser = argparse.ArgumentParser(description="BHUMI Seasonal Model Retraining Job")
    parser.add_argument("--dry-run", action="store_true", help="Simulate retraining without saving artifacts")
    args = parser.parse_args()

    logger = get_logger("bhumi.jobs.retrain_models")
    logger.info("Initializing BHUMI Seasonal Retraining Job...")

    config = get_pipeline_config()
    trainer = SeasonalModelTrainer(config=config, dry_run=args.dry_run)

    try:
        metadata = trainer.train_and_evaluate()
        logger.info(
            f"Seasonal retraining completed successfully: version={metadata['model_version']}, "
            f"samples={metadata['training_coverage']['samples_generated']}, "
            f"multi_brier={metadata['validation_metrics'].get('brier_score_multi')}"
        )
    except Exception as e:
        logger.error(f"Retraining failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
