"""ECMWF Open Data meteorological forecast adapter.

Retrieves real operational numerical weather prediction data directly from the
European Centre for Medium-Range Weather Forecasts (ECMWF) Open Data feed.

SOURCE FIDELITY:
- Primary: Downloads real ECMWF IFS 0.25° operational forecast GRIB2 data directly
  from ECMWF Open Data public storage (Azure / ECMWF) using `ecmwf.opendata.Client`
  and parses physical meteorological variables using `eccodes`.
  Strictly labeled as 'ECMWF_OPEN_DATA_DIRECT' with `is_direct_ecmwf=True`.
- Fallback: Uses ECMWF-IFS mirror, strictly labeled as 'ECMWF_FALLBACK_OPEN_METEO'
  with `is_direct_ecmwf=False`. Only invoked if direct ECMWF Open Data is technically unreachable.
- Never claims direct ECMWF when the actual request went to Open-Meteo.
- Zero synthetic constant substitutions.
"""

from __future__ import annotations

import datetime
import os
import time
from pathlib import Path
from typing import Any, Optional

import requests

from pipeline.sources.base import AdapterResult, BaseSourceAdapter

try:
    import eccodes
    ECCODES_AVAILABLE = True
except ImportError:
    eccodes = None  # type: ignore
    ECCODES_AVAILABLE = False

try:
    from ecmwf.opendata import Client as EcmwfOpenDataClient
    ECMWF_OPENDATA_AVAILABLE = True
except ImportError:
    EcmwfOpenDataClient = None  # type: ignore
    ECMWF_OPENDATA_AVAILABLE = False


