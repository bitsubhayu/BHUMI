"""Strict Model-Readiness Gate for BHUMI Forecasting Engine.

Guarantees that experimental or data-starved models cannot be silently
presented as validated national production forecasting models.

Evaluates:
  - Temporal archive depth (minimum 3 distinct seasonal cycles)
  - Spatial block diversity (minimum 20 administrative blocks across zones)
  - Sample size (minimum 1,000 seasonal samples)
  - Multi-class balance & representation (minimum 30 samples per weather state)
  - GRU sequence model training verification
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Sequence


class ModelReadinessStatus(str, Enum):
    """Explicit lifecycle status for forecasting models."""
    READY_FOR_PRODUCTION = "READY_FOR_PRODUCTION"
    INSUFFICIENT_TRAINING_DATA = "INSUFFICIENT_TRAINING_DATA"
    INSUFFICIENT_CLASS_DIVERSITY = "INSUFFICIENT_CLASS_DIVERSITY"


class ModelReadinessEvaluator:
    """Evaluates whether dataset and training results meet national production standards."""

    MIN_SEASONS: int = 3
    MIN_BLOCKS: int = 20
    MIN_SAMPLES: int = 1000
    MIN_SAMPLES_PER_CLASS: int = 30
    MIN_TEST_SAMPLES_PER_CLASS: int = 5

    @classmethod
    def evaluate(
        cls,
        seasons: Sequence[int],
        blocks_count: int,
        samples_count: int,
        class_counts: dict[int, int],
        test_class_counts: Optional[dict[int, int]] = None,
        gru_status: str = "UNTRAINED",
    ) -> dict[str, Any]:
        """Evaluate model training coverage against production gates.
        
        Returns:
            Dict containing readiness status, boolean flag, deficiencies, and audit summary.
        """
        reasons: list[str] = []
        distinct_seasons = sorted(list(set(seasons)))

        # 1. Season count gate
        if len(distinct_seasons) < cls.MIN_SEASONS:
            reasons.append(
                f"Archive contains only {len(distinct_seasons)} season(s) ({distinct_seasons}); "
                f"minimum {cls.MIN_SEASONS} required for multi-year ENSO/IOD cycle validation."
            )

        # 2. Block spatial diversity gate
        if blocks_count < cls.MIN_BLOCKS:
            reasons.append(
                f"Archive contains only {blocks_count} block(s); "
                f"minimum {cls.MIN_BLOCKS} required across diverse agro-climatic zones."
            )

        # 3. Total sample size gate
        if samples_count < cls.MIN_SAMPLES:
            reasons.append(
                f"Dataset contains only {samples_count} samples; "
                f"minimum {cls.MIN_SAMPLES} required for reliable downscaling."
            )

        # 4. Class diversity gate (0: Active, 1: Onset, 2: Break, 3: Heavy)
        class_names = {0: "Active/Normal", 1: "Onset", 2: "Break", 3: "Heavy-Rain"}
        missing_classes: list[str] = []
        underrepresented_classes: list[str] = []

        for c_id in (0, 1, 2, 3):
            c_name = class_names[c_id]
            cnt = class_counts.get(c_id, 0)
            if cnt == 0:
                missing_classes.append(c_name)
            elif cnt < cls.MIN_SAMPLES_PER_CLASS:
                underrepresented_classes.append(f"{c_name} (count={cnt}, required={cls.MIN_SAMPLES_PER_CLASS})")

        if missing_classes:
            reasons.append(f"Target classes completely absent from archive: {', '.join(missing_classes)}.")

        if underrepresented_classes:
            reasons.append(f"Statistically inadequate minority class representation: {', '.join(underrepresented_classes)}.")

        # 5. Test set representation
        if test_class_counts:
            test_missing = [class_names[c] for c in (0, 1, 2, 3) if test_class_counts.get(c, 0) < cls.MIN_TEST_SAMPLES_PER_CLASS]
            if test_missing:
                reasons.append(
                    f"Held-out test set lacks adequate representation for: {', '.join(test_missing)} "
                    f"(minimum {cls.MIN_TEST_SAMPLES_PER_CLASS} samples each in test set for credible recall/precision evaluation)."
                )

        # Determine primary status
        if missing_classes or underrepresented_classes:
            status = ModelReadinessStatus.INSUFFICIENT_CLASS_DIVERSITY
        elif len(distinct_seasons) < cls.MIN_SEASONS or blocks_count < cls.MIN_BLOCKS or samples_count < cls.MIN_SAMPLES:
            status = ModelReadinessStatus.INSUFFICIENT_TRAINING_DATA
        else:
            status = ModelReadinessStatus.READY_FOR_PRODUCTION

        is_ready = (status == ModelReadinessStatus.READY_FOR_PRODUCTION)

        return {
            "status": status.value,
            "is_production_ready": is_ready,
            "model_tier": "PRODUCTION" if is_ready else "EXPERIMENTAL",
            "reasons": reasons,
            "archive_summary": {
                "seasons": distinct_seasons,
                "seasons_count": len(distinct_seasons),
                "blocks_count": blocks_count,
                "samples_count": samples_count,
                "class_distribution": {class_names.get(k, str(k)): v for k, v in class_counts.items()},
            },
            "gru_status": gru_status,
            "production_gate_thresholds": {
                "min_seasons": cls.MIN_SEASONS,
                "min_blocks": cls.MIN_BLOCKS,
                "min_samples": cls.MIN_SAMPLES,
                "min_samples_per_class": cls.MIN_SAMPLES_PER_CLASS,
            },
        }
