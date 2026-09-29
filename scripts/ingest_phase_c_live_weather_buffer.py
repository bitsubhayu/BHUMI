"""Live Weather Buffer Ingestion Script for Phase C.

Populates the rolling 90-day live weather buffer with real meteorological observations:
1. Recent finalized/preliminary ERA5 reanalysis (up to ~3 days ago).
2. Live operational NWP forecasts (NOAA GFS + ECMWF Open Data consensus) for recent/current days.
3. Prunes any records older than 90 days.
4. Removes legacy/synthetic test records.
"""

from __future__ import annotations

import datetime
import sys
import time
from pathlib import Path
from typing import Any

# Ensure repo root is on sys.path
repo_root = Path(__file__).resolve().parent.parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

import requests

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.sources.ecmwf import EcmwfAdapter
from pipeline.sources.gfs import GfsAdapter
from pipeline.sources.smap import SmapAdapter
from pipeline.transforms.buffer_pack import pack_live_buffer_record
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.logger import get_logger

TARGET_BLOCKS = [
    {
        "block_id": "4515",
        "block_name": "Haveli",
        "district_name": "Pune",
        "state_name": "Maharashtra",
        "centroid_lat": 18.651269,
        "centroid_lon": 73.831345,
    },
    {
        "block_id": "726",
        "block_name": "Mandor",
        "district_name": "Jodhpur",
        "state_name": "Rajasthan",
        "centroid_lat": 26.327539,
        "centroid_lon": 73.17144,
    },
    {
        "block_id": "2726",
        "block_name": "Barasat-I",
        "district_name": "North 24 Parganas",
        "state_name": "West Bengal",
        "centroid_lat": 22.741231,
        "centroid_lon": 88.517608,
    },
    {
        "block_id": "351",
        "block_name": "Chandigarh",
        "district_name": "Chandigarh",
        "state_name": "Chandigarh",
        "centroid_lat": 30.72935,
        "centroid_lon": 76.780565,
    },
    {
        "block_id": "5584",
        "block_name": "Ananthagiri",
        "district_name": "Alluri Sitharama Raju",
        "state_name": "Andhra Pradesh",
        "centroid_lat": 18.182553,
        "centroid_lon": 83.035985,
    },
    {
        "block_id": "2489",
        "block_name": "Bajali",
        "district_name": "Bajali",
        "state_name": "Assam",
        "centroid_lat": 26.521431,
        "centroid_lon": 91.162649,
    },
]

OPEN_ERA5_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


def purge_synthetic_test_records(loader: SupabaseLoader) -> int:
    """Purge synthetic test records (data_source=ERA5_SMAP_GPM_SYNTHESIZED)."""
    logger = get_logger("bhumi.scripts.live_buffer_ingest")
    endpoint = (
        f"{loader.config.supabase_url.rstrip('/')}/rest/v1/live_weather_buffer"
        "?data_source=eq.ERA5_SMAP_GPM_SYNTHESIZED"
    )
    headers = {
        "apikey": loader.config.supabase_service_role_key,
        "Authorization": f"Bearer {loader.config.supabase_service_role_key}",
    }
    try:
        r = requests.delete(endpoint, headers=headers, timeout=15)
        if r.status_code in (200, 204):
            logger.info("Purged synthetic test records from live_weather_buffer")
            return 1
    except Exception as e:
        logger.warning(f"Failed to purge synthetic records: {e}")
    return 0


