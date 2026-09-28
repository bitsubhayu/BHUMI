"""Stage 1: Teleconnection Ensemble Combiner.

Combines the Analog Ensemble and the Small GRU sequence model into a
transparent, configurable ensemble as specified in TECH_STACK.md §5:
- Strict gate: untrained or random GRU is NEVER used in production
- When GRU training data is insufficient, GRU is explicitly disabled (weight = 0.0)
- Stage 1 falls back gracefully to Analog Ensemble only
"""

from __future__ import annotations

import math
from typing import Any, Optional, Sequence

import numpy as np

from pipeline.ml.teleconnections.analog_ensemble import AnalogEnsembleModel
from pipeline.ml.teleconnections.gru_model import SmallGRUModel


class TeleconnectionEnsemble:
    """Configurable ensemble combining Analog Ensemble and GRU sequence model."""

    def __init__(
        self,
        analog_model: Optional[AnalogEnsembleModel] = None,
        gru_model: Optional[SmallGRUModel] = None,
    ) -> None:
        self.analog_model = analog_model or AnalogEnsembleModel()
        self.gru_model = gru_model or SmallGRUModel()

        # Strict safety gating: GRU is disabled by default until genuinely trained!
        if self.gru_model.is_trained:
            self.gru_enabled: bool = True
            self.gru_status: str = "TRAINED"
            self.analog_weight: float = 0.70
            self.gru_weight: float = 0.30
        else:
            self.gru_enabled: bool = False
            self.gru_status: str = "DISABLED_UNTRAINED"
            self.analog_weight: float = 1.0
            self.gru_weight: float = 0.0

    def fit(
        self,
        telecon_history: Sequence[dict[str, Any]],
        X_seqs: Optional[np.ndarray] = None,
        y_targets: Optional[np.ndarray] = None,
    ) -> "TeleconnectionEnsemble":
        """Fit analog and GRU models on historical teleconnection records and target outcomes.
        
        Args:
            telecon_history: Daily teleconnection index history
            X_seqs: Optional extracted teleconnection sequences (N, 30, 5)
            y_targets: Optional target lead distributions (N, 4, 4)
        """
        # 1. Fit Analog Ensemble
        self.analog_model.fit(telecon_history)

        # 2. Train GRU only if sufficient genuine training data is provided
        # Scientific requirement: minimum 100 sequences required to train GRU
        if X_seqs is not None and y_targets is not None and len(X_seqs) >= 100:
            try:
                res = self.gru_model.train_supervised(X_seqs, y_targets, epochs=25, lr=0.01)
                if self.gru_model.is_trained and self.gru_model.weight_delta_norm > 1e-4:
                    self.gru_enabled = True
                    self.gru_status = "TRAINED"
                    self.analog_weight = 0.70
                    self.gru_weight = 0.30
                else:
                    self.gru_enabled = False
                    self.gru_status = "DISABLED_VALIDATION_FAILURE"
                    self.analog_weight = 1.0
                    self.gru_weight = 0.0
            except Exception:
                self.gru_enabled = False
                self.gru_status = "DISABLED_TRAINING_ERROR"
                self.analog_weight = 1.0
                self.gru_weight = 0.0
        else:
            # Data insufficient: DO NOT use random GRU in production!
            self.gru_enabled = False
            seq_count = len(X_seqs) if X_seqs is not None else 0
            self.gru_status = f"DISABLED_INSUFFICIENT_TRAINING_DATA (samples={seq_count}, required=100)"
            self.analog_weight = 1.0
            self.gru_weight = 0.0

        return self

    def predict(
        self,
        recent_trajectory: Sequence[dict[str, Any]],
        exclude_year: Optional[int] = None,
    ) -> dict[str, Any]:
        """Generate combined teleconnection probabilities and identify analog year."""
        if not recent_trajectory:
            raise ValueError("recent_trajectory cannot be empty for teleconnection prediction")

        trajectory = list(recent_trajectory)
        latest = trajectory[-1]
        prev_14 = trajectory[-14] if len(trajectory) >= 14 else trajectory[0]

        # 1. State encoding for analog
        current_state = AnalogEnsembleModel.encode_state(
            oni=latest.get("enso_oni"),
            dmi=latest.get("iod_dmi"),
            mjo_phase=latest.get("mjo_phase"),
            mjo_amplitude=latest.get("mjo_amplitude"),
            oni_prev=prev_14.get("enso_oni"),
            dmi_prev=prev_14.get("iod_dmi"),
            mjo_phase_prev=prev_14.get("mjo_phase"),
            mjo_amplitude_prev=prev_14.get("mjo_amplitude"),
        )

        analog_probs = self.analog_model.predict_lead_probabilities(current_state, exclude_year=exclude_year)
        analog_year = self.analog_model.get_dominant_analog_year(current_state)
        analogs = self.analog_model.find_analogs(current_state, exclude_year=exclude_year)

        # 2. GRU sequence preparation only if GRU is trained and enabled
        gru_probs: dict[str, dict[str, float]] = {}
        if self.gru_enabled and self.gru_weight > 0.0:
            seq_vectors: list[list[float]] = []
            for t in trajectory[-30:]:
                amp = float(t.get("mjo_amplitude") or 1.0)
                phase = int(t.get("mjo_phase") or 1)
                ang = 2.0 * math.pi * (phase - 1) / 8.0
                seq_vectors.append([
                    float(t.get("enso_oni") or 0.0),
                    float(t.get("iod_dmi") or 0.0),
                    amp * math.cos(ang),
                    amp * math.sin(ang),
                    amp,
                ])
            gru_input = np.array(seq_vectors, dtype=np.float64)
            gru_probs = self.gru_model.predict_lead_probabilities(gru_input)

        # 3. Ensemble combination (if GRU disabled, strictly 100% Analog Ensemble)
        combined: dict[str, dict[str, float]] = {}
        for lead in ["week_1", "week_2", "week_3", "week_4"]:
            a_p = analog_probs.get(lead, {})
            lead_res: dict[str, float] = {}
            for state in ["onset", "active", "break", "heavy"]:
                if self.gru_enabled and self.gru_weight > 0.0:
                    g_p = gru_probs.get(lead, {})
                    prob = self.analog_weight * a_p.get(state, 0.25) + self.gru_weight * g_p.get(state, 0.25)
                else:
                    prob = a_p.get(state, 0.25)
                lead_res[state] = round(float(prob), 4)
            combined[lead] = lead_res

        # 4. Physical driver explainability attribution
        primary_driver, secondary_driver = self._determine_physical_drivers(
            latest=latest,
            analog_year=analog_year,
            combined_probs=combined,
        )

        return {
            "lead_probabilities": combined,
            "analog_year": analog_year,
            "primary_driver": primary_driver,
            "secondary_driver": secondary_driver,
            "analogs": analogs,
            "gru_status": self.gru_status,
            "gru_enabled": self.gru_enabled,
            "weights": {"analog": self.analog_weight, "gru": self.gru_weight},
        }

    def _determine_physical_drivers(
        self,
        latest: dict[str, Any],
        analog_year: Optional[int],
        combined_probs: dict[str, dict[str, float]],
    ) -> tuple[str, str]:
        """Derive 1-2 dominant physical drivers based on actual physical values."""
        oni = float(latest.get("enso_oni") or 0.0)
        dmi = float(latest.get("iod_dmi") or 0.0)
        phase = int(latest.get("mjo_phase") or 1)
        amp = float(latest.get("mjo_amplitude") or 1.0)

        # Teleconnection state labels
        if oni >= 0.5:
            enso_str = f"El Niño signal (ONI +{oni:.2f})"
        elif oni <= -0.5:
            enso_str = f"La Niña signal (ONI {oni:.2f})"
        else:
            enso_str = f"ENSO-neutral (ONI {oni:+.2f})"

        if dmi <= -0.4:
            iod_str = f"Negative IOD (DMI {dmi:.2f})"
        elif dmi >= 0.4:
            iod_str = f"Positive IOD (DMI +{dmi:.2f})"
        else:
            iod_str = f"Neutral IOD (DMI {dmi:+.2f})"

        # MJO convective status
        if 4 <= phase <= 6 and amp >= 1.0:
            mjo_str = f"MJO Phase {phase} (enhanced convection over India)"
        elif phase in (1, 2, 8) and amp >= 1.0:
            mjo_str = f"MJO Phase {phase} (suppressed convection / break favorable)"
        else:
            mjo_str = f"MJO Phase {phase} (amp {amp:.1f})"

        # Determine dominant driver based on highest anomaly
        abs_oni = abs(oni) / 1.5
        abs_dmi = abs(dmi) / 0.8
        mjo_sig = (amp / 2.0) if phase in (1, 2, 4, 5, 6) else 0.2

        drivers = [
            (abs_dmi, iod_str),
            (abs_oni, enso_str),
            (mjo_sig, mjo_str),
        ]
        drivers.sort(key=lambda x: x[0], reverse=True)

        primary = f"{drivers[0][1]} + {drivers[1][1]}"
        if analog_year:
            secondary = f"{drivers[2][1]} (analogous to {analog_year} teleconnection regime)"
        else:
            secondary = f"{drivers[2][1]} (recent trajectory consensus)"

        return primary, secondary
