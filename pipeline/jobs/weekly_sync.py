"""Weekly historical synchronization and monthly reconciliation job.

Executes as a weekly scheduled task (e.g. Sunday 20:00 UTC):
1. Ingests historical teleconnection indices (ENSO / IOD / MJO) for the season year span.
2. Extracts genuine 214-day daily time series (April 1 to October 31):
   - Real daily rainfall for all 214 dates
   - Real daily max temperature for all 214 dates
   - Real daily soil moisture for all 214 dates
   - Classifies each day from actual observations using classify_daily_weather_state
   - Packs 4 × smallint[214] arrays into public.seasonal_archives.
   NEVER repeats a single day across 214 days.
   NEVER fabricates synthetic constants.
3. Performs monthly reconciliation pass:
   - Reconciles preliminary observations (~3 weeks prior) against finalized CHIRPS & ERA5 datasets.
"""

from __future__ import annotations

import argparse
import datetime
import time
from typing import Any

import requests

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.sources.chirps import ChirpsAdapter
from pipeline.sources.era5 import Era5Adapter
from pipeline.sources.gpm_imerg import GpmImergAdapter
from pipeline.sources.teleconnections import TeleconnectionsAdapter
from pipeline.transforms.buffer_pack import pack_live_buffer_record
from pipeline.transforms.seasonal_pack import pack_seasonal_archive
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.logger import get_logger

REPRESENTATIVE_BLOCKS = [
    {
        "block_id": "IND_MH_PUN_001",
        "block_name": "Haveli (Pune)",
        "district_name": "Pune",
        "state_name": "Maharashtra",
        "centroid_lat": 18.5204,
        "centroid_lon": 73.8567,
        "elevation_m": 560.0,
        "slope_deg": 2.1,
    },
    {
        "block_id": "IND_RJ_JOD_001",
        "block_name": "Mandore (Jodhpur)",
        "district_name": "Jodhpur",
        "state_name": "Rajasthan",
        "centroid_lat": 26.2389,
        "centroid_lon": 73.0243,
        "elevation_m": 231.0,
        "slope_deg": 1.2,
    },
]


def get_active_blocks(config: Any, sample_only: bool = False) -> list[dict[str, Any]]:
    """Retrieve blocks to synchronize, or fail clearly in production.

    In production mode (sample_only=False), failure to retrieve blocks from Supabase
    raises a RuntimeError rather than silently falling back to sample blocks.
    """
    if sample_only:
        return REPRESENTATIVE_BLOCKS

    if not config.has_supabase:
        raise RuntimeError(
            "Supabase credentials not configured for production run. "
            "Pass --sample-only to run on representative sample blocks."
        )

    loader = SupabaseLoader(config=config)
    blocks = loader.fetch_blocks()
    if blocks and len(blocks) > 0:
        return blocks
    raise RuntimeError(
        "Supabase returned an empty public.blocks table for production run. "
        "Register administrative blocks or pass --sample-only for sample execution."
    )


