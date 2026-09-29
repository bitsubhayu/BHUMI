"""Historical Seasonal Archives Ingestion Script for Phase C.

Populates 2014–2025 seasonal archives (12 seasons per block) using authentic
Copernicus ERA5-Land reanalysis observations for authoritative production blocks.
Strictly adheres to:
- Exactly 214 days per season (1 April to 31 October inclusive)
- smallint[214] compact array storage
- Zero fabricated constants or synthetic substitutions
- (block_id, season_year) uniqueness
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
from pipeline.transforms.seasonal_pack import get_season_dates, pack_seasonal_archive
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


def fetch_multi_season_era5(
    lat: float,
    lon: float,
    start_year: int = 2014,
    end_year: int = 2025,
) -> dict[int, dict[str, list[float]]]:
    """Fetch genuine 214-day observations for multiple seasons in a single batch request."""
    logger = get_logger("bhumi.scripts.historical_ingest")
    start_date = f"{start_year}-04-01"
    end_date = f"{end_year}-10-31"

    params = {
        "latitude": round(lat, 4),
        "longitude": round(lon, 4),
        "start_date": start_date,
        "end_date": end_date,
        "daily": "temperature_2m_max,precipitation_sum,soil_moisture_0_to_7cm_mean",
        "timezone": "auto",
    }

    logger.info(f"Downloading ERA5 reanalysis for ({lat:.2f}, {lon:.2f}) from {start_date} to {end_date}...")
    resp = requests.get(OPEN_ERA5_ARCHIVE_URL, params=params, timeout=40)
    if resp.status_code != 200:
        raise RuntimeError(f"ERA5 archive fetch failed (HTTP {resp.status_code}): {resp.text[:300]}")

    daily = resp.json().get("daily", {})
    time_series = daily.get("time", [])
    if not time_series:
        raise ValueError("ERA5 archive returned empty time series")

    date_to_idx = {d: i for i, d in enumerate(time_series)}
    seasons: dict[int, dict[str, list[float]]] = {}

    for year in range(start_year, end_year + 1):
        season_dates = [str(d) for d in get_season_dates(year)]
        missing = [d for d in season_dates if d not in date_to_idx]
        if missing:
            raise ValueError(f"Missing {len(missing)} dates in ERA5 reanalysis for season {year}")

        indices = [date_to_idx[d] for d in season_dates]
        raw_temps = [daily["temperature_2m_max"][i] for i in indices]
        raw_rains = [daily["precipitation_sum"][i] for i in indices]
        raw_soils = [daily["soil_moisture_0_to_7cm_mean"][i] for i in indices]

        if any(t is None for t in raw_temps) or any(r is None for r in raw_rains) or any(s is None for s in raw_soils):
            raise ValueError(f"Incomplete meteorological observations found in season {year}")

        max_temps = [float(t) for t in raw_temps]
        rains = [round(max(0.0, float(r)), 2) for r in raw_rains]
        soil_indices = [round(max(0.0, min(100.0, (float(s) / 0.50) * 100.0)), 1) for s in raw_soils]

        # Verify real physical variance
        if len(set(max_temps)) < 15:
            raise ValueError(f"Suspiciously low temperature variance in season {year}")

        seasons[year] = {
            "rainfall_series": rains,
            "max_temp_series": max_temps,
            "soil_moisture_series": soil_indices,
        }

    return seasons


def main() -> None:
    logger = get_logger("bhumi.scripts.historical_ingest")
    config = get_pipeline_config()
    loader = SupabaseLoader(config=config, dry_run=False)

    logger.info("=" * 64)
    logger.info("PHASE C: INGESTING 2014–2025 SEASONAL ARCHIVES")
    logger.info(f"Target blocks: {len(TARGET_BLOCKS)} authoritative production blocks")
    logger.info("=" * 64)

    all_records: list[dict[str, Any]] = []

    for block in TARGET_BLOCKS:
        b_id = block["block_id"]
        b_name = block["block_name"]
        lat = block["centroid_lat"]
        lon = block["centroid_lon"]

        logger.info(f"Processing block {b_id} ({b_name}, {block['state_name']}) at ({lat:.2f}, {lon:.2f})...")
        seasons_data = fetch_multi_season_era5(lat, lon, start_year=2014, end_year=2025)

        for year, s_data in sorted(seasons_data.items()):
            packed_row = pack_seasonal_archive(
                block_id=b_id,
                season_year=year,
                rainfall_series=s_data["rainfall_series"],
                max_temp_series=s_data["max_temp_series"],
                soil_moisture_series=s_data["soil_moisture_series"],
            )
            all_records.append(packed_row)

        time.sleep(1.0)  # Gentle rate limiting between blocks

    logger.info(f"Packing completed: {len(all_records)} seasonal archive records ready for loading")
    loaded_count = loader.load_seasonal_archives(all_records)
    logger.info("=" * 64)
    logger.info(f"SUCCESS: Ingested {loaded_count} seasonal archive records into public.seasonal_archives")
    logger.info("=" * 64)


if __name__ == "__main__":
    main()
