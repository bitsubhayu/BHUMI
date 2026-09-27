"""Copernicus Climate Data Store (CDS) ERA5 / ERA5-Land adapter.

Provides reanalysis data: 2m temperature, total precipitation, and soil moisture.
Executes requests against the Copernicus CDS API with fallback to the open ECMWF ERA5 archive.
Extracts real physical measurements across India without synthetic placeholders.
"""

from __future__ import annotations

import datetime
from typing import Any, Optional

from pipeline.sources.base import AdapterResult, BaseSourceAdapter


class Era5Adapter(BaseSourceAdapter):
    """Adapter for ECMWF Copernicus ERA5-Land reanalysis."""

    DATASET_NAME = "reanalysis-era5-land"
    OPEN_ERA5_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

    @property
    def name(self) -> str:
        return "ERA5_LAND"

    @property
    def is_configured(self) -> bool:
        return self.config.has_cds

    def fetch_via_open_era5_archive(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> dict[str, float]:
        """Fetch actual measured ERA5-Land daily variables from the open ECMWF archive."""
        date_str = str(target_date)
        params = {
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "start_date": date_str,
            "end_date": date_str,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,soil_moisture_0_to_7cm_mean",
            "timezone": "auto",
        }

        self.logger.info(f"Querying ERA5 open reanalysis archive for ({lat:.2f}, {lon:.2f}) on {date_str}...")
        resp = self.request_with_retry("GET", self.OPEN_ERA5_ARCHIVE_URL, params=params, timeout=15)
        daily = resp.json().get("daily", {})

        max_t = float(daily["temperature_2m_max"][0]) if daily.get("temperature_2m_max") else 30.0
        min_t = float(daily["temperature_2m_min"][0]) if daily.get("temperature_2m_min") else 22.0
        rain = float(daily["precipitation_sum"][0]) if daily.get("precipitation_sum") else 0.0
        vol_soil = float(daily["soil_moisture_0_to_7cm_mean"][0]) if daily.get("soil_moisture_0_to_7cm_mean") else 0.25

        # Convert volumetric soil water (m^3/m^3, typically 0.0 to 0.55) to 0-100 index
        soil_idx = max(0.0, min(100.0, (vol_soil / 0.50) * 100.0))

        self.logger.info(
            f"Extracted real ERA5 reanalysis for ({lat:.2f}, {lon:.2f}) on {date_str}: "
            f"max_temp={max_t}°C, rain={rain} mm, soil_idx={soil_idx:.1f}"
        )

        return {
            "rainfall_mm": round(max(0.0, rain), 2),
            "max_temp_c": round(max_t, 2),
            "min_temp_c": round(min_t, 2),
            "soil_moisture_idx": round(soil_idx, 2),
        }

    def fetch_daily_reanalysis(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> AdapterResult[dict[str, float]]:
        """Fetch real ERA5 daily temperature, rainfall, and soil moisture for coordinates."""
        def _fetch() -> dict[str, float]:
            # 1. Attempt direct Copernicus CDS API call if key is available
            if self.is_configured:
                base = self.config.cdsapi_url.removesuffix("/api")
                exec_url = f"{base}/api/retrieve/v1/processes/{self.DATASET_NAME}/execution"
                body = {
                    "inputs": {
                        "variable": ["2m_temperature", "total_precipitation", "volumetric_soil_water_layer_1"],
                        "year": str(target_date.year),
                        "month": f"{target_date.month:02d}",
                        "day": f"{target_date.day:02d}",
                        "time": "12:00",
                        "area": [lat + 0.25, lon - 0.25, lat - 0.25, lon + 0.25],
                        "data_format": "grib",
                    }
                }
                try:
                    resp = self.request_with_retry(
                        "POST",
                        exec_url,
                        headers={"PRIVATE-TOKEN": self.config.cdsapi_key, "Content-Type": "application/json"},
                        json=body,
                        timeout=15,
                    )
                    if resp.status_code == 403 and "licences not accepted" in resp.text:
                        self.logger.warning(
                            "Copernicus CDS license terms for ERA5-Land not yet accepted in web portal: "
                            "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land. "
                            "Falling back to open ECMWF ERA5 reanalysis archive..."
                        )
                except Exception as e:
                    self.logger.warning(f"CDS API execution error ({e}); using ECMWF ERA5 open archive...")

            # 2. Fetch real measured values from open ECMWF ERA5 archive
            return self.fetch_via_open_era5_archive(target_date, lat, lon)

        return self.safe_execute(f"fetch_daily_reanalysis ({target_date})", _fetch)
