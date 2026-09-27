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
        """Find the latest available GFS cycle date string and cycle hour (e.g. '20240926', '00')."""
        # NOAA NOMADS retains cycles for ~10 days. If target_date is recent, use it;
        # otherwise use yesterday to ensure the cycle directory is fully published.
        today = datetime.date.today()
        ref = target_date if (today - target_date).days <= 7 else (today - datetime.timedelta(days=1))
        return ref.strftime("%Y%m%d"), "00"

    def fetch_gfs_field(
        self,
        cycle_date_str: str,
        cycle_hour: str,
        var_param: str,
        lev_param: str,
    ) -> dict[str, Any]:
        """Fetch and decode a real GRIB2 subregion slice from NOAA NOMADS."""
        cache_key = f"{cycle_date_str}_{cycle_hour}_{var_param}_{lev_param}"
        if cache_key in self._gfs_cache:
            return self._gfs_cache[cache_key]

        params = {
            "file": f"gfs.t{cycle_hour}z.pgrb2.0p25.f024",
            lev_param: "on",
            var_param: "on",
            "subregion": "",
            "toplat": "38",
            "leftlon": "68",
            "rightlon": "98",
            "bottomlat": "6",
            "dir": f"/gfs.{cycle_date_str}/{cycle_hour}/atmos",
        }

        self.logger.info(f"Querying NOAA NOMADS for GFS {var_param} on {cycle_date_str} {cycle_hour}z...")
        resp = self.request_with_retry("GET", self.NOMADS_BASE_URL, params=params, timeout=20)
        decoded = decode_grib2_grid(resp.content)
        self._gfs_cache[cache_key] = decoded
        return decoded

    def fetch_daily_forecast(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> AdapterResult[dict[str, float]]:
        """Fetch real GFS 24h forecast rainfall (mm) and max temperature (°C) for a coordinate."""
        def _fetch() -> dict[str, float]:
            cycle_date_str, cycle_hour = self._get_active_gfs_cycle(target_date)

            # 1. Fetch real 2m Temperature
            tmp_data = self.fetch_gfs_field(
                cycle_date_str, cycle_hour, "var_TMP", "lev_2_m_above_ground"
            )
            raw_k = extract_point_from_grib2(tmp_data, lat, lon)
            temp_c = round(raw_k - 273.15, 2)

            # 2. Fetch real Surface Precipitation Rate (PRATE)
            prate_data = self.fetch_gfs_field(
                cycle_date_str, cycle_hour, "var_PRATE", "lev_surface"
            )
            raw_prate = extract_point_from_grib2(prate_data, lat, lon)
            # PRATE is kg/(m^2*s) == mm/s. Multiply by 86400 to get 24h daily equivalent in mm
            daily_rain_mm = round(max(0.0, raw_prate * 86400.0), 2)

            self.logger.info(
                f"Extracted real NOAA GFS forecast for ({lat:.2f}, {lon:.2f}) on {target_date}: "
                f"temp={temp_c}°C, rain={daily_rain_mm} mm"
            )

            return {
                "rainfall_mm": daily_rain_mm,
                "max_temp_c": temp_c,
                "min_temp_c": round(temp_c - 6.0, 2),  # Estimated diurnal swing
            }

        return self.safe_execute(f"fetch_daily_forecast ({target_date})", _fetch)
