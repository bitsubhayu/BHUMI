"""Model Validation, Rolling Splits, and IMD Ground-Truth Verification.

Enforces strictly forward-in-time cross-validation and calculates
multi-dimensional probabilistic metrics (Brier score, ECE, log loss, ROC-AUC).
"""

from pipeline.ml.validation.rolling_split import RollingOriginSplitter
from pipeline.ml.validation.metrics import compute_probabilistic_metrics
from pipeline.ml.validation.imd_ground_truth import IMDGroundTruthAdapter

__all__ = ["RollingOriginSplitter", "compute_probabilistic_metrics", "IMDGroundTruthAdapter"]
