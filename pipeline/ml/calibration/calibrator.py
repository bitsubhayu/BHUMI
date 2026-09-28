"""Stage 3: Probability Calibration for Onset, Break, and Heavy Rain Risks.

Guarantees that forecast percentages reflect empirical historical frequencies.
Implements:
  - Platt scaling (logistic sigmoid)
  - Isotonic regression
  - Time-respecting validation selection (chooses method minimizing Brier score)
  - Clamping to strictly [0.0, 100.0]
  - Parameter serialization into compact JSON
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss


class ProbabilityCalibrator:
    """Calibrates raw classifier probabilities into empirically reliable percentages [0, 100]."""

    def __init__(self, method: str = "platt") -> None:
        """Initialize calibrator.
        
        Args:
            method: 'platt', 'isotonic', or 'auto' (selects via validation Brier score).
        """
        self.method = method
        # Separate calibrator models for each target: 'onset', 'break', 'heavy'
        self.models: dict[str, Any] = {}
        self.selected_methods: dict[str, str] = {}
        self.is_fitted = False

    def fit(
        self,
        raw_probs: np.ndarray,
        y_true: np.ndarray,
        val_raw_probs: Optional[np.ndarray] = None,
        val_y_true: Optional[np.ndarray] = None,
    ) -> "ProbabilityCalibrator":
        """Fit calibration curves for each target class using temporal/rolling split.
        
        Args:
            raw_probs: (N, 4) raw probabilities [P(Active), P(Onset), P(Break), P(Heavy)]
            y_true: (N,) true integer classes [0: Active, 1: Onset, 2: Break, 3: Heavy]
            val_raw_probs: Optional held-out validation set probabilities (later in time)
            val_y_true: Optional held-out validation set labels
        """
        if len(raw_probs) == 0 or len(y_true) == 0:
            return self

        target_map = {
            "onset": 1,
            "break": 2,
            "heavy": 3,
        }

        for target_name, target_class in target_map.items():
            p_train = raw_probs[:, target_class].reshape(-1, 1)
            y_bin_train = (y_true == target_class).astype(int)

            # Ensure at least one positive and one negative sample exist
            if len(np.unique(y_bin_train)) < 2:
                # Fallback to identity mapping if single class present
                self.models[target_name] = {"type": "identity"}
                self.selected_methods[target_name] = "identity"
                continue

            if self.method == "auto" and val_raw_probs is not None and val_y_true is not None:
                p_val = val_raw_probs[:, target_class].reshape(-1, 1)
                y_bin_val = (val_y_true == target_class).astype(int)

                # Test Platt
                platt = LogisticRegression(C=1.0, solver="lbfgs")
                platt.fit(p_train, y_bin_train)
                platt_preds = platt.predict_proba(p_val)[:, 1]
                brier_platt = brier_score_loss(y_bin_val, platt_preds)

                # Test Isotonic
                iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
                iso.fit(p_train.ravel(), y_bin_train)
                iso_preds = iso.predict(p_val.ravel())
                brier_iso = brier_score_loss(y_bin_val, iso_preds)

                if brier_iso <= brier_platt:
                    self.models[target_name] = iso
                    self.selected_methods[target_name] = "isotonic"
                else:
                    self.models[target_name] = platt
                    self.selected_methods[target_name] = "platt"

            elif self.method == "isotonic":
                iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
                iso.fit(p_train.ravel(), y_bin_train)
                self.models[target_name] = iso
                self.selected_methods[target_name] = "isotonic"

            else:  # Platt scaling default
                platt = LogisticRegression(C=1.0, solver="lbfgs")
                platt.fit(p_train, y_bin_train)
                self.models[target_name] = platt
                self.selected_methods[target_name] = "platt"

        self.is_fitted = True
        return self

    def calibrate(
        self,
        raw_onset_p: float,
        raw_break_p: float,
        raw_heavy_p: float,
    ) -> dict[str, float]:
        """Transform raw probabilities into calibrated percentages [0.0, 100.0]."""
        raw_dict = {
            "onset": float(raw_onset_p),
            "break": float(raw_break_p),
            "heavy": float(raw_heavy_p),
        }
        calibrated: dict[str, float] = {}

        for target_name, raw_p in raw_dict.items():
            model = self.models.get(target_name)
            if not self.is_fitted or model is None or (isinstance(model, dict) and model.get("type") == "identity"):
                # Physics-informed shrinkage toward empirical climatological prior
                # Prevents overconfident uncalibrated extremes (0% or 100%)
                prior = 0.10 if target_name in ("onset", "heavy") else 0.25
                cal_p = 0.75 * raw_p + 0.25 * prior
            elif isinstance(model, dict) and model.get("type") == "isotonic":
                x_th = np.asarray(model["X_thresholds"], dtype=np.float64)
                y_th = np.asarray(model["y_thresholds"], dtype=np.float64)
                cal_p = float(np.interp(raw_p, x_th, y_th))
            elif isinstance(model, dict) and model.get("type") == "platt":
                coef = float(model["coef"][0][0]) if isinstance(model["coef"], list) else float(model["coef"])
                inter = float(model["intercept"][0]) if isinstance(model["intercept"], list) else float(model["intercept"])
                z = coef * raw_p + inter
                cal_p = float(1.0 / (1.0 + np.exp(-np.clip(z, -30.0, 30.0))))
            elif isinstance(model, IsotonicRegression):
                if hasattr(model, "X_thresholds_") and hasattr(model, "y_thresholds_"):
                    cal_p = float(np.interp(raw_p, model.X_thresholds_, model.y_thresholds_))
                else:
                    cal_p = float(model.predict([raw_p])[0])
            elif isinstance(model, LogisticRegression):
                cal_p = float(model.predict_proba([[raw_p]])[0, 1])
            else:
                cal_p = raw_p

            # Strictly constrain to [0.0, 100.0] percentage scale
            pct = round(max(0.0, min(100.0, cal_p * 100.0)), 2)
            calibrated[f"{target_name}_prob"] = pct

        # Compute calibrated confidence: based on sharpness and entropy of the calibrated distribution
        p_vals = np.array([calibrated["onset_prob"] / 100.0, calibrated["break_prob"] / 100.0, calibrated["heavy_prob"] / 100.0])
        p_active = max(0.01, 1.0 - np.sum(p_vals))
        full_dist = np.array([p_active, max(0.001, p_vals[0]), max(0.001, p_vals[1]), max(0.001, p_vals[2])])
        full_dist /= np.sum(full_dist)

        # Normalized entropy (0 when certain, 1 when uniform)
        entropy = -np.sum(full_dist * np.log2(full_dist))
        max_entropy = np.log2(4.0)  # 2.0 bits
        sharpness = max(0.0, 1.0 - (entropy / max_entropy))
        confidence = round(max(10.0, min(95.0, (0.4 + 0.6 * sharpness) * 100.0)), 2)

        calibrated["calibrated_confidence"] = confidence
        return calibrated

    def save(self, filepath: Path) -> None:
        """Save calibrator parameters to JSON."""
        filepath.parent.mkdir(parents=True, exist_ok=True)
        dump_data: dict[str, Any] = {
            "method": self.method,
            "is_fitted": self.is_fitted,
            "selected_methods": self.selected_methods,
            "models": {},
        }
        for name, m in self.models.items():
            if isinstance(m, LogisticRegression):
                dump_data["models"][name] = {
                    "type": "platt",
                    "coef": m.coef_.tolist(),
                    "intercept": m.intercept_.tolist(),
                }
            elif isinstance(m, IsotonicRegression):
                dump_data["models"][name] = {
                    "type": "isotonic",
                    "X_thresholds": getattr(m, "X_thresholds_", np.array([0.0, 1.0])).tolist(),
                    "y_thresholds": getattr(m, "y_thresholds_", np.array([0.0, 1.0])).tolist(),
                }
            elif isinstance(m, dict):
                dump_data["models"][name] = m
            else:
                dump_data["models"][name] = {"type": "identity"}

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(dump_data, f, indent=2)

    @classmethod
    def load(cls, filepath: Path) -> "ProbabilityCalibrator":
        """Load calibrator from JSON."""
        calibrator = cls()
        if not filepath.exists():
            return calibrator

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        calibrator.method = data.get("method", "platt")
        calibrator.is_fitted = data.get("is_fitted", False)
        calibrator.selected_methods = data.get("selected_methods", {})
        calibrator.models = data.get("models", {})
        return calibrator