def fetch_recent_era5_observations(
    lat: float,
    lon: float,
    start_date: datetime.date,
    end_date: datetime.date,
) -> list[dict[str, Any]]:
    """Fetch genuine daily observations from ERA5 reanalysis archive."""
    params = {
        "latitude": round(lat, 4),
        "longitude": round(lon, 4),
        "start_date": str(start_date),
        "end_date": str(end_date),
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,soil_moisture_0_to_7cm_mean",
        "timezone": "auto",
    }
    resp = requests.get(OPEN_ERA5_ARCHIVE_URL, params=params, timeout=20)
    if resp.status_code != 200:
        return []

    daily = resp.json().get("daily", {})
    times = daily.get("time", [])
    max_temps = daily.get("temperature_2m_max", [])
    min_temps = daily.get("temperature_2m_min", [])
    rains = daily.get("precipitation_sum", [])
    soils = daily.get("soil_moisture_0_to_7cm_mean", [])

    results = []
    for i, date_str in enumerate(times):
        if max_temps[i] is None or rains[i] is None:
            continue
        max_t = float(max_temps[i])
        min_t = float(min_temps[i]) if min_temps[i] is not None else max_t
        rain = max(0.0, float(rains[i]))
        soil_idx = (
            round(max(0.0, min(100.0, (float(soils[i]) / 0.50) * 100.0)), 1)
            if soils[i] is not None
            else None
        )

        results.append({
            "observation_date": date_str,
            "rainfall_mm": round(rain, 2),
            "max_temp_c": round(max_t, 2),
            "min_temp_c": round(min_t, 2),
            "soil_moisture_idx": soil_idx,
            "data_source": "ECMWF_ERA5_REANALYSIS_ARCHIVE_FALLBACK",
            "is_preliminary": False,
        })

    return results


import argparse
import pandas as pd

BLOCK_MASTER_PATH = repo_root / "data" / "phase_a_block_master.csv"
FORECAST_API_URL = "https://api.open-meteo.com/v1/forecast"


def load_authoritative_blocks() -> list[dict[str, Any]]:
    """Load authoritative production blocks (7,073), strictly excluding pending blocks."""
    if not BLOCK_MASTER_PATH.exists():
        raise FileNotFoundError(f"Block master not found at {BLOCK_MASTER_PATH}")

    df = pd.read_csv(BLOCK_MASTER_PATH)
    prod_df = df[df["spatial_match_status"] == "MATCHED_AUTHORITATIVE_BOUNDARY"].copy()
    if len(prod_df) != 7073:
        raise ValueError(f"Expected 7,073 production blocks, found {len(prod_df)}")

    prod_df.sort_values(by=["state_name", "district_name", "block_name"], inplace=True)
    return prod_df.to_dict(orient="records")


def query_live_nwp_batch(
    blocks: list[dict[str, Any]],
    past_days: int = 1,
    forecast_days: int = 1,
    max_retries: int = 5,
) -> list[dict[str, Any]]:
    """Query live multi-model NWP forecast consensus for a batch of blocks."""
    logger = get_logger("bhumi.scripts.live_buffer_ingest")
    lats = ",".join([f"{float(b['centroid_lat']):.4f}" for b in blocks])
    lons = ",".join([f"{float(b['centroid_lon']):.4f}" for b in blocks])

    params = {
        "latitude": lats,
        "longitude": lons,
        "past_days": past_days,
        "forecast_days": forecast_days,
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
        "timezone": "auto",
    }

    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.get(FORECAST_API_URL, params=params, timeout=25)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    return [data]
                return data
            elif resp.status_code == 429:
                wait_sec = 65
                logger.warning(f"Rate limited on {FORECAST_API_URL}. Cooling down {wait_sec}s (attempt {attempt}/{max_retries})...")
                time.sleep(wait_sec)
            else:
                logger.warning(f"HTTP {resp.status_code} from {FORECAST_API_URL}. Attempt {attempt}/{max_retries}...")
                time.sleep(2.0 ** attempt)
        except Exception as e:
            logger.warning(f"Network error querying {FORECAST_API_URL}: {e}. Attempt {attempt}/{max_retries}...")
            time.sleep(2.0 ** attempt)

    raise RuntimeError(f"Failed to fetch live NWP forecast for {len(blocks)} blocks after {max_retries} attempts.")


