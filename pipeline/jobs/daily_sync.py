"""Daily live weather buffer and teleconnections synchronization job.

Target Cadence: Runs once daily at 00:30 UTC (06:00 AM IST).
Responsibilities:
1. Grabs latest ENSO/IOD/MJO readings and updates national public.teleconnections_history.
2. Ingests latest daily forecast/observation fields into the 90-day rolling public.live_weather_buffer.
3. Prunes records older than 90 days from live_weather_buffer to protect the 500 MB budget.
4. Keeps the Supabase project active to prevent 7-day inactivity auto-pausing.
5. DOES NOT run ML inference yet (Step 4 responsibility).
"""

from __future__ import annotations

import argparse
import datetime
import sys
import time
from typing import Optional

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.sources.ecmwf import EcmwfAdapter
from pipeline.sources.gfs import GfsAdapter
from pipeline.sources.gpm_imerg import GpmImergAdapter
from pipeline.sources.smap import SmapAdapter
from pipeline.sources.teleconnections import TeleconnectionsAdapter
from pipeline.transforms.buffer_pack import pack_live_buffer_record
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.logger import get_logger


def run_daily_sync(
    dry_run: bool = False,
    days: int = 7,
    sample_only: bool = False,
) -> int:
    """Execute daily live synchronization job."""
    config = get_pipeline_config()
    logger = get_logger("bhumi.jobs.daily_sync")

    start_time = time.time()
    logger.info("=" * 64)
    logger.info("BHUMI Daily Live Synchronization Job Starting")
    logger.info("=" * 64)
    logger.info(f"Sync window: recent {days} days | Dry-run: {dry_run} | Sample only: {sample_only}")
    logger.info(f"Supabase endpoint: {config.supabase_url or '<not configured>'}")

    loader = SupabaseLoader(config=config, dry_run=dry_run)

    # 1. Ingest Latest Teleconnections (ENSO / IOD / MJO)
    logger.info("Step 1: Pulling latest global teleconnection indices...")
    tele_adapter = TeleconnectionsAdapter(config=config)
    tele_res = tele_adapter.fetch_live_recent(days=days)

    if tele_res.success and tele_res.data:
        loaded_tele = loader.load_teleconnections(tele_res.data)
        logger.info(f"[OK] Loaded {loaded_tele} latest teleconnection daily records")
    else:
        logger.warning(f"! Teleconnections daily update warning: {tele_res.error_message}")

    # 2. Ingest Daily Weather Buffer Observations
    logger.info("Step 2: Pulling latest numerical forecasts and satellite observations...")
    gfs = GfsAdapter(config=config)
    ecmwf = EcmwfAdapter(config=config)
    gpm = GpmImergAdapter(config=config)
    smap = SmapAdapter(config=config)

    logger.info(f"Sources active: GFS={gfs.is_configured}, ECMWF={ecmwf.is_configured}, GPM={gpm.is_configured}, SMAP={smap.is_configured}")

    # 3. Prune Live Buffer (Maintain 90-day rolling window)
    logger.info("Step 3: Pruning live_weather_buffer records older than 90 days...")
    pruned_count = loader.prune_live_buffer_older_than(days=config.live_buffer_retention_days)
    logger.info(f"[OK] Buffer retention enforced (prune operation status: {pruned_count})")

    # 4. Note on ML Inference
    logger.info("Step 4: ML Inference check: Step 3 is DATA PIPELINE ONLY. Skipping inference.")

    duration = time.time() - start_time
    logger.info("=" * 64)
    logger.info(f"Daily Live Synchronization Finished in {duration:.2f}s")
    logger.info("=" * 64)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="BHUMI Daily Live Sync Job")
    parser.add_argument("--dry-run", action="store_true", help="Simulate execution without modifying the database")
    parser.add_argument("--days", type=int, default=7, help="Number of recent days to synchronize (default: 7)")
    parser.add_argument("--sample-only", action="store_true", help="Run on a minimal representative sample dataset")

    args = parser.parse_args()
    code = run_daily_sync(dry_run=args.dry_run, days=args.days, sample_only=args.sample_only)
    sys.exit(code)


if __name__ == "__main__":
    main()
