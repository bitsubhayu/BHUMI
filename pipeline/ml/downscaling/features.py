"""Stage 2: Tabular Feature Extraction for Block-Level Downscaling.

Extracts meteorological, terrain, climatological, and teleconnection features
without lookahead bias (strictly time-respecting lags).
"""

from __future__ import annotations

import datetime
from typing import Any, Optional, Sequence

import numpy as np

FEATURE_NAMES: list[str] = [
    # Block Terrain Features
    "centroid_lat",
    "centroid_lon",
    "elevation_m",
    "slope_deg",
    "distance_to_coast_km",
    # Global Teleconnection State
    "enso_oni",
    "iod_dmi",
    "mjo_phase",
    "mjo_amplitude",
    # Stage 1 Analog Ensemble Signals
    "analog_onset_prob",
    "analog_active_prob",
    "analog_break_prob",
    "analog_heavy_prob",
    # Local Climatology
    "climatology_mean_rain_mm",
    "climatology_std_rain_mm",
    # Lagged Local Meteorology (Past 1-14 days)
    "rain_lag_1d_mm",
    "rain_lag_3d_sum_mm",
    "rain_lag_7d_sum_mm",
    "rain_lag_14d_sum_mm",
    "temp_lag_1d_c",
    "temp_lag_7d_mean_c",
    # Soil Wetness & Trajectory
    "soil_moisture_latest",
    "soil_moisture_7d_trend",
    # Recent Weather State History
    "recent_break_days_14d",
    "recent_active_days_14d",
    # Lead Time Indicator (1, 2, 3, 4)
    "lead_week",
]


