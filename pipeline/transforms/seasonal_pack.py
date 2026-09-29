"""Seasonal archive packing transform.

Packs 214 daily meteorological values (1 April – 31 October) into compact smallint[214] arrays
conforming strictly to public.seasonal_archives table schema and Supabase 500 MB budget.
"""

from __future__ import annotations

import datetime
from typing import Any, Sequence

from pipeline.transforms.weather_state import classify_monsoon_states
from pipeline.utils.validation import validate_seasonal_archive


def get_season_dates(year: int) -> list[datetime.date]:
    """Generate the exact 214 dates for a season (1 April to 31 October)."""
    start = datetime.date(year, 4, 1)
    end = datetime.date(year, 10, 31)
    dates = []
    cur = start
    while cur <= end:
        dates.append(cur)
        cur += datetime.timedelta(days=1)
    if len(dates) != 214:
        raise ValueError(f"Season date calculation error: expected 214 days, got {len(dates)}")
    return dates


def pack_seasonal_archive(
    block_id: str,
    season_year: int,
    rainfall_series: Sequence[float],
    max_temp_series: Sequence[float],
    soil_moisture_series: Sequence[float],
) -> dict[str, Any]:
    """Transform daily series into a validated seasonal_archives row.
    
    Parameters:
      block_id: LGD administrative block code.
      season_year: Calendar year (1950 to 2100).
      rainfall_series: 214 daily rainfall values in mm.
      max_temp_series: 214 daily maximum temperatures in °C.
      soil_moisture_series: 214 daily soil wetness index values (0-100).
      
    Returns:
      Dictionary ready for Supabase upsert.
    """
    if len(rainfall_series) != 214:
        raise ValueError(f"rainfall_series length must be 214, got {len(rainfall_series)}")
    if len(max_temp_series) != 214:
        raise ValueError(f"max_temp_series length must be 214, got {len(max_temp_series)}")
    if len(soil_moisture_series) != 214:
        raise ValueError(f"soil_moisture_series length must be 214, got {len(soil_moisture_series)}")

    dates = get_season_dates(season_year)

    # 1. Scale rainfall: mm * 10, clamped to smallint
    rainfall_x10 = [max(0, min(32767, round(val * 10))) for val in rainfall_series]

    # 2. Scale max temp: °C * 10, clamped to [-500, 700]
    max_temp_x10 = [max(-500, min(700, round(val * 10))) for val in max_temp_series]

    # 3. Scale soil moisture: 0 to 100 integer index
    soil_moisture_idx = [max(0, min(100, round(val))) for val in soil_moisture_series]

    # 4. Classify weather state codes
    weather_state_codes = classify_monsoon_states(dates, rainfall_series)

    raw_record = {
        "block_id": block_id,
        "season_year": season_year,
        "season_start_date": f"{season_year}-04-01",
        "season_end_date": f"{season_year}-10-31",
        "rainfall_x10": rainfall_x10,
        "max_temp_x10": max_temp_x10,
        "soil_moisture_idx": soil_moisture_idx,
        "weather_state_code": weather_state_codes,
    }
    return validate_seasonal_archive(raw_record)


def unpack_seasonal_archive(record: dict[str, Any]) -> dict[str, Any]:
    """Unpack a packed seasonal_archives row back into floating-point daily series.

    Returns:
      Dictionary with:
        - dates: list of 214 datetime.date objects
        - rainfall_mm: list of 214 float values (scaled by 0.1)
        - max_temp_c: list of 214 float values (scaled by 0.1)
        - soil_moisture_idx: list of 214 float values
        - weather_state_code: list of 214 int values
    """
    season_year = int(record["season_year"])
    dates = get_season_dates(season_year)

    rainfall_mm = [round(val / 10.0, 1) for val in record["rainfall_x10"]]
    max_temp_c = [round(val / 10.0, 1) for val in record["max_temp_x10"]]
    soil_moisture_idx = [float(val) for val in record["soil_moisture_idx"]]
    weather_state_code = [int(val) for val in record["weather_state_code"]]

    return {
        "dates": dates,
        "rainfall_mm": rainfall_mm,
        "max_temp_c": max_temp_c,
        "soil_moisture_idx": soil_moisture_idx,
        "weather_state_code": weather_state_code,
    }
