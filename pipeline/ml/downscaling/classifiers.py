"""Stage 2: LightGBM + XGBoost 2-Model Ensemble Classifiers.

Implements the 2-model ensemble downscaling system specified in TECH_STACK.md §5:
- LightGBM primary classifier (fast, high capacity, handles block tabular data)
- XGBoost secondary classifier (regularized second opinion)
- Averaged probability output across onset, active, break, and heavy-rain categories
- Compact model artifact serialization (< 5 MB total)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import lightgbm as lgb
import numpy as np
import xgboost as xgb

from pipeline.ml.downscaling.features import FEATURE_NAMES


class DownscalingEnsemble:
    """Two-model ensemble (LightGBM + XGBoost) for block-level weather state prediction."""

    def __init__(
        self,
        lgb_weight: float = 0.50,
        random_state: int = 42,
    ) -> None:
        self.lgb_weight = lgb_weight
        self.xgb_weight = 1.0 - lgb_weight
        self.random_state = random_state

        self.lgb_model = lgb.LGBMClassifier(
            objective="multiclass",
            num_class=4,
            n_estimators=60,
            learning_rate=0.05,
            max_depth=4,
            num_leaves=15,
            min_child_samples=5,
            random_state=random_state,
            verbosity=-1,
        )

        self.xgb_model = xgb.XGBClassifier(
            objective="multi:softprob",
            num_class=4,
            n_estimators=50,
            learning_rate=0.05,
            max_depth=3,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=random_state,
            eval_metric="mlogloss",
        )

        self.is_fitted = False
        self.classes_ = np.array([0, 1, 2, 3])  # 0: Active, 1: Onset, 2: Break, 3: Heavy

    def fit(self, X: np.ndarray, y: np.ndarray) -> "DownscalingEnsemble":
        """Train LightGBM and XGBoost models on feature matrix X and multi-class target y."""
        if len(X) == 0 or len(y) == 0:
            return self

        unique_classes = np.unique(y)
        # Ensure at least 2 classes exist for training
        if len(unique_classes) < 2:
            self.is_fitted = False
            return self

        # Fit LightGBM
        self.lgb_model.fit(X, y)

        # Fit XGBoost
        self.xgb_model.fit(X, y)

        self.is_fitted = True
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Predict calibrated 4-state probability matrix (N, 4).
        
        Columns: [P(Active), P(Onset), P(Break), P(Heavy)].
        """
        if not self.is_fitted:
            # Fallback to physical prior based on input features (e.g. analog features in X)
            return self._heuristic_predict_proba(X)

        if hasattr(self.lgb_model, "predict_proba"):
            lgb_probs = self.lgb_model.predict_proba(X)
        else:
            lgb_probs = self.lgb_model.predict(X)

        if hasattr(self.xgb_model, "predict_proba"):
            xgb_probs = self.xgb_model.predict_proba(X)
        else:
            xgb_probs = self.xgb_model.predict(X)

        # Align shapes if any model had missing classes during fit
        lgb_probs = self._align_probs(lgb_probs, getattr(self.lgb_model, "classes_", self.classes_))
        xgb_probs = self._align_probs(xgb_probs, getattr(self.xgb_model, "classes_", self.classes_))

        ensemble_probs = (self.lgb_weight * lgb_probs) + (self.xgb_weight * xgb_probs)
        return ensemble_probs

    def _align_probs(self, raw_probs: np.ndarray, model_classes: np.ndarray) -> np.ndarray:
        """Ensure probability output is always (N, 4) aligned to [0, 1, 2, 3]."""
        n_samples = raw_probs.shape[0]
        aligned = np.zeros((n_samples, 4), dtype=np.float64)
        for idx, cls_id in enumerate(model_classes):
            if 0 <= cls_id < 4 and idx < raw_probs.shape[1]:
                aligned[:, cls_id] = raw_probs[:, idx]
        # Renormalize rows
        row_sums = aligned.sum(axis=1, keepdims=True)
        row_sums[row_sums == 0] = 1.0
        return aligned / row_sums

    def _heuristic_predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Domain physics prior when trained weights are uninitialized."""
        n_samples = X.shape[0]
        probs = np.zeros((n_samples, 4), dtype=np.float64)

        # FEATURE_NAMES:
        # idx 9: analog_onset_prob
        # idx 10: analog_active_prob
        # idx 11: analog_break_prob
        # idx 12: analog_heavy_prob
        for i in range(n_samples):
            a_onset = X[i, 9] if X.shape[1] > 9 else 0.10
            a_active = X[i, 10] if X.shape[1] > 10 else 0.55
            a_break = X[i, 11] if X.shape[1] > 11 else 0.25
            a_heavy = X[i, 12] if X.shape[1] > 12 else 0.10

            probs[i, 0] = a_active
            probs[i, 1] = a_onset
            probs[i, 2] = a_break
            probs[i, 3] = a_heavy

        row_sums = probs.sum(axis=1, keepdims=True)
        row_sums[row_sums == 0] = 1.0
        return probs / row_sums

    def save(self, directory: Path) -> None:
        """Save model artifacts to a directory."""
        directory.mkdir(parents=True, exist_ok=True)
        if self.is_fitted:
            self.lgb_model.booster_.save_model(str(directory / "lgb_downscaling.txt"))
            self.xgb_model.save_model(str(directory / "xgb_downscaling.json"))

        meta = {
            "is_fitted": self.is_fitted,
            "lgb_weight": self.lgb_weight,
            "xgb_weight": self.xgb_weight,
            "classes": [int(c) for c in self.classes_],
            "feature_names": FEATURE_NAMES,
        }
        with open(directory / "ensemble_meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

    @classmethod
    def load(cls, directory: Path) -> "DownscalingEnsemble":
        """Load trained models from directory if available."""
        ensemble = cls()
        meta_file = directory / "ensemble_meta.json"
        if not meta_file.exists():
            return ensemble

        with open(meta_file, "r", encoding="utf-8") as f:
            meta = json.load(f)

        ensemble.is_fitted = meta.get("is_fitted", False)
        ensemble.lgb_weight = meta.get("lgb_weight", 0.50)
        ensemble.xgb_weight = meta.get("xgb_weight", 0.50)

        lgb_path = directory / "lgb_downscaling.txt"
        if lgb_path.exists():
            ensemble.lgb_model = lgb.Booster(model_file=str(lgb_path))

        xgb_path = directory / "xgb_downscaling.json"
        if xgb_path.exists():
            xgb_clf = xgb.XGBClassifier()
            xgb_clf.load_model(str(xgb_path))
            ensemble.xgb_model = xgb_clf

        return ensemble
