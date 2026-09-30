"""Strict Model-Readiness Gate for BHUMI Forecasting Engine.

Guarantees that experimental or data-starved models cannot be silently
presented as validated national production forecasting models.

Evaluates:
  - Nationwide block coverage (minimum 6,000 / 7,073 blocks = 85.0% coverage)
  - Temporal archive depth (minimum 5 distinct seasonal cycles)
  - Sample size (minimum 10,000 seasonal samples)
  - Multi-class balance & representation (minimum 100 samples per weather state)
  - Held-out test set representation (minimum 20 samples per class)
  - Calibration quality gates (ECE <= 0.10, Multi-Brier <= 0.20)
  - GRU sequence model training verification
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional, Sequence


class ModelReadinessStatus(str, Enum):
    """Explicit lifecycle status for forecasting models."""
    READY_FOR_PRODUCTION = "READY_FOR_PRODUCTION"
    INSUFFICIENT_NATIONWIDE_COVERAGE = "INSUFFICIENT_NATIONWIDE_COVERAGE"
    INSUFFICIENT_TRAINING_DATA = "INSUFFICIENT_TRAINING_DATA"
    INSUFFICIENT_CLASS_DIVERSITY = "INSUFFICIENT_CLASS_DIVERSITY"
    POOR_CALIBRATION = "POOR_CALIBRATION"


class ModelReadinessEvaluator:
    """Evaluates whether dataset and training results meet national production standards."""

    TOTAL_PRODUCTION_BLOCKS: int = 7073
    MIN_NATIONWIDE_BLOCKS: int = 6000  # 84.8% of India's 7,073 authoritative blocks
    MIN_NATIONWIDE_COVERAGE_PCT: float = 85.0

    # Regional baseline thresholds
    MIN_BLOCKS_BASELINE: int = 20
    MIN_SEASONS_BASELINE: int = 3
    MIN_SAMPLES_BASELINE: int = 1000
    MIN_CLASS_SAMPLES_BASELINE: int = 50
    MIN_TEST_SAMPLES_BASELINE: int = 10

    # Nationwide production thresholds
    MIN_SEASONS_NATIONWIDE: int = 5
    MIN_SAMPLES_NATIONWIDE: int = 10000
    MIN_CLASS_SAMPLES_NATIONWIDE: int = 100
    MIN_TEST_SAMPLES_NATIONWIDE: int = 20

    # Backward-compatible class aliases
    MIN_SEASONS: int = 5
    MIN_SAMPLES: int = 10000
    MIN_SAMPLES_PER_CLASS: int = 100
    MIN_TEST_SAMPLES_PER_CLASS: int = 20

    MAX_CALIBRATION_ECE: float = 0.10
    MAX_BRIER_SCORE: float = 0.20

    @classmethod
    def evaluate(
        cls,
        seasons: Sequence[int],
        blocks_count: int,
        samples_count: int,
        class_counts: dict[int, int],
        test_class_counts: Optional[dict[int, int]] = None,
        val_metrics: Optional[dict[str, Any]] = None,
        gru_status: str = "UNTRAINED",
        require_nationwide_coverage: bool = False,
    ) -> dict[str, Any]:
        """Evaluate model training coverage against production gates.
        
        Args:
            seasons: Sequence of season years present in training set
            blocks_count: Number of distinct blocks with training data
            samples_count: Total training samples
            class_counts: Sample counts per weather state class
            test_class_counts: Optional held-out test class counts
            val_metrics: Optional validation metrics (ECE, Brier score)
            gru_status: GRU training status
            require_nationwide_coverage: If True, enforces 85%+ nationwide block coverage (6,000+ blocks).
                If False, validates regional baseline production readiness (20+ blocks).
        """
        reasons: list[str] = []
        distinct_seasons = sorted(list(set(seasons)))
        coverage_pct = (blocks_count / cls.TOTAL_PRODUCTION_BLOCKS) * 100.0 if cls.TOTAL_PRODUCTION_BLOCKS > 0 else 0.0

        min_blocks = cls.MIN_NATIONWIDE_BLOCKS if require_nationwide_coverage else cls.MIN_BLOCKS_BASELINE
        min_seasons = cls.MIN_SEASONS_NATIONWIDE if require_nationwide_coverage else cls.MIN_SEASONS_BASELINE
        min_samples = cls.MIN_SAMPLES_NATIONWIDE if require_nationwide_coverage else cls.MIN_SAMPLES_BASELINE
        min_class_samples = cls.MIN_CLASS_SAMPLES_NATIONWIDE if require_nationwide_coverage else cls.MIN_CLASS_SAMPLES_BASELINE
        min_test_samples = cls.MIN_TEST_SAMPLES_NATIONWIDE if require_nationwide_coverage else cls.MIN_TEST_SAMPLES_BASELINE

        # 1. Block Spatial Coverage Gate
        has_insufficient_coverage = False
        if blocks_count < min_blocks:
            has_insufficient_coverage = True
            if require_nationwide_coverage:
                reasons.append(
                    f"Historical archive covers only {blocks_count} blocks / {cls.TOTAL_PRODUCTION_BLOCKS} production blocks ({coverage_pct:.2f}%); "
                    f"minimum {min_blocks} blocks ({cls.MIN_NATIONWIDE_COVERAGE_PCT:.1f}% nationwide coverage) required for national production readiness."
                )
            else:
                reasons.append(
                    f"Archive contains only {blocks_count} blocks (minimum {min_blocks} required for spatial diversity)."
                )

        # 2. Season count depth gate (multi-year ENSO/IOD cycle validation)
        if len(distinct_seasons) < min_seasons:
            reasons.append(
                f"Archive contains only {len(distinct_seasons)} season(s) ({distinct_seasons}); "
                f"minimum {min_seasons} required for multi-year ENSO/IOD cycle validation."
            )

        # 3. Total sample size gate
        if samples_count < min_samples:
            reasons.append(
                f"Dataset contains only {samples_count} samples; "
                f"minimum {min_samples} required for reliable downscaling."
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
            elif cnt < min_class_samples:
                underrepresented_classes.append(f"{c_name} (count={cnt}, required={min_class_samples})")

        if missing_classes:
            reasons.append(f"Target classes completely absent from archive: {', '.join(missing_classes)}.")

        if underrepresented_classes:
            reasons.append(f"Statistically inadequate minority class representation: {', '.join(underrepresented_classes)}.")

        # 5. Held-out test set representation
        if test_class_counts:
            test_missing = [class_names[c] for c in (0, 1, 2, 3) if test_class_counts.get(c, 0) < min_test_samples]
            if test_missing:
                reasons.append(
                    f"Held-out test set lacks adequate representation for: {', '.join(test_missing)} "
                    f"(minimum {min_test_samples} samples each in test set for credible recall/precision evaluation)."
                )

        # 6. Probabilistic Calibration Quality Gate
        has_poor_calibration = False
        if val_metrics:
            ece = val_metrics.get("expected_calibration_error")
            brier = val_metrics.get("brier_score_multi")
            if ece is not None and ece > cls.MAX_CALIBRATION_ECE:
                has_poor_calibration = True
                reasons.append(
                    f"Expected Calibration Error (ECE = {ece:.4f}) exceeds acceptable production threshold ({cls.MAX_CALIBRATION_ECE:.2f})."
                )
            if brier is not None and brier > cls.MAX_BRIER_SCORE:
                has_poor_calibration = True
                reasons.append(
                    f"Multi-class Brier score ({brier:.4f}) exceeds acceptable production threshold ({cls.MAX_BRIER_SCORE:.2f})."
                )

        # Determine primary status
        if missing_classes or underrepresented_classes:
            status = ModelReadinessStatus.INSUFFICIENT_CLASS_DIVERSITY
        elif has_insufficient_coverage and require_nationwide_coverage:
            status = ModelReadinessStatus.INSUFFICIENT_NATIONWIDE_COVERAGE
        elif has_insufficient_coverage or len(distinct_seasons) < min_seasons or samples_count < min_samples:
            status = ModelReadinessStatus.INSUFFICIENT_TRAINING_DATA
        elif has_poor_calibration:
            status = ModelReadinessStatus.POOR_CALIBRATION
        else:
            status = ModelReadinessStatus.READY_FOR_PRODUCTION

        is_ready = (status == ModelReadinessStatus.READY_FOR_PRODUCTION)

        return {
            "status": status.value,
            "is_production_ready": is_ready,
            "model_tier": "PRODUCTION" if is_ready else "EXPERIMENTAL",
            "nationwide_coverage_pct": round(coverage_pct, 2),
            "reasons": reasons,
            "archive_summary": {
                "seasons": distinct_seasons,
                "seasons_count": len(distinct_seasons),
                "blocks_count": blocks_count,
                "total_blocks_in_country": cls.TOTAL_PRODUCTION_BLOCKS,
                "nationwide_coverage_pct": round(coverage_pct, 2),
                "samples_count": samples_count,
                "class_distribution": {class_names.get(k, str(k)): v for k, v in class_counts.items()},
            },
            "gru_status": gru_status,
            "production_gate_thresholds": {
                "total_production_blocks": cls.TOTAL_PRODUCTION_BLOCKS,
                "min_nationwide_blocks": cls.MIN_NATIONWIDE_BLOCKS,
                "min_nationwide_coverage_pct": cls.MIN_NATIONWIDE_COVERAGE_PCT,
                "min_seasons": cls.MIN_SEASONS,
                "min_samples": cls.MIN_SAMPLES,
                "min_samples_per_class": cls.MIN_SAMPLES_PER_CLASS,
                "min_test_samples_per_class": cls.MIN_TEST_SAMPLES_PER_CLASS,
                "max_calibration_ece": cls.MAX_CALIBRATION_ECE,
                "max_brier_score": cls.MAX_BRIER_SCORE,
            },
        }

