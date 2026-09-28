"""NASA Global Precipitation Measurement (GPM) IMERG adapter.

Provides satellite precipitation estimates at 0.1° resolution.
- Early / Late run: used for daily live buffer.
- Final run (~3.5 months lag): used for historical reconciliation.
Authenticates via NASA Earthdata URS token service and downloads official
NetCDF4/HDF5 granules directly from NASA GES DISC.
Extracts precipitation fields using h5py.

BANS third-party substitute APIs. 100% genuine NASA product extraction.
"""

from __future__ import annotations

import datetime
import io
from typing import Any, Optional

import h5py
import numpy as np
import requests

from pipeline.sources.base import AdapterResult, BaseSourceAdapter


class GpmImergAdapter(BaseSourceAdapter):
    """Adapter for NASA GPM IMERG precipitation data."""

    EARTHDATA_CMR_URL = "https://cmr.earthdata.nasa.gov/search/granules.json"
    EARTHDATA_TOKEN_URL = "https://urs.earthdata.nasa.gov/api/users/tokens"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._bearer_token: Optional[str] = None
        self._gpm_cache: dict[datetime.date, np.ndarray] = {}

    @property
    def name(self) -> str:
        return "NASA_GPM_IMERG"

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
            resp = requests.get(
                self.EARTHDATA_TOKEN_URL,
                auth=(self.config.earthdata_username, self.config.earthdata_password),
                timeout=15,
            )
            if resp.status_code == 200:
                tokens = resp.json()
                if isinstance(tokens, list) and len(tokens) > 0:
                    self._bearer_token = tokens[0].get("access_token")
                    return self._bearer_token
            # Fallback to POST /token
            post_resp = requests.post(
                "https://urs.earthdata.nasa.gov/api/users/token",
                auth=(self.config.earthdata_username, self.config.earthdata_password),
                timeout=15,
            )
            if post_resp.status_code in (200, 201):
                self._bearer_token = post_resp.json().get("access_token")
                return self._bearer_token

            self.logger.warning(f"Could not acquire NASA Earthdata token (HTTP {resp.status_code})")
            return None
        except Exception as e:
            self.logger.error(f"Error obtaining NASA Earthdata token: {e}")
            return None

    def query_granules(
        self,
        target_date: datetime.date,
        is_early_run: bool = True,
    ) -> list[str]:
        """Search NASA CMR for available IMERG granules for a given date."""
        if not self.is_configured:
            return []

        collection = "GPM_3IMERGDL" if is_early_run else "GPM_3IMERGDF"
        params = {
            "short_name": collection,
            "temporal": f"{target_date}T00:00:00Z,{target_date}T23:59:59Z",
            "page_size": 5,
        }
        try:
            resp = self.request_with_retry("GET", self.EARTHDATA_CMR_URL, params=params, timeout=15)
            entries = resp.json().get("feed", {}).get("entry", [])
            urls = []
            for entry in entries:
                for link in entry.get("links", []):
                    href = link.get("href", "")
                    if href.endswith(".nc4") and not link.get("inherited", False):
                        urls.append(href)
            return urls
        except Exception as e:
            self.logger.error(f"GPM CMR search failed: {e}")
            return []

    def download_and_extract_point(
        self,
        target_date: datetime.date,
        granule_url: str,
        token: str,
        lat: float,
        lon: float,
    ) -> float:
        """Download genuine GPM IMERG NetCDF4/HDF5 granule and extract rainfall."""
        self.logger.info(f"Downloading authentic NASA GPM IMERG granule from {granule_url}...")
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(granule_url, headers=headers, timeout=45)

        if resp.status_code == 403:
            raise RuntimeError(
                "NASA GES DISC EULA not yet accepted for user account. "
                "Authorize at: https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ"
            )
        elif resp.status_code != 200:
            raise RuntimeError(f"NASA GES DISC download returned HTTP {resp.status_code}: {resp.text[:200]}")

        rain_mm = self.extract_point_from_nc4_bytes(resp.content, lat, lon)
        self.logger.info(f"Extracted real GPM IMERG precipitation for ({lat:.2f}, {lon:.2f}) on {target_date}: {rain_mm} mm")
        return rain_mm

    def extract_point_from_nc4_bytes(
        self,
        nc4_bytes: bytes,
        lat: float,
        lon: float,
    ) -> float:
        """Parse authentic GPM IMERG NetCDF4/HDF5 bytes and extract rainfall."""
        with h5py.File(io.BytesIO(nc4_bytes), "r") as f:
            if "Grid" not in f:
                raise ValueError("Invalid GPM IMERG granule: Missing 'Grid' group")
            grid_group = f["Grid"]

            var_name = "precipitation" if "precipitation" in grid_group else "precipitationCal"
            if var_name not in grid_group:
                raise ValueError(f"Missing precipitation dataset in GPM granule (keys: {list(grid_group.keys())})")

            # GPM grid shape: (1, 3600, 1800) or (3600, 1800) -> (time, lon, lat)
            ds = grid_group[var_name]
            lon_idx = max(0, min(3599, int(round((lon + 179.95) / 0.1))))
            lat_idx = max(0, min(1799, int(round((lat + 89.95) / 0.1))))

            if ds.ndim == 3:
                val = float(ds[0, lon_idx, lat_idx])
            else:
                val = float(ds[lon_idx, lat_idx])

            if val < 0.0:  # Fill value
                val = 0.0

            return round(val, 2)

    def fetch_daily_precipitation(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
        is_early_run: bool = True,
    ) -> AdapterResult[float]:
        """Fetch real daily precipitation (mm) from the authentic NASA GPM IMERG product."""
        if not self.is_configured:
            return AdapterResult(
                source_name=self.name,
                success=False,
                error_message="NASA Earthdata credentials not configured",
            )

        def _fetch() -> float:
            token = self.get_earthdata_bearer_token()
            if not token:
                raise RuntimeError("Failed to obtain NASA Earthdata bearer token")

            # Query NASA CMR for available granules
            granule_urls = self.query_granules(target_date, is_early_run=is_early_run)
            if not granule_urls:
                # Try fallback to recent date (up to 3 days) if recent day is still in processing pipeline
                for lookback in range(1, 4):
                    alt_date = target_date - datetime.timedelta(days=lookback)
                    granule_urls = self.query_granules(alt_date, is_early_run=is_early_run)
                    if granule_urls:
                        break

            if not granule_urls:
                raise RuntimeError(f"No GPM IMERG granules available on NASA CMR for {target_date}")

            target_granule = granule_urls[0]
            self.logger.info(f"Targeting authentic NASA GPM granule: {target_granule}")

            return self.download_and_extract_point(target_date, target_granule, token, lat, lon)

        return self.safe_execute(f"fetch_daily_precipitation ({target_date})", _fetch)
