"""Live weather buffer packing transform.

Formats daily weather observations into rows for public.live_weather_buffer.
Enforces the 90-day rolling window constraint and handles preliminary vs finalized flags.
"""

from __future__ import annotations

import datetime
from typing import Any, Optional

from pipeline.utils.validation import validate_live_weather_buffer


def pack_live_buffer_record(
    block_id: str,
    observation_date: datetime.date | str,
    rainfall_mm: float,
    data_source: str,
    max_temp_c: Optional[float] = None,
    min_temp_c: Optional[float] = None,
    soil_moisture_idx: Optional[float] = None,
    is_preliminary: bool = True,
) -> dict[str, Any]:
    """Format and validate a single daily observation for live_weather_buffer."""
    raw = {
        "block_id": block_id,
        "observation_date": str(observation_date),
        "rainfall_mm": rainfall_mm,
        "max_temp_c": max_temp_c,
        "min_temp_c": min_temp_c,
        "soil_moisture_idx": soil_moisture_idx,
        "data_source": data_source,
        "is_preliminary": is_preliminary,
    }
    return validate_live_weather_buffer(raw)


def filter_within_retention_window(
    records: list[dict[str, Any]],
    retention_days: int = 90,
    reference_date: Optional[datetime.date] = None,
) -> list[dict[str, Any]]:
    """Filter records to retain only those within the rolling retention window."""
    ref = reference_date or datetime.date.today()
    cutoff = ref - datetime.timedelta(days=retention_days)

    retained = []
    for rec in records:
        obs_d = datetime.date.fromisoformat(rec["observation_date"])
        if obs_d >= cutoff:
            retained.append(rec)
    return retained