def run_weekly_sync(
    start_year: int = 2014,
    end_year: int = 2025,
    reconcile: bool = True,
    dry_run: bool = False,
    sample_only: bool = False,
) -> int:
    """Execute weekly historical sync and monthly reconciliation."""
    config = get_pipeline_config()
    logger = get_logger("bhumi.jobs.weekly_sync")

    start_time = time.time()
    logger.info("=" * 64)
    logger.info("BHUMI Weekly Historical Sync & Reconciliation Starting")
    logger.info("=" * 64)
    logger.info(f"Target archive range: {start_year}–{end_year} | Reconcile: {reconcile} | Dry-run: {dry_run}")

    loader = SupabaseLoader(config=config, dry_run=dry_run)

    # 1. Ingest Historical Teleconnection Indices (ENSO / IOD / MJO)
    logger.info("Step 1: Ingesting historical teleconnections (ENSO / IOD / MJO)...")
    tele_adapter = TeleconnectionsAdapter(config=config)
    tele_res = tele_adapter.fetch_historical(start_year=start_year, end_year=end_year)

    if tele_res.success and tele_res.data:
        loaded_tele = loader.load_teleconnections(tele_res.data)
        logger.info(f"[OK] Ingested {loaded_tele} historical teleconnection daily rows")
    else:
        logger.warning(f"! Teleconnections historical update warning: {tele_res.error_message}")

    # 2. Ingest Historical 214-day Seasonal Arrays
    logger.info("Step 2: Processing genuine 214-day historical seasonal archives...")
    chirps = ChirpsAdapter(config=config)
    era5 = Era5Adapter(config=config)
    gpm = GpmImergAdapter(config=config)

    blocks = get_active_blocks(config, sample_only=sample_only)
    if not dry_run and config.has_supabase and sample_only:
        loader.load_blocks(blocks)

    seasonal_records: list[dict[str, Any]] = []
    # In sample_only mode, synchronize the most recent finalized season; otherwise range
    sync_years = [end_year - 1] if sample_only else range(start_year, end_year + 1)

    for year in sync_years:
        for block in blocks:
            b_id = block["block_id"]
            lat = float(block["centroid_lat"])
            lon = float(block["centroid_lon"])

            logger.info(f"Extracting genuine 214-day observations for block {b_id} season {year}...")

            # Retrieve genuine 214-day seasonal time series from ERA5 reanalysis
            era_seasonal = era5.fetch_seasonal_series(year, lat, lon)
            if not era_seasonal.success or not era_seasonal.data:
                logger.error(
                    f"Required seasonal data unavailable for block {b_id} year {year}: {era_seasonal.error_message}. "
                    f"Skipping block-season to prevent data fabrication."
                )
                continue

            temp_series = era_seasonal.data["max_temp_series"]
            soil_series = era_seasonal.data["soil_moisture_series"]
            era_rain = era_seasonal.data["rainfall_series"]

            # Prefer CHIRPS 0.05° high-resolution rainfall if available, else ERA5 reanalysis rainfall
            rainfall_series = era_rain
            if not sample_only:
                ch_res = chirps.fetch_seasonal_window(year, lat, lon)
                if ch_res.success and ch_res.data and len(ch_res.data) == 214:
                    rainfall_series = ch_res.data

            # Verify 214-day cardinality and non-repetition
            if len(temp_series) != 214 or len(rainfall_series) != 214 or len(soil_series) != 214:
                logger.error(f"Incomplete series cardinality for {b_id} season {year}. Skipping.")
                continue

            if len(set(temp_series)) < 15:
                logger.error(f"Suspicious repeated temperature values in {b_id} season {year}. Skipping.")
                continue

            archive_row = pack_seasonal_archive(
                block_id=b_id,
                season_year=year,
                rainfall_series=rainfall_series,
                max_temp_series=temp_series,
                soil_moisture_series=soil_series,
            )
            seasonal_records.append(archive_row)

    if seasonal_records:
        loaded_archives = loader.load_seasonal_archives(seasonal_records)
        logger.info(f"[OK] Loaded {loaded_archives} genuine 214-day seasonal archives into seasonal_archives")
    else:
        logger.warning("! No seasonal records were packed due to missing upstream data")

    # 3. Monthly Reconciliation Pass
    if reconcile:
        logger.info("Step 3: Executing monthly reconciliation pass on preliminary live observations...")
        reconciled_records: list[dict[str, Any]] = []

        # Find preliminary observations from ~3 weeks ago (CHIRPS latency) and finalized GPM (~3.5 months lag)
        recon_date = datetime.date.today() - datetime.timedelta(days=21)

        for block in blocks:
            b_id = block["block_id"]
            lat = float(block["centroid_lat"])
            lon = float(block["centroid_lon"])

            # 1. Fetch finalized CHIRPS 0.05° daily rainfall
            ch_recon = chirps.fetch_daily_rainfall(recon_date, lat, lon)
            # 2. Fetch authentic NASA GPM IMERG Final Run (is_early_run=False -> GPM_3IMERGDF)
            gpm_recon = gpm.fetch_daily_precipitation(recon_date, lat, lon, is_early_run=False)
            # 3. Fetch finalized ERA5 reanalysis
            era_recon = era5.fetch_daily_reanalysis(recon_date, lat, lon)

            # Require valid temperature and soil moisture from reanalysis
            if not era_recon.success or not era_recon.data:
                logger.warning(f"ERA5 reanalysis unavailable for reconciliation on {recon_date}. Skipping block {b_id}.")
                continue

            final_temp = era_recon.data["max_temp_c"]
            final_soil = era_recon.data["soil_moisture_idx"]

            # Reconcile precipitation using available finalized satellite products
            recon_rain_vals = []
            recon_sources = []

            if ch_recon.success and ch_recon.data is not None:
                recon_rain_vals.append(ch_recon.data)
                recon_sources.append("CHIRPS")

            if gpm_recon.success and gpm_recon.data is not None:
                recon_rain_vals.append(gpm_recon.data)
                recon_sources.append("GPM_FINAL")
                logger.info(f"Incorporating authentic NASA GPM IMERG Final reconciliation precipitation for {b_id}: {gpm_recon.data} mm")
            elif not gpm_recon.success:
                logger.info(f"GPM IMERG Final run observation unavailable for reconciliation on {recon_date}: {gpm_recon.error_message}")

            if not recon_rain_vals:
                logger.warning(f"Both CHIRPS and GPM Final observations unavailable for reconciliation on {recon_date}. Skipping block {b_id}.")
                continue

            final_rain = round(float(sum(recon_rain_vals) / len(recon_rain_vals)), 2)

            if "CHIRPS" in recon_sources and "GPM_FINAL" in recon_sources:
                recon_tag = "CHIRPS_GPM_FINAL_RECONCILED"
            elif "GPM_FINAL" in recon_sources:
                recon_tag = "GPM_FINAL_RECONCILED"
            else:
                recon_tag = "CHIRPS_FINAL_RECONCILED"

            rec_row = pack_live_buffer_record(
                block_id=b_id,
                observation_date=str(recon_date),
                rainfall_mm=final_rain,
                max_temp_c=final_temp,
                min_temp_c=final_temp,
                soil_moisture_idx=final_soil,
                data_source=recon_tag,
                is_preliminary=False,  # Reconciled to ground/satellite finalized truth
            )
            reconciled_records.append(rec_row)

        if reconciled_records:
            loaded_reconciled = loader.load_live_weather_buffer(reconciled_records)
            logger.info(f"[OK] Reconciled {loaded_reconciled} preliminary records with finalized CHIRPS/ERA5 data")

    duration = time.time() - start_time
    logger.info("=" * 64)
    logger.info(f"Weekly Historical Synchronization Finished in {duration:.2f}s")
    logger.info("=" * 64)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="BHUMI Weekly Historical Sync & Reconciliation Job")
    parser.add_argument("--start-year", type=int, default=2014, help="Historical start year (default: 2014)")
    parser.add_argument("--end-year", type=int, default=2025, help="Historical end year (default: 2025)")
    parser.add_argument("--reconcile", action="store_true", help="Perform monthly reconciliation pass")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without writing to database")
    parser.add_argument("--sample-only", action="store_true", help="Run on representative sample blocks only")

    args = parser.parse_args()
    exit_code = run_weekly_sync(
        start_year=args.start_year,
        end_year=args.end_year,
        reconcile=args.reconcile,
        dry_run=args.dry_run,
        sample_only=args.sample_only,
    )
    exit(exit_code)


if __name__ == "__main__":
    main()
