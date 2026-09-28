"""Data integrity validation for BHUMI ingestion pipeline.

Validates date ranges, array cardinality (strictly 214 days), value bounds,
block IDs, and ensures records conform strictly to Supabase table constraints.
"""

from __future__ import annotations

import datetime
from typing import Any, Sequence


class ValidationError(ValueError):
    """Raised when pipeline records fail domain integrity checks."""
    pass


def validate_date_string(date_str: str) -> datetime.date:
    """Validate that a date string is in YYYY-MM-DD format."""
    if not isinstance(date_str, str):
        raise ValidationError(f"Date must be a string, got {type(date_str).__name__}")
    try:
        return datetime.date.fromisoformat(date_str)
    except ValueError as e:
        raise ValidationError(f"Invalid date format '{date_str}', expected YYYY-MM-DD: {e}") from e


def validate_block_id(block_id: str) -> str:
    """Validate block identifier."""
    if not isinstance(block_id, str) or not block_id.strip():
        raise ValidationError("block_id must be a non-empty string")
    clean_id = block_id.strip()
    if len(clean_id) > 50:
        raise ValidationError(f"block_id '{clean_id}' exceeds maximum length of 50 characters")
    return clean_id


def validate_seasonal_array(
    arr: Sequence[int],
    name: str,
    min_val: int,
    max_val: int,
    expected_len: int = 214,
) -> list[int]:
    """Validate cardinality and value ranges for a 214-day seasonal array.
    
    Database constraints:
      - cardinality(rainfall_x10) = 214
      - cardinality(max_temp_x10) = 214
      - cardinality(soil_moisture_idx) = 214
      - cardinality(weather_state_code) = 214
    """
    if arr is None:
        raise ValidationError(f"Array '{name}' cannot be None")
    
    if len(arr) != expected_len:
        raise ValidationError(
            f"Array '{name}' cardinality violation: expected exactly {expected_len} elements, got {len(arr)}"
        )

    clean_arr: list[int] = []
    for idx, val in enumerate(arr):
        if val is None:
            raise ValidationError(f"Array '{name}' contains None at index {idx}")
        try:
            int_val = int(val)
        except (ValueError, TypeError) as e:
            raise ValidationError(f"Array '{name}' contains non-integer '{val}' at index {idx}") from e

        if int_val < min_val or int_val > max_val:
            raise ValidationError(
                f"Array '{name}' value {int_val} at index {idx} out of bounds [{min_val}, {max_val}]"
            )
        clean_arr.append(int_val)

    return clean_arr


def validate_seasonal_archive(record: dict[str, Any]) -> dict[str, Any]:
    """Validate a full seasonal archive record before Supabase loading."""
    required_keys = [
        "block_id",
        "season_year",
        "season_start_date",
        "season_end_date",
        "rainfall_x10",
        "max_temp_x10",
        "soil_moisture_idx",
        "weather_state_code",
    ]
    for key in required_keys:
        if key not in record:
            raise ValidationError(f"Missing required key '{key}' in seasonal archive record")

    block_id = validate_block_id(record["block_id"])
    year = int(record["season_year"])
    if year < 1950 or year > 2100:
        raise ValidationError(f"season_year {year} out of valid range [1950, 2100]")

    start_date = validate_date_string(record["season_start_date"])
    end_date = validate_date_string(record["season_end_date"])
    if start_date >= end_date:
        raise ValidationError(f"season_start_date {start_date} must be before season_end_date {end_date}")

    # Check 214-day duration (April 1 to October 31 inclusive)
    day_count = (end_date - start_date).days + 1
    if day_count != 214:
        raise ValidationError(f"Season duration is {day_count} days, expected exactly 214 days")

    # Validate arrays against Postgres smallint and physical bounds
    rainfall = validate_seasonal_array(record["rainfall_x10"], "rainfall_x10", min_val=0, max_val=32767)
    # Temp in °C * 10: -500 (-50°C) to 700 (+70°C)
    max_temp = validate_seasonal_array(record["max_temp_x10"], "max_temp_x10", min_val=-500, max_val=700)
    # Wetness index: 0 to 100
    soil_moisture = validate_seasonal_array(record["soil_moisture_idx"], "soil_moisture_idx", min_val=0, max_val=100)
    # State code: 0: Normal, 1: Onset, 2: Active, 3: Break, 4: Heavy
    state_code = validate_seasonal_array(record["weather_state_code"], "weather_state_code", min_val=0, max_val=4)

    return {
        "block_id": block_id,
        "season_year": year,
        "season_start_date": str(start_date),
        "season_end_date": str(end_date),
        "rainfall_x10": rainfall,
        "max_temp_x10": max_temp,
        "soil_moisture_idx": soil_moisture,
        "weather_state_code": state_code,
    }