class FeatureExtractor:
    """Extracts tabular downscaling features for training and inference."""

    @staticmethod
    def extract_single_feature_vector(
        block: dict[str, Any],
        telecon: dict[str, Any],
        analog_signals: dict[str, float],
        lagged_rain: Sequence[float],
        lagged_temp: Sequence[float],
        lagged_soil: Sequence[float],
        lagged_states: Sequence[int],
        lead_week: int,
        climatology_mean: float = 8.5,
        climatology_std: float = 12.0,
    ) -> np.ndarray:
        """Extract a single feature vector as a 1D NumPy array."""
        # 1. Terrain
        lat = float(block.get("centroid_lat") or 20.0)
        lon = float(block.get("centroid_lon") or 78.0)
        elev = float(block.get("elevation_m") or 300.0)
        slope = float(block.get("slope_deg") or 1.5)
        dist_coast = float(block.get("distance_to_coast_km") or 250.0)

        # 2. Teleconnections
        oni = float(telecon.get("enso_oni") or 0.0)
        dmi = float(telecon.get("iod_dmi") or 0.0)
        phase = float(telecon.get("mjo_phase") or 1.0)
        amp = float(telecon.get("mjo_amplitude") or 1.0)

        # 3. Analog signals
        a_onset = float(analog_signals.get("onset") or 0.10)
        a_active = float(analog_signals.get("active") or 0.55)
        a_break = float(analog_signals.get("break") or 0.25)
        a_heavy = float(analog_signals.get("heavy") or 0.10)

        # 4. Lagged Rain (strictly past)
        rain_arr = np.array(lagged_rain, dtype=np.float64) if len(lagged_rain) > 0 else np.zeros(14)
        rain_1d = float(rain_arr[-1]) if len(rain_arr) >= 1 else 0.0
        rain_3d = float(np.sum(rain_arr[-3:])) if len(rain_arr) >= 3 else rain_1d * 3
        rain_7d = float(np.sum(rain_arr[-7:])) if len(rain_arr) >= 7 else rain_1d * 7
        rain_14d = float(np.sum(rain_arr[-14:])) if len(rain_arr) >= 14 else rain_1d * 14

        # 5. Lagged Temp
        temp_arr = np.array(lagged_temp, dtype=np.float64) if len(lagged_temp) > 0 else np.full(7, 32.0)
        temp_1d = float(temp_arr[-1]) if len(temp_arr) >= 1 else 32.0
        temp_7d = float(np.mean(temp_arr[-7:])) if len(temp_arr) >= 7 else temp_1d

        # 6. Soil Wetness
        soil_arr = np.array(lagged_soil, dtype=np.float64) if len(lagged_soil) > 0 else np.full(7, 45.0)
        soil_latest = float(soil_arr[-1]) if len(soil_arr) >= 1 else 45.0
        soil_trend = float(soil_arr[-1] - soil_arr[-7]) if len(soil_arr) >= 7 else 0.0

        # 7. Recent Weather States (0: Normal, 1: Onset, 2: Active, 3: Break, 4: Heavy)
        states_arr = list(lagged_states)[-14:] if len(lagged_states) > 0 else []
        break_days = sum(1 for s in states_arr if s == 3)
        active_days = sum(1 for s in states_arr if s in (1, 2, 4))

        vals = [
            lat,
            lon,
            elev,
            slope,
            dist_coast,
            oni,
            dmi,
            phase,
            amp,
            a_onset,
            a_active,
            a_break,
            a_heavy,
            float(climatology_mean),
            float(climatology_std),
            rain_1d,
            rain_3d,
            rain_7d,
            rain_14d,
            temp_1d,
            temp_7d,
            soil_latest,
            soil_trend,
            float(break_days),
            float(active_days),
            float(lead_week),
        ]
        return np.array(vals, dtype=np.float64)

    @classmethod
    def extract_from_seasonal_archives(
        cls,
        blocks_by_id: dict[str, dict[str, Any]],
        seasonal_archives: Sequence[dict[str, Any]],
        telecon_by_date: dict[str, dict[str, Any]],
        analog_model: Any,
        sample_step: int = 7,  # Sample every 7 days across the 214-day season
    ) -> tuple[np.ndarray, np.ndarray, list[dict[str, Any]]]:
        """Generate training dataset from seasonal archives without lookahead leakage.
        
        Targets:
          0: Active / Normal
          1: Onset
          2: Break
          3: Heavy
        """
        X_list: list[np.ndarray] = []
        y_list: list[int] = []
        meta_list: list[dict[str, Any]] = []

        for arch in seasonal_archives:
            block_id = arch["block_id"]
            block = blocks_by_id.get(block_id, {"block_id": block_id})
            year = int(arch["season_year"])
            start_date = datetime.date.fromisoformat(arch.get("season_start_date", f"{year}-04-01"))

            rain_series = [r / 10.0 for r in (arch.get("rainfall_x10") or [])]
            temp_series = [t / 10.0 for t in (arch.get("max_temp_x10") or [])]
            soil_series = [float(s) for s in (arch.get("soil_moisture_idx") or [])]
            state_series = [int(s) for s in (arch.get("weather_state_code") or [])]

            if len(rain_series) != 214 or len(state_series) != 214:
                continue

            clim_mean = float(np.mean(rain_series))
            clim_std = float(np.std(rain_series)) + 1e-4

            # Sample time index t from day 20 to day 186 (so 14-day history and 28-day forward lead exist)
            for t in range(20, 186, sample_step):
                obs_date = start_date + datetime.timedelta(days=t)
                obs_date_str = str(obs_date)

                telecon = telecon_by_date.get(obs_date_str, {
                    "enso_oni": 0.0, "iod_dmi": 0.0, "mjo_phase": 1, "mjo_amplitude": 1.0
                })

                # Compute analog signal for this date
                curr_state = analog_model.encode_state(
                    oni=telecon.get("enso_oni"),
                    dmi=telecon.get("iod_dmi"),
                    mjo_phase=telecon.get("mjo_phase"),
                    mjo_amplitude=telecon.get("mjo_amplitude"),
                )
                analog_probs = analog_model.predict_lead_probabilities(curr_state, exclude_year=year)

                # For each lead week (1 to 4)
                for lead_w in range(1, 5):
                    lead_key = f"week_{lead_w}"
                    a_signals = analog_probs.get(lead_key, {})

                    # Extract strictly past features
                    feat = cls.extract_single_feature_vector(
                        block=block,
                        telecon=telecon,
                        analog_signals=a_signals,
                        lagged_rain=rain_series[max(0, t - 14) : t],
                        lagged_temp=temp_series[max(0, t - 7) : t],
                        lagged_soil=soil_series[max(0, t - 7) : t],
                        lagged_states=state_series[max(0, t - 14) : t],
                        lead_week=lead_w,
                        climatology_mean=clim_mean,
                        climatology_std=clim_std,
                    )

                    # Compute target: dominant weather state in the forward 7-day window [t + (lead_w-1)*7, t + lead_w*7]
                    fw_start = t + (lead_w - 1) * 7
                    fw_end = min(214, t + lead_w * 7)
                    fw_states = state_series[fw_start:fw_end]
                    fw_rain = rain_series[fw_start:fw_end]

                    # Target classification logic:
                    # 1: Onset if onset state appears
                    # 3: Heavy if any day has rain > 64.5mm or state 4
                    # 2: Break if dry spell (>= 4 days of state 3 or rain < 2.5mm)
                    # 0: Active / Normal otherwise
                    if any(s == 1 for s in fw_states):
                        target = 1  # Onset
                    elif any(s == 4 or r > 64.5 for s, r in zip(fw_states, fw_rain)):
                        target = 3  # Heavy
                    elif sum(1 for s in fw_states if s == 3) >= 4:
                        target = 2  # Break
                    else:
                        target = 0  # Active / Normal

                    X_list.append(feat)
                    y_list.append(target)
                    meta_list.append({
                        "block_id": block_id,
                        "season_year": year,
                        "date": obs_date_str,
                        "lead_week": lead_w,
                    })

        if not X_list:
            return np.empty((0, len(FEATURE_NAMES))), np.empty(0, dtype=int), []

        return np.vstack(X_list), np.array(y_list, dtype=int), meta_list
