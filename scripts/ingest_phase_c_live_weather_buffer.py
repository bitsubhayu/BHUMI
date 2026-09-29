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


def main() -> None:
    logger = get_logger("bhumi.scripts.live_buffer_ingest")
    config = get_pipeline_config()
    loader = SupabaseLoader(config=config, dry_run=False)

    logger.info("=" * 64)
    logger.info("PHASE C: INGESTING ROLLING LIVE WEATHER BUFFER")
    logger.info("=" * 64)

    # 1. Purge synthetic test records
    purge_synthetic_test_records(loader)

    # 2. Ingest recent 30-day observations for target blocks
    today = datetime.date.today()
    era5_end = today - datetime.timedelta(days=3)
    era5_start = today - datetime.timedelta(days=30)

    gfs = GfsAdapter(config=config)
    ecmwf = EcmwfAdapter(config=config)
    smap = SmapAdapter(config=config)

    all_buffer_records: list[dict[str, Any]] = []

    for block in TARGET_BLOCKS:
        b_id = block["block_id"]
        lat = block["centroid_lat"]
        lon = block["centroid_lon"]

        logger.info(f"Fetching real observations for block {b_id} ({block['block_name']})...")

        # 2a. Historical ERA5 portion (days -30 to -3)
        era5_obs = fetch_recent_era5_observations(lat, lon, era5_start, era5_end)
        for obs in era5_obs:
            rec = pack_live_buffer_record(
                block_id=b_id,
                observation_date=obs["observation_date"],
                rainfall_mm=obs["rainfall_mm"],
                max_temp_c=obs["max_temp_c"],
                min_temp_c=obs["min_temp_c"],
                soil_moisture_idx=obs["soil_moisture_idx"],
                data_source=obs["data_source"],
                is_preliminary=False,
            )
            all_buffer_records.append(rec)

        # 2b. Live operational NWP portion (days -2, -1, 0)
        for offset in (2, 1, 0):
            target_d = today - datetime.timedelta(days=offset)
            gfs_res = gfs.fetch_daily_forecast(target_d, lat, lon)
            ecm_res = ecmwf.fetch_daily_forecast(target_d, lat, lon)
            smap_res = smap.fetch_soil_wetness_index(target_d, lat, lon)

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

            if not rain_vals or not max_temps:
                continue

            final_rain = round(sum(rain_vals) / len(rain_vals), 2)
            final_max = round(sum(max_temps) / len(max_temps), 2)
            final_min = round(sum(min_temps) / len(min_temps), 2)
            final_soil = smap_res.data if (smap_res.success and smap_res.data is not None) else None

            rec = pack_live_buffer_record(
                block_id=b_id,
                observation_date=str(target_d),
                rainfall_mm=final_rain,
                max_temp_c=final_max,
                min_temp_c=final_min,
                soil_moisture_idx=final_soil,
                data_source="GFS_ECMWF_REAL_CONSENSUS",
                is_preliminary=True,
            )
            all_buffer_records.append(rec)

    logger.info(f"Total buffer records packed: {len(all_buffer_records)}")
    loaded = loader.load_live_weather_buffer(all_buffer_records)
    logger.info(f"Upserted {loaded} real observations into public.live_weather_buffer")

    # 3. Enforce 90-day pruning
    logger.info("Enforcing 90-day rolling window pruning...")
    pruned = loader.prune_live_buffer_older_than(days=90)
    logger.info(f"Prune operation completed (status={pruned})")

    logger.info("=" * 64)
    logger.info("PHASE C LIVE WEATHER BUFFER INGESTION COMPLETE")
    logger.info("=" * 64)


if __name__ == "__main__":
    main()