def validate_live_weather_buffer(record: dict[str, Any]) -> dict[str, Any]:
    """Validate a 90-day live weather buffer observation record."""
    required = ["block_id", "observation_date", "rainfall_mm", "data_source"]
    for key in required:
        if key not in record:
            raise ValidationError(f"Missing required key '{key}' in live weather record")

    block_id = validate_block_id(record["block_id"])
    obs_date = validate_date_string(record["observation_date"])

    rain = float(record["rainfall_mm"])
    if rain < 0.0 or rain > 2000.0:  # World record 24h rainfall is ~1825mm
        raise ValidationError(f"Impossible daily rainfall {rain} mm")

    max_temp = float(record["max_temp_c"]) if record.get("max_temp_c") is not None else None
    if max_temp is not None and (max_temp < -50.0 or max_temp > 65.0):
        raise ValidationError(f"Impossible max temperature {max_temp} °C")

    min_temp = float(record["min_temp_c"]) if record.get("min_temp_c") is not None else None
    if min_temp is not None and (min_temp < -60.0 or min_temp > 50.0):
        raise ValidationError(f"Impossible min temperature {min_temp} °C")

    if max_temp is not None and min_temp is not None and min_temp > max_temp:
        raise ValidationError(f"min_temp ({min_temp}) exceeds max_temp ({max_temp})")

    soil_idx = float(record["soil_moisture_idx"]) if record.get("soil_moisture_idx") is not None else None
    if soil_idx is not None and (soil_idx < 0.0 or soil_idx > 100.0):
        raise ValidationError(f"soil_moisture_idx {soil_idx} outside [0.0, 100.0]")

    source = str(record["data_source"]).strip()
    if not source:
        raise ValidationError("data_source cannot be empty")

    return {
        "block_id": block_id,
        "observation_date": str(obs_date),
        "rainfall_mm": round(rain, 2),
        "max_temp_c": round(max_temp, 2) if max_temp is not None else None,
        "min_temp_c": round(min_temp, 2) if min_temp is not None else None,
        "soil_moisture_idx": round(soil_idx, 2) if soil_idx is not None else None,
        "data_source": source,
        "is_preliminary": bool(record.get("is_preliminary", True)),
    }


def validate_teleconnection_record(record: dict[str, Any]) -> dict[str, Any]:
    """Validate a national teleconnection daily record."""
    if "observation_date" not in record or not record.get("source_agency"):
        raise ValidationError("Missing observation_date or source_agency in teleconnection record")

    obs_date = validate_date_string(record["observation_date"])

    oni = float(record["enso_oni"]) if record.get("enso_oni") is not None else None
    if oni is not None and (oni < -4.0 or oni > 4.0):
        raise ValidationError(f"ENSO ONI index {oni} outside plausible range [-4.0, 4.0]")

    dmi = float(record["iod_dmi"]) if record.get("iod_dmi") is not None else None
    if dmi is not None and (dmi < -3.0 or dmi > 3.0):
        raise ValidationError(f"IOD DMI index {dmi} outside plausible range [-3.0, 3.0]")

    phase = int(record["mjo_phase"]) if record.get("mjo_phase") is not None else None
    if phase is not None and (phase < 1 or phase > 8):
        raise ValidationError(f"MJO phase {phase} must be between 1 and 8")

    amp = float(record["mjo_amplitude"]) if record.get("mjo_amplitude") is not None else None
    if amp is not None and (amp < 0.0 or amp > 10.0):
        raise ValidationError(f"MJO amplitude {amp} outside [0.0, 10.0]")

    return {
        "observation_date": str(obs_date),
        "enso_oni": round(oni, 3) if oni is not None else None,
        "iod_dmi": round(dmi, 3) if dmi is not None else None,
        "mjo_phase": phase,
        "mjo_amplitude": round(amp, 3) if amp is not None else None,
        "source_agency": str(record["source_agency"]).strip(),
    }


def validate_live_prediction(record: dict[str, Any]) -> dict[str, Any]:
    """Validate a probabilistic prediction record for public.live_predictions."""
    required = [
        "block_id",
        "prediction_date",
        "lead_time_bucket",
        "onset_probability",
        "break_probability",
        "heavy_spell_probability",
        "calibrated_confidence",
        "primary_driver",
    ]
    for key in required:
        if key not in record:
            raise ValidationError(f"Missing required key '{key}' in live prediction record")

    block_id = validate_block_id(record["block_id"])
    pred_date = validate_date_string(record["prediction_date"])

    bucket = str(record["lead_time_bucket"]).strip()
    valid_buckets = {"week_1", "week_2", "week_3", "week_4"}
    if bucket not in valid_buckets:
        raise ValidationError(f"Invalid lead_time_bucket '{bucket}', must be one of {valid_buckets}")

    def _val_prob(name: str, val: Any) -> float:
        try:
            f = float(val)
        except (ValueError, TypeError) as e:
            raise ValidationError(f"Prediction probability '{name}' must be numeric, got {val}") from e
        if f < 0.0 or f > 100.0:
            raise ValidationError(f"Prediction probability '{name}' value {f} out of range [0.0, 100.0]")
        return round(f, 2)

    onset_prob = _val_prob("onset_probability", record["onset_probability"])
    break_prob = _val_prob("break_probability", record["break_probability"])
    heavy_prob = _val_prob("heavy_spell_probability", record["heavy_spell_probability"])
    conf = _val_prob("calibrated_confidence", record["calibrated_confidence"])

    primary = str(record["primary_driver"]).strip()
    if not primary:
        raise ValidationError("primary_driver cannot be empty")

    secondary = str(record["secondary_driver"]).strip() if record.get("secondary_driver") else None
    
    analog_year = record.get("teleconnection_analog_year")
    if analog_year is not None:
        try:
            analog_year = int(analog_year)
            if analog_year < 1950 or analog_year > 2100:
                raise ValidationError(f"teleconnection_analog_year {analog_year} out of range [1950, 2100]")
        except (ValueError, TypeError) as e:
            raise ValidationError(f"teleconnection_analog_year must be integer: {e}") from e

    advisory_code = str(record["advisory_code"]).strip() if record.get("advisory_code") else None

    return {
        "block_id": block_id,
        "prediction_date": str(pred_date),
        "lead_time_bucket": bucket,
        "onset_probability": onset_prob,
        "break_probability": break_prob,
        "heavy_spell_probability": heavy_prob,
        "calibrated_confidence": conf,
        "primary_driver": primary,
        "secondary_driver": secondary,
        "teleconnection_analog_year": analog_year,
        "advisory_code": advisory_code,
    }

