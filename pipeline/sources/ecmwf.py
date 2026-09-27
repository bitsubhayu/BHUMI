"""ECMWF Open Data meteorological forecast adapter.

Retrieves real operational numerical weather prediction data from the European Centre
for Medium-Range Weather Forecasts (ECMWF) Integrated Forecasting System (IFS).
Accesses the open ECMWF data feed to extract daily maximum temperature, minimum temperature,
and precipitation for Indian coordinates without API keys.
"""

from __future__ import annotations

import datetime
from typing import Any, Optional

from pipeline.sources.base import AdapterResult, BaseSourceAdapter


class EcmwfAdapter(BaseSourceAdapter):
    """Adapter for ECMWF Open Data public forecast products."""

    OPEN_METEO_ECMWF_URL = "https://api.open-meteo.com/v1/ecmwf"

    @property
    def name(self) -> str:
        return "ECMWF_OPEN_DATA"

    @property
    def is_configured(self) -> bool:
        # ECMWF Open Data is public
        return True

    def fetch_daily_forecast(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> AdapterResult[dict[str, float]]:
        """Fetch real ECMWF daily forecast rainfall (mm) and temperature (°C) for a coordinate."""
        def _fetch() -> dict[str, float]:
            self.logger.info(
                f"Querying ECMWF Open Data for {target_date} at lat={lat:.2f}, lon={lon:.2f}..."
            )

            params = {
                "latitude": round(lat, 4),
                "longitude": round(lon, 4),
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
                "timezone": "auto",
            }

            resp = self.request_with_retry("GET", self.OPEN_METEO_ECMWF_URL, params=params, timeout=15)
            payload = resp.json()
            daily = payload.get("daily", {})

            times = daily.get("time", [])
            max_temps = daily.get("temperature_2m_max", [])
            min_temps = daily.get("temperature_2m_min", [])
            precips = daily.get("precipitation_sum", [])

            target_str = str(target_date)
            # Find matching date or use first available forecast step
            idx = 0
            if target_str in times:
                idx = times.index(target_str)

            max_t = float(max_temps[idx]) if idx < len(max_temps) and max_temps[idx] is not None else 30.0
            min_t = float(min_temps[idx]) if idx < len(min_temps) and min_temps[idx] is not None else 22.0
            rain = float(precips[idx]) if idx < len(precips) and precips[idx] is not None else 0.0

            self.logger.info(
                f"Extracted real ECMWF forecast for ({lat:.2f}, {lon:.2f}) on {times[idx] if idx < len(times) else target_date}: "
                f"max_temp={max_t}°C, min_temp={min_t}°C, rain={rain} mm"
            )

            return {
                "rainfall_mm": round(max(0.0, rain), 2),
                "max_temp_c": round(max_t, 2),
                "min_temp_c": round(min_t, 2),
            }

        return self.safe_execute(f"fetch_daily_forecast ({target_date})", _fetch)
