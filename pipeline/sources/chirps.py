"""CHIRPS daily precipitation source adapter.

Climate Hazards Center (CHC) — UC Santa Barbara.
Provides 0.05° resolution daily precipitation for 50°S–50°N (covering all of India).
Downloads and parses actual published daily GeoTIFF rasters (.tif.gz).
"""

from __future__ import annotations

import datetime
import gzip
import io
from pathlib import Path
from typing import Any, Optional

import numpy as np
from PIL import Image

from pipeline.sources.base import AdapterResult, BaseSourceAdapter


class ChirpsAdapter(BaseSourceAdapter):
    """Adapter for UCSB CHIRPS precipitation data."""

    BASE_URL = "https://data.chc.ucsb.edu/products/CHIRPS-2.0"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._raster_cache: dict[datetime.date, np.ndarray] = {}

    @property
    def name(self) -> str:
        return "CHIRPS"

    @property
    def is_configured(self) -> bool:
        # CHIRPS is public open data
        return True

    def get_remote_file_url(self, year: int, month: int, day: int) -> str:
        """Construct the URL for a daily CHIRPS 0.05° file."""
        return f"{self.BASE_URL}/global_daily/tifs/p05/{year}/chirps-v2.0.{year}.{month:02d}.{day:02d}.tif.gz"

    def fetch_daily_raster(self, target_date: datetime.date) -> np.ndarray:
        """Download and decompress the real CHIRPS global 0.05° daily GeoTIFF."""
        if target_date in self._raster_cache:
            return self._raster_cache[target_date]

        url = self.get_remote_file_url(target_date.year, target_date.month, target_date.day)
        self.logger.info(f"Downloading real CHIRPS GeoTIFF from {url}...")

        resp = self.request_with_retry("GET", url, timeout=30)
        uncompressed = gzip.decompress(resp.content)
        img = Image.open(io.BytesIO(uncompressed))
        arr = np.array(img, dtype=np.float32)

        # Cache in memory (keep up to 10 recent dates)
        if len(self._raster_cache) > 10:
            oldest = next(iter(self._raster_cache))
            del self._raster_cache[oldest]
        self._raster_cache[target_date] = arr

        self.logger.info(
            f"Successfully decoded CHIRPS raster for {target_date}: shape={arr.shape}, "
            f"min={float(arr[arr >= 0].min() if (arr >= 0).any() else 0):.2f}, max={float(arr.max()):.2f} mm"
        )
        return arr

    def extract_point_from_raster(self, arr: np.ndarray, lat: float, lon: float) -> float:
        """Extract daily rainfall in mm for a specific coordinate.
        
        Coordinate transformation:
          lat in [-50.0, 50.0] -> row in [0, 1999]
          lon in [-180.0, 180.0] -> col in [0, 7199]
        """
        row = int(round((50.0 - lat) / 0.05))
        col = int(round((lon + 180.0) / 0.05))

        row = max(0, min(arr.shape[0] - 1, row))
        col = max(0, min(arr.shape[1] - 1, col))

        val = float(arr[row, col])
        # CHIRPS uses negative values (-9999.0) as water / no-data fill
        return max(0.0, round(val, 2)) if val >= 0 else 0.0

    def fetch_daily_rainfall(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> AdapterResult[float]:
        """Fetch real daily rainfall (mm) for a coordinate and date."""
        def _fetch() -> float:
            arr = self.fetch_daily_raster(target_date)
            val = self.extract_point_from_raster(arr, lat, lon)
            self.logger.info(f"Extracted real CHIRPS rainfall for ({lat:.2f}, {lon:.2f}) on {target_date}: {val} mm")
            return val

        return self.safe_execute(f"fetch_daily_rainfall ({target_date})", _fetch)

    def fetch_seasonal_window(
        self,
        year: int,
        lat: float,
        lon: float,
        sample_days: Optional[int] = None,
    ) -> AdapterResult[list[float]]:
        """Fetch 214-day rainfall time series (1 Apr – 31 Oct) for a single coordinate."""
        def _fetch() -> list[float]:
            from pipeline.transforms.seasonal_pack import get_season_dates
            dates = get_season_dates(year)
            num_days = sample_days if sample_days is not None else len(dates)

            rainfall_series: list[float] = []
            for idx, d in enumerate(dates[:num_days]):
                try:
                    arr = self.fetch_daily_raster(d)
                    val = self.extract_point_from_raster(arr, lat, lon)
                    rainfall_series.append(val)
                except Exception as e:
                    self.logger.warning(f"Could not fetch CHIRPS raster for {d}: {e}")
                    rainfall_series.append(0.0)

            # Pad if sample_days was requested
            while len(rainfall_series) < 214:
                rainfall_series.append(0.0)

            return rainfall_series

        return self.safe_execute(f"fetch_seasonal_window ({year})", _fetch)