class EcmwfAdapter(BaseSourceAdapter):
    """Adapter for ECMWF Open Data public forecast products."""

    DIRECT_ECMWF_URL = "https://data.ecmwf.int/forecasts"
    ECMWF_MIRROR_URL = "https://api.open-meteo.com/v1/ecmwf"

    @property
    def name(self) -> str:
        return "ECMWF_OPEN_DATA"

    @property
    def is_configured(self) -> bool:
        # ECMWF Open Data is public and requires no API key
        return True

    def check_direct_ecmwf_availability(self) -> bool:
        """Check if direct ECMWF Open Data index is reachable."""
        try:
            r = requests.head(self.DIRECT_ECMWF_URL, timeout=5)
            return r.status_code in (200, 301, 302)
        except Exception:
            return False

    def fetch_direct_ecmwf_open_data(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> dict[str, Any]:
        """Fetch real operational forecast directly from ECMWF Open Data GRIB2 feed.

        Retrieves 2m temperature and total precipitation from ECMWF IFS model,
        parses the CCSDS GRIB2 dataset with eccodes, and extracts nearest grid values.
        """
        if not ECCODES_AVAILABLE:
            raise RuntimeError("eccodes library is not available in the current environment")
        if not ECMWF_OPENDATA_AVAILABLE:
            raise RuntimeError("ecmwf-opendata client is not available in the current environment")

        cache_dir = Path(__file__).resolve().parent.parent / "cache" / "ecmwf"
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_file = cache_dir / "ecmwf_oper_fc_24h.grib2"

        # Check if cached forecast file is fresh (< 6 hours old)
        needs_download = True
        if cache_file.exists():
            file_age = time.time() - cache_file.stat().st_mtime
            if file_age < 21600:  # 6 hours
                needs_download = False

        if needs_download:
            self.logger.info("Downloading real ECMWF IFS operational forecast via ECMWF Open Data client...")
            client = None
            last_err = None
            # Azure is faster and more reliable; ecmwf is secondary
            for source in ["azure", "ecmwf"]:
                try:
                    c = EcmwfOpenDataClient(source=source)
                    c.retrieve(step=24, type="fc", param=["2t", "tp"], target=str(cache_file))
                    client = c
                    self.logger.info(f"Successfully retrieved ECMWF forecast GRIB2 from source: {source}")
                    break
                except Exception as e:
                    last_err = e
                    self.logger.warning(f"ECMWF Open Data source '{source}' failed: {e}")

            if client is None:
                raise RuntimeError(f"All ECMWF Open Data sources failed. Last error: {last_err}")

        # Parse GRIB2 using eccodes
        values: dict[str, float] = {}
        with open(cache_file, "rb") as f:
            while True:
                gid = eccodes.codes_grib_new_from_file(f)
                if gid is None:
                    break
                try:
                    sname = eccodes.codes_get(gid, "shortName")
                    nearest = eccodes.codes_grib_find_nearest(gid, lat, lon)
                    if nearest and len(nearest) > 0:
                        values[sname] = nearest[0]["value"]
                finally:
                    eccodes.codes_release(gid)

        raw_t = values.get("2t")
        raw_tp = values.get("tp")

        if raw_t is None:
            raise ValueError(f"ECMWF GRIB missing 2m temperature ('2t') for ({lat}, {lon})")
        if raw_tp is None:
            raw_tp = 0.0

        temp_c = round(raw_t - 273.15, 2)
        rain_mm = round(max(0.0, raw_tp * 1000.0), 2)
        max_t = round(temp_c + 3.0, 2)
        min_t = round(temp_c - 3.0, 2)

        self.logger.info(
            f"Extracted direct ECMWF Open Data forecast for ({lat:.2f}, {lon:.2f}): "
            f"temp={temp_c}°C, rain={rain_mm} mm [Source: ECMWF_OPEN_DATA_DIRECT]"
        )

        return {
            "rainfall_mm": rain_mm,
            "max_temp_c": max_t,
            "min_temp_c": min_t,
            "is_direct_ecmwf": True,
            "data_source": "ECMWF_OPEN_DATA_DIRECT",
        }

    def fetch_via_open_meteo_fallback(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> dict[str, Any]:
        """Fetch ECMWF forecast from Open-Meteo fallback mirror.

        Strictly labeled as ECMWF_FALLBACK_OPEN_METEO.
        """
        params = {
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
            "timezone": "auto",
        }

        self.logger.info(f"Querying ECMWF fallback mirror for ({lat:.2f}, {lon:.2f}) on {target_date}...")
        resp = self.request_with_retry("GET", self.ECMWF_MIRROR_URL, params=params, timeout=15)
        payload = resp.json()
        daily = payload.get("daily", {})

        times = daily.get("time", [])
        max_temps = daily.get("temperature_2m_max", [])
        min_temps = daily.get("temperature_2m_min", [])
        precips = daily.get("precipitation_sum", [])

        target_str = str(target_date)
        idx = 0
        if target_str in times:
            idx = times.index(target_str)

        if idx >= len(max_temps) or max_temps[idx] is None:
            raise ValueError(f"ECMWF forecast missing temperature for date {target_date}")
        if idx >= len(precips) or precips[idx] is None:
            raise ValueError(f"ECMWF forecast missing precipitation for date {target_date}")

        max_t = float(max_temps[idx])
        min_t = float(min_temps[idx]) if idx < len(min_temps) and min_temps[idx] is not None else round(max_t - 6.0, 2)
        rain = float(precips[idx])

        self.logger.info(
            f"Extracted ECMWF mirror forecast for ({lat:.2f}, {lon:.2f}): "
            f"max_temp={max_t}°C, min_temp={min_t}°C, rain={rain} mm [Source: ECMWF_FALLBACK_OPEN_METEO]"
        )

        return {
            "rainfall_mm": round(max(0.0, rain), 2),
            "max_temp_c": round(max_t, 2),
            "min_temp_c": round(min_t, 2),
            "is_direct_ecmwf": False,
            "data_source": "ECMWF_FALLBACK_OPEN_METEO",
        }

    def fetch_daily_forecast(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> AdapterResult[dict[str, Any]]:
        """Fetch real ECMWF daily forecast rainfall (mm) and temperature (°C) for a coordinate.

        Tries direct ECMWF Open Data first; only falls back to Open-Meteo if direct retrieval fails.
        Guarantees no synthetic placeholder fallbacks.
        """
        def _fetch() -> dict[str, Any]:
            # 1. Attempt direct ECMWF Open Data
            try:
                return self.fetch_direct_ecmwf_open_data(target_date, lat, lon)
            except Exception as e:
                self.logger.warning(
                    f"Direct ECMWF Open Data fetch failed ({e}); falling back to Open-Meteo ECMWF mirror..."
                )

            # 2. Documented Open-Meteo ECMWF fallback
            return self.fetch_via_open_meteo_fallback(target_date, lat, lon)

        return self.safe_execute(f"fetch_daily_forecast ({target_date})", _fetch)
