"""BHUMI Production Prediction Sync Job.

Executes daily inference across all available blocks and upserts
week_1 through week_4 probabilistic risk outlooks to public.live_predictions.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Optional

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pipeline.ml.inference import ProductionInferenceEngine
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.logger import get_logger


def run_predict_sync(
    as_of_date: Optional[str] = None,
    dry_run: bool = False,
    block_ids: Optional[list[str]] = None,
    allow_experimental: bool = False,
) -> dict[str, Any]:
    """Execute live prediction sync and enforce retention pruning."""
    logger = get_logger("bhumi.jobs.predict_sync")
    logger.info("Initializing BHUMI Live Prediction Job...")

    config = get_pipeline_config()
    engine = ProductionInferenceEngine(config=config, dry_run=dry_run)

    try:
        result = engine.run_inference(
            as_of_date=as_of_date,
            block_ids=block_ids,
            allow_experimental=allow_experimental,
        )

        if not result.get("success", False):
            if result.get("status") == "BLOCKED_BY_READINESS_GATE":
                logger.warning(
                    f"PREDICTION BLOCKED BY READINESS: {result.get('error')}. "
                    f"Model readiness status: {result.get('readiness_status')}. "
                    f"Authoritative live_predictions table remains untouched."
                )
            else:
                logger.error(f"PIPELINE FAILURE: Prediction failed: {result.get('error')}")
            return result

        logger.info(
            f"PREDICTION SUCCESS: {result['predictions_count']} predictions "
            f"for {result['blocks_processed']} blocks loaded into public.live_predictions "
            f"(tier: {result.get('model_tier')})"
        )

        # Enforce bounded prediction retention to protect 500 MB budget
        if not dry_run and config.has_supabase:
            logger.info("Enforcing live_predictions rolling retention window (60 days)...")
            pruned = engine.loader.prune_live_predictions_older_than(days=60)
            logger.info(f"Prediction retention enforced (prune operation status: {pruned})")

        return result
    except Exception as e:
        logger.error(f"PIPELINE FAILURE: Inference job encountered error: {e}", exc_info=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="BHUMI Live Prediction Sync Job")
    parser.add_argument("--as-of-date", type=str, default=None, help="Prediction date (YYYY-MM-DD)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without writing to database")
    parser.add_argument("--block-id", type=str, action="append", help="Specific block IDs to process")
    parser.add_argument("--allow-experimental", action="store_true", help="Allow running with experimental/unready model")
    args = parser.parse_args()

    try:
        res = run_predict_sync(
            as_of_date=args.as_of_date,
            dry_run=args.dry_run,
            block_ids=args.block_id,
            allow_experimental=args.allow_experimental,
        )
        if not res.get("success", False) and res.get("status") != "BLOCKED_BY_READINESS_GATE":
            sys.exit(1)
    except Exception:
        sys.exit(1)


if __name__ == "__main__":
    main()