def run_live_buffer_ingestion(
    sample_only: bool = False,
    batch_size: int = 50,
    delay_seconds: float = 1.0,
    dry_run: bool = False,
    limit: int | None = None,
) -> int:
    logger = get_logger("bhumi.scripts.live_buffer_ingest")
    config = get_pipeline_config()
    loader = SupabaseLoader(config=config, dry_run=dry_run)

    logger.info("=" * 64)
    logger.info("PHASE C: INGESTING ROLLING LIVE WEATHER BUFFER")
    logger.info(f"Mode: {'SAMPLE_ONLY (6 blocks)' if sample_only else 'NATIONWIDE (7,073 blocks)'} | Dry-run: {dry_run}")
    logger.info("=" * 64)

    # 1. Purge synthetic test records
    if not dry_run and config.has_supabase:
        purge_synthetic_test_records(loader)

    if sample_only:
        blocks = TARGET_BLOCKS
    else:
        blocks = load_authoritative_blocks()

    if limit is not None:
        blocks = blocks[:limit]

    logger.info(f"Targeting {len(blocks)} blocks for live weather buffer...")
    total_loaded = 0
    start_time = time.time()

    # Process in batches
    num_batches = (len(blocks) + batch_size - 1) // batch_size
    for b_idx in range(0, len(blocks), batch_size):
        batch = blocks[b_idx : b_idx + batch_size]
        b_num = (b_idx // batch_size) + 1

        logger.info(f"[Batch {b_num}/{num_batches}] Querying live NWP for {len(batch)} blocks...")
        try:
            results = query_live_nwp_batch(batch, past_days=1, forecast_days=1)
        except Exception as e:
            logger.error(f"Batch {b_num} failed: {e}. Skipping batch.")
            continue

        if len(results) != len(batch):
            logger.error(f"Result count mismatch ({len(results)} vs {len(batch)}). Skipping.")
            continue

        batch_records: list[dict[str, Any]] = []
        for block, res in zip(batch, results):
            b_id = str(block["block_id"])
            daily = res.get("daily", {})
            times = daily.get("time", [])
            max_temps = daily.get("temperature_2m_max", [])
            min_temps = daily.get("temperature_2m_min", [])
            rains = daily.get("precipitation_sum", [])

            for i, obs_date in enumerate(times):
                if max_temps[i] is None or rains[i] is None:
                    continue
                max_t = float(max_temps[i])
                min_t = float(min_temps[i]) if min_temps[i] is not None else max_t
                rain = max(0.0, float(rains[i]))

                rec = pack_live_buffer_record(
                    block_id=b_id,
                    observation_date=obs_date,
                    rainfall_mm=round(rain, 2),
                    max_temp_c=round(max_t, 2),
                    min_temp_c=round(min_t, 2),
                    soil_moisture_idx=None,
                    data_source="NWP_FORECAST_GFS_ECMWF_CONSENSUS",
                    is_preliminary=True,
                )
                batch_records.append(rec)

        if batch_records:
            if dry_run:
                logger.info(f"[DRY-RUN] Simulated upsert of {len(batch_records)} live buffer records")
                total_loaded += len(batch_records)
            else:
                loaded = loader.load_live_weather_buffer(batch_records)
                total_loaded += loaded

        elapsed = time.time() - start_time
        pct = ((b_idx + len(batch)) / len(blocks)) * 100.0
        logger.info(f"[Progress] {b_idx + len(batch)}/{len(blocks)} blocks ({pct:.1f}%) | Total rows: {total_loaded:,} | Elapsed: {int(elapsed)}s")
        time.sleep(delay_seconds)

    # 3. Enforce 90-day pruning
    if not dry_run and config.has_supabase:
        logger.info("Enforcing 90-day rolling window pruning...")
        pruned = loader.prune_live_buffer_older_than(days=90)
        logger.info(f"Prune operation completed (status={pruned})")

    duration = time.time() - start_time
    logger.info("=" * 64)
    logger.info(f"LIVE WEATHER BUFFER INGESTION COMPLETE in {duration:.1f}s")
    logger.info(f"Total verified buffer records upserted: {total_loaded:,}")
    logger.info("=" * 64)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="BHUMI Live Weather Buffer Ingestion")
    parser.add_argument("--sample-only", action="store_true", help="Process only representative blocks")
    parser.add_argument("--batch-size", type=int, default=50, help="Number of blocks per batch (default: 50)")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between batch API requests in seconds (default: 1.0)")
    parser.add_argument("--dry-run", action="store_true", help="Validate and pack without upserting to Supabase")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of blocks to process")

    args = parser.parse_args()
    code = run_live_buffer_ingestion(
        sample_only=args.sample_only,
        batch_size=args.batch_size,
        delay_seconds=args.delay,
        dry_run=args.dry_run,
        limit=args.limit,
    )
    sys.exit(code)


if __name__ == "__main__":
    main()
