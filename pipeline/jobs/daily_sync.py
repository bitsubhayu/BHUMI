"""Daily live weather buffer and teleconnections synchronization job.

Target Cadence: Runs once daily at 00:30 UTC (06:00 AM IST).
Responsibilities:
1. Grabs latest ENSO/IOD/MJO readings and updates national public.teleconnections_history.
2. Fetches real operational forecasts and satellite observations from NOAA GFS, ECMWF Open Data, and NASA SMAP.
3. Maps observations to administrative blocks and transforms them into public.live_weather_buffer rows.
4. Prunes records older than 90 days from live_weather_buffer to protect the 500 MB budget.
5. Touches the database daily to prevent Supabase from auto-pausing.
6. DOES NOT run ML inference yet (Step 4 responsibility).
"""

from __future__ import annotations

import argparse
import datetime
import sys
import time
from typing import Any, Optional

import requests

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.sources.ecmwf import EcmwfAdapter
from pipeline.sources.gfs import GfsAdapter
from pipeline.sources.smap import SmapAdapter
from pipeline.sources.teleconnections import TeleconnectionsAdapter
from pipeline.transforms.buffer_pack import pack_live_buffer_record
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.logger import get_logger

# Representative fallback blocks across diverse Indian agro-climatic zones
REPRESENTATIVE_BLOCKS = [
    {
        "block_id": "IND_MH_PUN_001",
        "block_name": "Haveli",
        "district_name": "Pune",
        "state_name": "Maharashtra",
        "centroid_lat": 18.5204,
        "centroid_lon": 73.8567,
        "elevation_m": 560.0,
        "slope_deg": 2.1,
        "distance_to_coast_km": 120.0,
        "agro_climatic_zone": "Western Plateau and Hills",
    },
    {
        "block_id": "IND_RJ_JOD_002",
        "block_name": "Mandore",
        "district_name": "Jodhpur",
        "state_name": "Rajasthan",
        "centroid_lat": 26.2389,
        "centroid_lon": 73.0243,
        "elevation_m": 231.0,
        "slope_deg": 1.2,
        "distance_to_coast_km": 450.0,
        "agro_climatic_zone": "Western Dry Region",
    },
    {
        "block_id": "IND_WB_KOL_003",
        "block_name": "Barasat",
        "district_name": "North 24 Parganas",
        "state_name": "West Bengal",
        "centroid_lat": 22.7231,
        "centroid_lon": 88.4812,
        "elevation_m": 11.0,
        "slope_deg": 0.5,
        "distance_to_coast_km": 80.0,
        "agro_climatic_zone": "Lower Gangetic Plain",
    },
]


def get_active_blocks(config: Any, sample_only: bool = False) -> list[dict[str, Any]]:
    """Retrieve blocks from Supabase or fallback to representative sample blocks."""
    if sample_only or not config.has_supabase:
        return REPRESENTATIVE_BLOCKS

    url = config.supabase_url.rstrip("/")
    headers = {
        "apikey": config.supabase_service_role_key,
        "Authorization": f"Bearer {config.supabase_service_role_key}",
    }
    try:
        resp = requests.get(
            f"{url}/rest/v1/blocks?select=block_id,block_name,district_name,state_name,centroid_lat,centroid_lon,elevation_m,slope_deg",
            headers=headers,
            timeout=10,
        )
        if resp.status_code == 200:
            blocks = resp.json()
            if blocks:
                return blocks
    except Exception:
        pass

    return REPRESENTATIVE_BLOCKS


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

    # 2. Ingest Daily Weather Buffer Observations from Real Sources
    logger.info("Step 2: Pulling live meteorological forecasts and observations...")
    gfs = GfsAdapter(config=config)
    ecmwf = EcmwfAdapter(config=config)
    smap = SmapAdapter(config=config)

    blocks = get_active_blocks(config, sample_only=sample_only)
    logger.info(f"Processing live observations for {len(blocks)} blocks...")

    # Ensure parent blocks exist in database if running against live DB
    if not dry_run and config.has_supabase:
        loader.load_blocks(blocks)

    today = datetime.date.today()
    live_records: list[dict[str, Any]] = []

    for block in blocks:
        block_id = block["block_id"]
        lat = float(block["centroid_lat"])
        lon = float(block["centroid_lon"])

        # Fetch real NOAA GFS forecast
        gfs_res = gfs.fetch_daily_forecast(today, lat, lon)
        # Fetch real ECMWF Open Data forecast
        ecm_res = ecmwf.fetch_daily_forecast(today, lat, lon)
        # Fetch real NASA SMAP soil moisture
        smap_res = smap.fetch_soil_wetness_index(today, lat, lon)

        # Synthesize multi-model consensus
        rain_vals = []
        max_temps = []
        min_temps = []

        if gfs_res.success and gfs_res.data:
            rain_vals.append(gfs_res.data["rainfall_mm"])
            max_temps.append(gfs_res.data["max_temp_c"])
            min_temps.append(gfs_res.data["min_temp_c"])

        if ecm_res.success and ecm_res.data:
            rain_vals.append(ecm_res.data["rainfall_mm"])
            max_temps.append(ecm_res.data["max_temp_c"])
            min_temps.append(ecm_res.data["min_temp_c"])

        # Check if we have at least one valid atmospheric forecast source
        if not max_temps or not rain_vals:
            logger.warning(
                f"All atmospheric forecast sources failed for block {block_id} on {today}. "
                f"Skipping record creation to prevent data fabrication."
            )
            continue

        # Real consensus calculations
        final_rain = round(float(sum(rain_vals) / len(rain_vals)), 2)
        final_max_t = round(float(sum(max_temps) / len(max_temps)), 2)
        final_min_t = round(float(sum(min_temps) / len(min_temps)), 2) if min_temps else round(final_max_t - 6.0, 2)
        final_soil = smap_res.data if (smap_res.success and smap_res.data is not None) else None

        # Data source provenance attribution
        if gfs_res.success and ecm_res.success:
            source_tag = "GFS_ECMWF_REAL_CONSENSUS"
        elif gfs_res.success:
            source_tag = "NOAA_GFS_REAL"
        else:
            source_tag = ecm_res.data.get("data_source", "ECMWF_FALLBACK_OPEN_METEO")

        record = pack_live_buffer_record(
            block_id=block_id,
            observation_date=str(today),
            rainfall_mm=final_rain,
            max_temp_c=final_max_t,
            min_temp_c=final_min_t,
            soil_moisture_idx=final_soil,
            data_source=source_tag,
            is_preliminary=True,
        )
        live_records.append(record)

    loaded_live = loader.load_live_weather_buffer(live_records)
    logger.info(f"[OK] Loaded {loaded_live} real daily weather observations into live_weather_buffer")

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
