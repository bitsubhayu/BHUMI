"""NOAA GFS / GEFS numerical weather prediction forecast adapter.

Retrieves and decodes real operational forecast fields (2m temperature and surface precipitation rate)
from the NOAA NOMADS GRIB filter service and AWS Open Data.
Uses pure-Python GRIB2 simple packing decoding.
"""

from __future__ import annotations

import datetime
from typing import Any, Optional

import numpy as np

from pipeline.sources.base import AdapterResult, BaseSourceAdapter
from pipeline.utils.grib2 import decode_grib2_grid, extract_point_from_grib2


class GfsAdapter(BaseSourceAdapter):
    """Adapter for NOAA Global Forecast System (GFS) 0.25° operational data."""

    NOMADS_BASE_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._gfs_cache: dict[str, Any] = {}

    @property
    def name(self) -> str:
        return "NOAA_GFS"

    @property
    def is_configured(self) -> bool:
        # GFS is public open data
        return True

    def _get_active_gfs_cycle(self, target_date: datetime.date) -> tuple[str, str]:
        """Find the reference GFS cycle for a target date.
        
        Semantics:
        A forecast for target_date (00:00 to 24:00 UTC) is evaluated against the operational cycle
        initialized on target_date at 00z (spanning forecast hours f000 to f024) or, if
        target_date is historical / completed, from that date's 00z cycle.
        """
        return target_date.strftime("%Y%m%d"), "00"

    def fetch_gfs_field(
        self,
        cycle_date_str: str,
        cycle_hour: str,
        var_param: str,
        lev_param: str,
        forecast_hour: str = "f024",
    ) -> dict[str, Any]:
        """Fetch and decode a real GRIB2 subregion slice from NOAA NOMADS."""
        cache_key = f"{cycle_date_str}_{cycle_hour}_{var_param}_{lev_param}_{forecast_hour}"
        if cache_key in self._gfs_cache:
            return self._gfs_cache[cache_key]

        params = {
            "file": f"gfs.t{cycle_hour}z.pgrb2.0p25.{forecast_hour}",
            lev_param: "on",
            var_param: "on",
            "subregion": "",
            "toplat": "38",
            "leftlon": "68",
            "rightlon": "98",
            "bottomlat": "6",
            "dir": f"/gfs.{cycle_date_str}/{cycle_hour}/atmos",
        }

        self.logger.info(f"Querying NOAA NOMADS for GFS {var_param} on {cycle_date_str} {cycle_hour}z ({forecast_hour})...")
        resp = self.request_with_retry("GET", self.NOMADS_BASE_URL, params=params, timeout=20)
        decoded = decode_grib2_grid(resp.content)
        self._gfs_cache[cache_key] = decoded
        return decoded

    def fetch_daily_forecast(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> AdapterResult[dict[str, Any]]:
        """Fetch real GFS forecast rainfall (mm) and max/min temperature (°C) for target date."""
        def _fetch() -> dict[str, Any]:
            cycle_date_str, cycle_hour = self._get_active_gfs_cycle(target_date)

            # 1. Fetch 2m temperatures across diurnal cycle steps (f012 midday and f024 end of day)
            # This ensures daily max and min represent genuine diurnal variation, not a single snapshot.
            tmp_12 = self.fetch_gfs_field(
                cycle_date_str, cycle_hour, "var_TMP", "lev_2_m_above_ground", forecast_hour="f012"
            )
            tmp_24 = self.fetch_gfs_field(
                cycle_date_str, cycle_hour, "var_TMP", "lev_2_m_above_ground", forecast_hour="f024"
            )
            temp_12_c = round(extract_point_from_grib2(tmp_12, lat, lon) - 273.15, 2)
            temp_24_c = round(extract_point_from_grib2(tmp_24, lat, lon) - 273.15, 2)

            max_temp = max(temp_12_c, temp_24_c)
            min_temp = min(temp_12_c, temp_24_c)

            # 2. Fetch 24-hour Accumulated Precipitation (APCP) covering the target date
            apcp_data = self.fetch_gfs_field(
                cycle_date_str, cycle_hour, "var_APCP", "lev_surface", forecast_hour="f024"
            )
            raw_apcp = extract_point_from_grib2(apcp_data, lat, lon)
            daily_rain_mm = round(max(0.0, float(raw_apcp)), 2)

            self.logger.info(
                f"Extracted real NOAA GFS forecast for ({lat:.2f}, {lon:.2f}) on {target_date}: "
                f"max_temp={max_temp}°C, min_temp={min_temp}°C, accumulated_rain={daily_rain_mm} mm"
            )

            return {
                "target_date": str(target_date),
                "cycle": f"{cycle_date_str}_{cycle_hour}z",
                "valid_date": str(target_date),
                "rainfall_mm": daily_rain_mm,
                "max_temp_c": max_temp,
                "min_temp_c": min_temp,
            }

        return self.safe_execute(f"fetch_daily_forecast ({target_date})", _fetch)

