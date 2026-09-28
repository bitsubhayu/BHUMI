"""IMD Official Ground-Truth Verification Adapter.

Interface to official India Meteorological Department (IMD Pune) historical
monsoon onset and break dates as required by PRD §6.

CURRENT ACCESS STATUS:
  - IMD Pune gridded/monsoon-bulletin credentials are not currently available/configured.
  - As per PRD and Step 4 instructions: DO NOT FABRICATE IMD LABELS.
  - Cleanly reports IMD_VALIDATION_UNAVAILABLE without erroring or falsifying validation.
"""

from __future__ import annotations

from typing import Any, Optional

from pipeline.utils.config import PipelineConfig, get_pipeline_config
from pipeline.utils.logger import get_logger


class IMDGroundTruthAdapter:
    """Interface to official IMD historical onset and break ground truth."""

    def __init__(self, config: Optional[PipelineConfig] = None) -> None:
        self.config = config or get_pipeline_config()
        self.logger = get_logger("bhumi.ml.imd_ground_truth")

    def is_available(self) -> bool:
        """Check if authentic IMD ground-truth access credentials or records are configured."""
        return self.config.has_imd

    def get_validation_status(self) -> dict[str, Any]:
        """Report genuine IMD ground-truth availability status."""
        if not self.is_available():
            return {
                "available": False,
                "status": "IMD_VALIDATION_UNAVAILABLE",
                "reason": "IMD Pune credentials/bulletin archive not configured. Institutional registration pending.",
                "action": "Model utilizes verified Copernicus CDS and CHIRPS/IMERG satellite reanalysis ground-truth for internal evaluation.",
            }
        return {
            "available": True,
            "status": "IMD_VALIDATION_READY",
            "reason": "IMD credentials configured.",
        }

    def evaluate_against_imd(
        self,
        predicted_onset_dates: dict[str, str],
        season_year: int,
    ) -> dict[str, Any]:
        """Compare predicted onset dates against IMD official onset records if available."""
        if not self.is_available():
            self.logger.warning(
                f"Cannot evaluate season {season_year} against IMD ground truth: credentials unavailable."
            )
            return {
                "evaluated": False,
                "status": "IMD_VALIDATION_UNAVAILABLE",
                "message": "IMD Pune ground truth unavailable. No synthetic validation produced.",
            }

        # If credentials were configured in future, parse authentic IMD bulletin data here:
        return {
            "evaluated": False,
            "status": "IMD_VALIDATION_PENDING_SYNC",
            "message": "IMD credentials detected but historical onset bulletin table not populated.",
        }
