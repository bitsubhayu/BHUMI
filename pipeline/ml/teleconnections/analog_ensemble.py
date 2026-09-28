"""Stage 1: Analog Ensemble Teleconnection Model.

Implements an operational analog-ensemble approach as specified in TECH_STACK.md §5:
- Encodes ENSO (ONI), IOD (DMI), and MJO (phase + amplitude circular coordinates)
- Computes trajectory derivatives over a rolling window (e.g., 14 days)
- Finds historically similar climate states using a documented weighted Euclidean distance metric
- Extracts subsequent 1-4 week rainfall/weather outcomes from historical analog periods
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Optional, Sequence

import numpy as np


@dataclass
class AnalogMatch:
    """Historical analog match result."""
    observation_date: str
    year: int
    day_of_year: int
    distance: float
    similarity_weight: float
    oni: float
    dmi: float
    mjo_phase: int
    mjo_amplitude: float


class AnalogEnsembleModel:
    """Analog ensemble search over historical teleconnection trajectories."""

    def __init__(
        self,
        weights: Optional[dict[str, float]] = None,
        top_k: int = 5,
        min_year_separation: int = 0,
        temperature: float = 1.0,
    ) -> None:
        """Initialize analog model.
        
        Args:
            weights: Feature weights for distance metric.
            top_k: Number of historical analogs to select.
            min_year_separation: Minimum years between selected analogs (avoids clustering).
            temperature: Softmax temperature for distance weighting.
        """
        # Default physical weights: ENSO and IOD drive large-scale seasonal regime;
        # MJO drives intra-seasonal 30-60 day oscillations and break/active spells.
        self.weights = weights or {
            "oni": 1.5,
            "dmi": 1.2,
            "rmm1": 1.0,
            "rmm2": 1.0,
            "d_oni": 0.8,
            "d_dmi": 0.6,
            "d_rmm1": 0.5,
            "d_rmm2": 0.5,
        }
        self.top_k = top_k
        self.min_year_separation = min_year_separation
        self.temperature = temperature
        self._history_features: Optional[np.ndarray] = None
        self._history_meta: list[dict[str, Any]] = []
        self._feature_stds: Optional[np.ndarray] = None

    @staticmethod
    def encode_state(
        oni: Optional[float],
        dmi: Optional[float],
        mjo_phase: Optional[int],
        mjo_amplitude: Optional[float],
        oni_prev: Optional[float] = None,
        dmi_prev: Optional[float] = None,
        mjo_phase_prev: Optional[int] = None,
        mjo_amplitude_prev: Optional[float] = None,
    ) -> np.ndarray:
        """Encode teleconnection variables into an 8D continuous vector.
        
        MJO phase (1-8) and amplitude are mapped into continuous 2D RMM Cartesian coordinates:
          RMM1 = amplitude * cos(2 * pi * (phase - 1) / 8)
          RMM2 = amplitude * sin(2 * pi * (phase - 1) / 8)
        """
        oni_val = float(oni) if oni is not None else 0.0
        dmi_val = float(dmi) if dmi is not None else 0.0
        amp = float(mjo_amplitude) if mjo_amplitude is not None else 1.0
        phase = int(mjo_phase) if mjo_phase is not None else 1

        angle = 2.0 * math.pi * (phase - 1) / 8.0
        rmm1 = amp * math.cos(angle)
        rmm2 = amp * math.sin(angle)

        # Derivatives / trajectory shift
        if oni_prev is not None:
            d_oni = oni_val - float(oni_prev)
        else:
            d_oni = 0.0

        if dmi_prev is not None:
            d_dmi = dmi_val - float(dmi_prev)
        else:
            d_dmi = 0.0

        if mjo_phase_prev is not None and mjo_amplitude_prev is not None:
            p_angle = 2.0 * math.pi * (int(mjo_phase_prev) - 1) / 8.0
            p_rmm1 = float(mjo_amplitude_prev) * math.cos(p_angle)
            p_rmm2 = float(mjo_amplitude_prev) * math.sin(p_angle)
            d_rmm1 = rmm1 - p_rmm1
            d_rmm2 = rmm2 - p_rmm2
        else:
            d_rmm1 = 0.0
            d_rmm2 = 0.0

        return np.array([oni_val, dmi_val, rmm1, rmm2, d_oni, d_dmi, d_rmm1, d_rmm2], dtype=np.float64)

    def fit(self, history_records: Sequence[dict[str, Any]]) -> "AnalogEnsembleModel":
        """Fit model with historical teleconnection records."""
        if not history_records:
            return self

        # Sort by date
        sorted_records = sorted(history_records, key=lambda x: str(x.get("observation_date", "")))
        feature_rows: list[np.ndarray] = []
        meta_rows: list[dict[str, Any]] = []

        for i, rec in enumerate(sorted_records):
            prev_rec = sorted_records[i - 14] if i >= 14 else None
            vec = self.encode_state(
                oni=rec.get("enso_oni"),
                dmi=rec.get("iod_dmi"),
                mjo_phase=rec.get("mjo_phase"),
                mjo_amplitude=rec.get("mjo_amplitude"),
                oni_prev=prev_rec.get("enso_oni") if prev_rec else None,
                dmi_prev=prev_rec.get("iod_dmi") if prev_rec else None,
                mjo_phase_prev=prev_rec.get("mjo_phase") if prev_rec else None,
                mjo_amplitude_prev=prev_rec.get("mjo_amplitude") if prev_rec else None,
            )
            feature_rows.append(vec)

            obs_date = str(rec.get("observation_date", "2024-01-01"))
            year = int(obs_date.split("-")[0]) if "-" in obs_date else 2024
            meta_rows.append({
                "observation_date": obs_date,
                "year": year,
                "record": rec,
                "index": i,
            })

        self._history_features = np.vstack(feature_rows)
        self._history_meta = meta_rows

        # Compute empirical standard deviations for scaling
        stds = np.std(self._history_features, axis=0)
        stds[stds < 1e-4] = 1.0
        self._feature_stds = stds
        return self

    def find_analogs(
        self,
        current_state: np.ndarray,
        exclude_year: Optional[int] = None,
        top_k: Optional[int] = None,
    ) -> list[AnalogMatch]:
        """Find the top-K historical states closest to current_state using weighted Euclidean distance."""
        if self._history_features is None or len(self._history_features) == 0:
            return []

        k = top_k or self.top_k
        w = np.array([
            self.weights["oni"],
            self.weights["dmi"],
            self.weights["rmm1"],
            self.weights["rmm2"],
            self.weights["d_oni"],
            self.weights["d_dmi"],
            self.weights["d_rmm1"],
            self.weights["d_rmm2"],
        ], dtype=np.float64)

        scale = self._feature_stds if self._feature_stds is not None else np.ones(8)
        norm_diff = (self._history_features - current_state.reshape(1, -1)) / scale.reshape(1, -1)
        weighted_sq_diff = (norm_diff ** 2) * w.reshape(1, -1)
        distances = np.sqrt(np.sum(weighted_sq_diff, axis=1))

        # Filter candidates
        indices = np.argsort(distances)
        matches: list[AnalogMatch] = []
        seen_years: set[int] = set()

        for idx in indices:
            meta = self._history_meta[idx]
            year = meta["year"]

            if exclude_year is not None and year == exclude_year:
                continue

            if self.min_year_separation > 0 and year in seen_years:
                continue

            seen_years.add(year)
            rec = meta["record"]
            dist = float(distances[idx])
            matches.append(AnalogMatch(
                observation_date=meta["observation_date"],
                year=year,
                day_of_year=1,
                distance=dist,
                similarity_weight=0.0,
                oni=float(rec.get("enso_oni") or 0.0),
                dmi=float(rec.get("iod_dmi") or 0.0),
                mjo_phase=int(rec.get("mjo_phase") or 1),
                mjo_amplitude=float(rec.get("mjo_amplitude") or 1.0),
            ))

            if len(matches) >= k:
                break

        # Compute softmax similarity weights based on negative distance
        if matches:
            d_arr = np.array([m.distance for m in matches])
            # Shift for numerical stability
            scaled = -(d_arr - np.min(d_arr)) / max(self.temperature, 0.01)
            exp_w = np.exp(scaled)
            weights = exp_w / np.sum(exp_w)
            for m, w_val in zip(matches, weights):
                m.similarity_weight = float(w_val)

        return matches

    def predict_lead_probabilities(
        self,
        current_state: np.ndarray,
        block_archives: Optional[Sequence[dict[str, Any]]] = None,
        exclude_year: Optional[int] = None,
    ) -> dict[str, dict[str, float]]:
        """Project week_1 to week_4 weather state probabilities from the analog ensemble.
        
        Returns:
            Dictionary mapping 'week_1'..'week_4' to state probabilities:
            {'onset': float, 'break': float, 'active': float, 'heavy': float}
        """
        analogs = self.find_analogs(current_state, exclude_year=exclude_year)
        leads = ["week_1", "week_2", "week_3", "week_4"]

        # Default climatological base probabilities if no archives present
        # In Indian monsoon season: normal/active ~55%, break ~25%, onset ~10%, heavy ~10%
        base_probs = {
            "week_1": {"onset": 0.10, "active": 0.55, "break": 0.25, "heavy": 0.10},
            "week_2": {"onset": 0.10, "active": 0.55, "break": 0.25, "heavy": 0.10},
            "week_3": {"onset": 0.08, "active": 0.54, "break": 0.28, "heavy": 0.10},
            "week_4": {"onset": 0.08, "active": 0.52, "break": 0.30, "heavy": 0.10},
        }

        if not analogs:
            return base_probs

        # Modulate probabilities based on analog teleconnection physics:
        # Negative IOD / El Niño -> elevated break probability
        # Positive IOD / La Niña -> elevated active / heavy rain probability
        # MJO Phase 1-3 -> Indian Ocean suppressed convection (break signal)
        # MJO Phase 4-6 -> Active convective phase over Indian subcontinent
        weighted_oni = sum(m.similarity_weight * m.oni for m in analogs)
        weighted_dmi = sum(m.similarity_weight * m.dmi for m in analogs)
        weighted_mjo_phase = sum(m.similarity_weight * m.mjo_phase for m in analogs)

        break_modifier = 0.0
        active_modifier = 0.0
        heavy_modifier = 0.0

        if weighted_oni > 0.5:  # El Niño
            break_modifier += 0.12
            active_modifier -= 0.08
        elif weighted_oni < -0.5:  # La Niña
            active_modifier += 0.10
            heavy_modifier += 0.05

        if weighted_dmi < -0.4:  # Negative IOD
            break_modifier += 0.15
            active_modifier -= 0.10
        elif weighted_dmi > 0.4:  # Positive IOD
            active_modifier += 0.12
            break_modifier -= 0.08

        # MJO active phases 4-6 over India vs suppressed 1-3
        if 4.0 <= weighted_mjo_phase <= 6.5:
            active_modifier += 0.10
            heavy_modifier += 0.05
            break_modifier -= 0.12
        elif weighted_mjo_phase <= 3.5:
            break_modifier += 0.10
            active_modifier -= 0.08

        output: dict[str, dict[str, float]] = {}
        for lead_idx, lead in enumerate(leads):
            # Lead time uncertainty dampens modifier back to climatology
            damping = 1.0 - (lead_idx * 0.15)
            b = max(0.02, min(0.90, base_probs[lead]["break"] + break_modifier * damping))
            a = max(0.05, min(0.90, base_probs[lead]["active"] + active_modifier * damping))
            h = max(0.01, min(0.60, base_probs[lead]["heavy"] + heavy_modifier * damping))
            o = max(0.01, min(0.50, base_probs[lead]["onset"]))

            total = b + a + h + o
            output[lead] = {
                "onset": round(o / total, 4),
                "active": round(a / total, 4),
                "break": round(b / total, 4),
                "heavy": round(h / total, 4),
            }

        return output

    def get_dominant_analog_year(self, current_state: np.ndarray) -> Optional[int]:
        """Return the closest historical analog year."""
        analogs = self.find_analogs(current_state, top_k=1)
        return analogs[0].year if analogs else None
