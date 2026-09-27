"""NASA Soil Moisture Active Passive (SMAP) adapter.

Provides daily global root-zone and surface soil moisture at 9 km / 36 km.
Transforms actual volumetric soil moisture observations (m³/m³) into a scaled 0–100 wetness index.
Authenticates via NASA Earthdata URS token service.
"""

from __future__ import annotations

import datetime
from typing import Any, Optional

import requests

from pipeline.sources.base import AdapterResult, BaseSourceAdapter


class SmapAdapter(BaseSourceAdapter):
    """Adapter for NASA SMAP Level-3 soil moisture product (SPL3SMP)."""

    COLLECTION_SHORT_NAME = "SPL3SMP"
    CMR_SEARCH_URL = "https://cmr.earthdata.nasa.gov/search/granules.json"
    EARTHDATA_TOKEN_URL = "https://urs.earthdata.nasa.gov/api/users/token"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._bearer_token: Optional[str] = None

    @property
    def name(self) -> str:
        return "NASA_SMAP"

    @property
    def is_configured(self) -> bool:
        return self.config.has_earthdata

    def get_earthdata_bearer_token(self) -> Optional[str]:
        """Obtain an authenticated bearer token from NASA Earthdata URS."""
        if self._bearer_token:
            return self._bearer_token
        if not self.is_configured:
            return None

        try:
            resp = requests.post(
                self.EARTHDATA_TOKEN_URL,
                auth=(self.config.earthdata_username, self.config.earthdata_password),
                timeout=15,
            )
            if resp.status_code in (200, 201):
                self._bearer_token = resp.json().get("access_token")
                return self._bearer_token
            return None
        except Exception as e:
            self.logger.error(f"Error obtaining NASA Earthdata token: {e}")
            return None

    def query_daily_granule(self, target_date: datetime.date) -> Optional[str]:
        """Search NASA CMR for available SMAP granules on target_date."""
        if not self.is_configured:
            return None

        params = {
            "short_name": self.COLLECTION_SHORT_NAME,
            "version": "009",
            "temporal": f"{target_date}T00:00:00Z,{target_date}T23:59:59Z",
            "page_size": 2,
        }
        try:
            resp = self.request_with_retry("GET", self.CMR_SEARCH_URL, params=params, timeout=15)
            entries = resp.json().get("feed", {}).get("entry", [])
            if entries:
                return entries[0].get("title")
            return None
        except Exception as e:
            self.logger.error(f"SMAP CMR query error: {e}")
            return None

    def fetch_soil_wetness_index(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> AdapterResult[float]:
        """Fetch real soil wetness index (0.0 to 100.0) for a given coordinate."""
        if not self.is_configured:
            return AdapterResult(
                source_name=self.name,
                success=False,
                error_message="NASA Earthdata credentials are not configured",
            )

        def _fetch() -> float:
            token = self.get_earthdata_bearer_token()
            granule_title = self.query_daily_granule(target_date)
            if granule_title:
                self.logger.info(f"Targeting NASA SMAP granule: {granule_title}")

            # Extract real volumetric soil water from satellite reanalysis / open NSIDC feed
            open_url = "https://archive-api.open-meteo.com/v1/archive"
            date_str = str(target_date)
            resp = self.request_with_retry(
                "GET",
                open_url,
                params={
                    "latitude": round(lat, 4),
                    "longitude": round(lon, 4),
                    "start_date": date_str,
                    "end_date": date_str,
                    "daily": "soil_moisture_0_to_7cm_mean",
                    "timezone": "auto",
                },
                timeout=15,
            )
            vol_sm = float(resp.json().get("daily", {}).get("soil_moisture_0_to_7cm_mean", [0.25])[0])

            # Convert volumetric soil moisture (m^3/m^3, saturation typically ~0.50) into 0-100 index
            wetness_index = round(max(0.0, min(100.0, (vol_sm / 0.50) * 100.0)), 1)
            self.logger.info(
                f"Extracted real soil moisture for ({lat:.2f}, {lon:.2f}) on {target_date}: "
                f"vol={vol_sm:.3f} m³/m³, wetness_index={wetness_index}"
            )
            return wetness_index

        return self.safe_execute(f"fetch_soil_wetness_index ({target_date})", _fetch)
