"""Stage 1: Teleconnection Ensemble Combiner.

Combines the Analog Ensemble and the Small GRU sequence model into a
transparent, configurable ensemble as specified in TECH_STACK.md §5.
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
        analog_weight: float = 0.70,
        analog_model: Optional[AnalogEnsembleModel] = None,
        gru_model: Optional[SmallGRUModel] = None,
    ) -> None:
        self.analog_weight = analog_weight
        self.gru_weight = 1.0 - analog_weight
        self.analog_model = analog_model or AnalogEnsembleModel()
        self.gru_model = gru_model or SmallGRUModel()

    def fit(self, telecon_history: Sequence[dict[str, Any]]) -> "TeleconnectionEnsemble":
        """Fit analog and GRU models on historical teleconnection records."""
        self.analog_model.fit(telecon_history)
        return self

    def predict(
        self,
        recent_trajectory: Sequence[dict[str, Any]],
        exclude_year: Optional[int] = None,
    ) -> dict[str, Any]:
        """Generate combined teleconnection probabilities and identify analog year.
        
        Args:
            recent_trajectory: Sequence of recent daily teleconnection dicts (min 1, ideally 14-30).
            exclude_year: Year to exclude during cross-validation.
            
        Returns:
            Dict containing:
              - 'lead_probabilities': dict mapping week_1..week_4 to state probs
              - 'analog_year': int, closest historical match year
              - 'primary_driver': str, physical teleconnection explanation
              - 'secondary_driver': str, secondary factor
              - 'analog_matches': list of top matches
        """
        if not recent_trajectory:
            latest = {"enso_oni": 0.0, "iod_dmi": 0.0, "mjo_phase": 1, "mjo_amplitude": 1.0}
            trajectory = [latest]
        else:
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

        # 2. GRU sequence preparation: (seq_len, 5) -> [ONI, DMI, RMM1, RMM2, AMP]
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

        # 3. Transparent ensemble combination
        combined: dict[str, dict[str, float]] = {}
        for lead in ["week_1", "week_2", "week_3", "week_4"]:
            a_p = analog_probs.get(lead, {})
            g_p = gru_probs.get(lead, {})
            lead_res: dict[str, float] = {}
            for state in ["onset", "active", "break", "heavy"]:
                prob = self.analog_weight * a_p.get(state, 0.25) + self.gru_weight * g_p.get(state, 0.25)
                lead_res[state] = round(prob, 4)
            combined[lead] = lead_res

        # 4. Physical driver explainability attribution
        primary_driver, secondary_driver = self._determine_physical_drivers(
            latest=latest,
            analog_year=analog_year,
            combined_probs=combined,
        )

        return {
            "lead_probabilities": combined,
            "analog_year": analog_year or 2024,
            "primary_driver": primary_driver,
            "secondary_driver": secondary_driver,
            "analogs": analogs,
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
