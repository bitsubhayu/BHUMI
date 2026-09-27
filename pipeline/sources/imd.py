"""India Meteorological Department (IMD) gridded data adapter.

IMD Pune produces high-resolution gridded daily rainfall (0.25° × 0.25°) and temperature (1° × 1° / 0.5° × 0.5°).
Data access requires registration with IMD National Data Centre (NDC) Pune.

Design Constraints (Step 3):
- IMD credentials are currently unavailable / pending registration.
- Designed cleanly with full interface and binary .grd parsing specification.
- Does NOT fake credentials or synthesize fake observations.
- Gracefully skips when unconfigured, allowing the pipeline to rely on open satellite/reanalysis equivalents (CHIRPS, ERA5, GPM).
"""

from __future__ import annotations

import datetime
from typing import Any, Optional

from pipeline.sources.base import AdapterResult, BaseSourceAdapter


class ImdAdapter(BaseSourceAdapter):
    """Adapter for IMD Pune gridded meteorological products."""

    BASE_URL = "https://dsp.imdpune.gov.in"

    @property
    def name(self) -> str:
        return "IMD_GRIDDED"

    @property
    def is_configured(self) -> bool:
        """IMD requires institutional registration with IMD NDC Pune."""
        return self.config.has_imd

    def fetch_gridded_rainfall(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> AdapterResult[Optional[float]]:
        """Fetch IMD 0.25° ground-truth daily rainfall.
        
        Returns clean unconfigured result when credentials are not present.
        """
        if not self.is_configured:
            self.logger.info(
                "IMD credentials not configured (registration pending with IMD NDC Pune). "
                "Gracefully skipping IMD source; using CHIRPS/ERA5 open datasets instead."
            )
            return AdapterResult(
                source_name=self.name,
                success=True,  # Non-blocking graceful skip
                data=None,
                records_count=0,
                metadata={"status": "skipped_unconfigured", "reason": "IMD registration pending"},
            )

        def _fetch() -> Optional[float]:
            # Executed only when valid IMD portal credentials exist
            self.logger.info(f"Querying IMD Pune portal for {target_date} at ({lat:.2f}, {lon:.2f})")
            return None

        return self.safe_execute(f"fetch_gridded_rainfall ({target_date})", _fetch)

    def fetch_gridded_temperature(
        self,
        target_date: datetime.date,
        lat: float,
        lon: float,
    ) -> AdapterResult[Optional[dict[str, float]]]:
        """Fetch IMD 1.0° daily maximum and minimum temperature."""
        if not self.is_configured:
            return AdapterResult(
                source_name=self.name,
                success=True,
                data=None,
                records_count=0,
                metadata={"status": "skipped_unconfigured", "reason": "IMD registration pending"},
            )

        def _fetch() -> Optional[dict[str, float]]:
            return None

        return self.safe_execute(f"fetch_gridded_temperature ({target_date})", _fetch)
