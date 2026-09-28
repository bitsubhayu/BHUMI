"""BHUMI Production Prediction Sync Job.

Executes daily inference across all available blocks and upserts
week_1 through week_4 probabilistic risk outlooks to public.live_predictions.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pipeline.ml.inference import ProductionInferenceEngine
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.logger import get_logger


def main() -> None:
    parser = argparse.ArgumentParser(description="BHUMI Live Prediction Sync Job")
    parser.add_argument("--as-of-date", type=str, default=None, help="Prediction date (YYYY-MM-DD)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without writing to database")
    parser.add_argument("--block-id", type=str, action="append", help="Specific block IDs to process")
    args = parser.parse_args()

    logger = get_logger("bhumi.jobs.predict_sync")
    logger.info("Initializing BHUMI Live Prediction Job...")

    config = get_pipeline_config()
    engine = ProductionInferenceEngine(config=config, dry_run=args.dry_run)

    try:
        result = engine.run_inference(as_of_date=args.as_of_date, block_ids=args.block_id)
        logger.info(
            f"Prediction run completed successfully: {result['predictions_count']} predictions "
            f"for {result['blocks_processed']} blocks loaded into public.live_predictions"
        )
    except Exception as e:
        logger.error(f"Inference job encountered error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
