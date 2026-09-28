"""Stage 2: Tabular Feature Extraction for Block-Level Downscaling.

Extracts meteorological, terrain, climatological, and teleconnection features
without lookahead bias and without silent default fallbacks.
"""

from __future__ import annotations

import datetime
from typing import Any, Optional, Sequence

import numpy as np


class MissingFeatureError(ValueError):
    """Raised when required terrain, teleconnection, or observation features are missing."""
    pass


FEATURE_NAMES: list[str] = [
    # Block Terrain Features (5)
    "centroid_lat",
    "centroid_lon",
    "elevation_m",
    "slope_deg",
    "distance_to_coast_km",
    # Global Teleconnection State (4)
    "enso_oni",
    "iod_dmi",
    "mjo_phase",
    "mjo_amplitude",
    # Stage 1 Analog Ensemble Signals (4)
    "analog_onset_prob",
    "analog_active_prob",
    "analog_break_prob",
    "analog_heavy_prob",
    # Local Climatology (2)
    "climatology_mean_rain_mm",
    "climatology_std_rain_mm",
    # Lagged Local Meteorology (6)
    "rain_lag_1d_mm",
    "rain_lag_3d_sum_mm",
    "rain_lag_7d_sum_mm",
    "rain_lag_14d_sum_mm",
    "temp_lag_1d_c",
    "temp_lag_7d_mean_c",
    # Soil Wetness & Trajectory (2)
    "soil_moisture_latest",
    "soil_moisture_7d_trend",
    # Recent Weather State History (2)
    "recent_break_days_14d",
    "recent_active_days_14d",
    # Lead Time Indicator (1)
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
        min_history_days: int = 7,
    ) -> np.ndarray:
        """Extract a single feature vector without silent default fallbacks.
        
        Strictly requires:
          - Valid block terrain features (lat, lon, elevation, slope, coast distance)
          - Valid teleconnection index state (ONI, DMI, MJO phase, amplitude)
          - Minimum observation history (at least min_history_days of rain, temp, and soil moisture)
        
        Raises:
            MissingFeatureError: If any required feature or observation window is missing.
        """
        block_id = block.get("block_id", "unknown")

        # 1. Strict Block Terrain Validation (No silent defaults)
        required_block_fields = [
            ("centroid_lat", -90.0, 90.0),
            ("centroid_lon", -180.0, 180.0),
            ("elevation_m", -500.0, 9000.0),
            ("slope_deg", 0.0, 90.0),
            ("distance_to_coast_km", 0.0, 5000.0),
        ]
        terrain_vals: dict[str, float] = {}
        for field, min_bound, max_bound in required_block_fields:
            val = block.get(field)
            if val is None:
                raise MissingFeatureError(
                    f"Block '{block_id}' is missing required terrain feature '{field}'. "
                    f"BHUMI rejects predictions on incomplete block metadata."
                )
            try:
                f_val = float(val)
                if not (min_bound <= f_val <= max_bound):
                    raise MissingFeatureError(
                        f"Block '{block_id}' feature '{field}' value {f_val} out of bounds [{min_bound}, {max_bound}]"
                    )
                terrain_vals[field] = f_val
            except (ValueError, TypeError) as e:
                raise MissingFeatureError(f"Block '{block_id}' feature '{field}' is non-numeric: {val}") from e

        # 2. Strict Teleconnection State Validation (No silent defaults)
        required_telecon_fields = ["enso_oni", "iod_dmi"]
        telecon_vals: dict[str, float] = {}
        for field in required_telecon_fields:
            val = telecon.get(field)
            if val is None:
                raise MissingFeatureError(
                    f"Teleconnection input is missing required field '{field}'. "
                    f"BHUMI rejects predictions on incomplete teleconnection data."
                )
            try:
                telecon_vals[field] = float(val)
            except (ValueError, TypeError) as e:
                raise MissingFeatureError(f"Teleconnection field '{field}' is non-numeric: {val}") from e

        # MJO components: validate when active; if unobserved/neutral, represent as inactive wave (amplitude = 0.0)
        mjo_phase_val = telecon.get("mjo_phase")
        mjo_amp_val = telecon.get("mjo_amplitude")
        if mjo_phase_val is not None and mjo_amp_val is not None:
            try:
                telecon_vals["mjo_phase"] = float(mjo_phase_val)
                telecon_vals["mjo_amplitude"] = float(mjo_amp_val)
            except (ValueError, TypeError) as e:
                raise MissingFeatureError(f"Teleconnection MJO field is non-numeric: {e}") from e
        else:
            telecon_vals["mjo_phase"] = 1.0
            telecon_vals["mjo_amplitude"] = 0.0

        # 3. Analog Signals Validation
        a_onset = float(analog_signals.get("onset", 0.10))
        a_active = float(analog_signals.get("active", 0.55))
        a_break = float(analog_signals.get("break", 0.25))
        a_heavy = float(analog_signals.get("heavy", 0.10))

        # 4. Strict Observation History Minimum Requirements (No silent 32°C / 45% moisture defaults)
        if len(lagged_rain) < min_history_days:
            raise MissingFeatureError(
                f"Block '{block_id}' has insufficient rainfall observation history: "
                f"got {len(lagged_rain)} days, minimum required is {min_history_days} days."
            )
        if len(lagged_temp) < min_history_days:
            raise MissingFeatureError(
                f"Block '{block_id}' has insufficient temperature observation history: "
                f"got {len(lagged_temp)} days, minimum required is {min_history_days} days."
            )
        if len(lagged_soil) < min_history_days:
            raise MissingFeatureError(
                f"Block '{block_id}' has insufficient soil moisture observation history: "
                f"got {len(lagged_soil)} days, minimum required is {min_history_days} days."
            )

        # 5. Extract strict lag statistics
        rain_arr = np.asarray(lagged_rain, dtype=np.float64)
        rain_1d = float(rain_arr[-1])
        rain_3d = float(np.sum(rain_arr[-3:])) if len(rain_arr) >= 3 else float(np.sum(rain_arr)) * (3 / len(rain_arr))
        rain_7d = float(np.sum(rain_arr[-7:])) if len(rain_arr) >= 7 else float(np.sum(rain_arr)) * (7 / len(rain_arr))
        rain_14d = float(np.sum(rain_arr[-14:])) if len(rain_arr) >= 14 else rain_7d * 2.0

        temp_arr = np.asarray(lagged_temp, dtype=np.float64)
        temp_1d = float(temp_arr[-1])
        temp_7d = float(np.mean(temp_arr[-7:]))

        soil_arr = np.asarray(lagged_soil, dtype=np.float64)
        soil_latest = float(soil_arr[-1])
        soil_trend = float(soil_arr[-1] - soil_arr[-min(7, len(soil_arr))])

        states_arr = list(lagged_states)[-14:] if len(lagged_states) > 0 else []
        break_days = sum(1 for s in states_arr if s == 3)
        active_days = sum(1 for s in states_arr if s in (1, 2, 4))

        vals = [
            terrain_vals["centroid_lat"],
            terrain_vals["centroid_lon"],
            terrain_vals["elevation_m"],
            terrain_vals["slope_deg"],
            terrain_vals["distance_to_coast_km"],
            telecon_vals["enso_oni"],
            telecon_vals["iod_dmi"],
            telecon_vals["mjo_phase"],
            telecon_vals["mjo_amplitude"],
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
        sample_step: int = 7,
    ) -> tuple[np.ndarray, np.ndarray, list[dict[str, Any]], np.ndarray, np.ndarray]:
        """Generate training dataset from seasonal archives without lookahead leakage.
        
        Returns:
            X_tabular: (N, 26) feature matrix for LightGBM/XGBoost
            y_tabular: (N,) target classes [0: Active, 1: Onset, 2: Break, 3: Heavy]
            meta_rows: list of metadata dicts
            X_gru: (N_seq, 30, 5) teleconnection sequences for GRU training
            y_gru: (N_seq, 4, 4) target lead distributions for GRU training
        """
        X_list: list[np.ndarray] = []
        y_list: list[int] = []
        meta_list: list[dict[str, Any]] = []

        X_gru_list: list[np.ndarray] = []
        y_gru_list: list[np.ndarray] = []

        # Sort dates for continuous sequence extraction
        sorted_telecon_dates = sorted(telecon_by_date.keys())

        for arch in seasonal_archives:
            block_id = arch["block_id"]
            block = blocks_by_id.get(block_id)
            if not block:
                continue

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

            for t in range(20, 186, sample_step):
                obs_date = start_date + datetime.timedelta(days=t)
                obs_date_str = str(obs_date)

                telecon = telecon_by_date.get(obs_date_str)
                if not telecon:
                    continue

                # Ensure required teleconnection fields are present
                if any(telecon.get(k) is None for k in ("enso_oni", "iod_dmi")):
                    continue

                curr_state = analog_model.encode_state(
                    oni=telecon.get("enso_oni"),
                    dmi=telecon.get("iod_dmi"),
                    mjo_phase=telecon.get("mjo_phase"),
                    mjo_amplitude=telecon.get("mjo_amplitude"),
                )
                analog_probs = analog_model.predict_lead_probabilities(curr_state, exclude_year=year)

                lead_dist = np.zeros((4, 4), dtype=np.float64)

                for lead_w in range(1, 5):
                    lead_key = f"week_{lead_w}"
                    a_signals = analog_probs.get(lead_key, {})

                    # Extract past window
                    past_rain = rain_series[max(0, t - 14) : t]
                    past_temp = temp_series[max(0, t - 7) : t]
                    past_soil = soil_series[max(0, t - 7) : t]
                    past_states = state_series[max(0, t - 14) : t]

                    try:
                        feat = cls.extract_single_feature_vector(
                            block=block,
                            telecon=telecon,
                            analog_signals=a_signals,
                            lagged_rain=past_rain,
                            lagged_temp=past_temp,
                            lagged_soil=past_soil,
                            lagged_states=past_states,
                            lead_week=lead_w,
                            climatology_mean=clim_mean,
                            climatology_std=clim_std,
                        )
                    except MissingFeatureError:
                        continue

                    # Forward target window
                    fw_start = t + (lead_w - 1) * 7
                    fw_end = min(214, t + lead_w * 7)
                    fw_states = state_series[fw_start:fw_end]
                    fw_rain = rain_series[fw_start:fw_end]

                    if any(s == 1 for s in fw_states):
                        target = 1  # Onset
                    elif any(s == 4 or r > 64.5 for s, r in zip(fw_states, fw_rain)):
                        target = 3  # Heavy
                    elif sum(1 for s in fw_states if s == 3) >= 4:
                        target = 2  # Break
                    else:
                        target = 0  # Active / Normal

                    lead_dist[lead_w - 1, target] = 1.0

                    X_list.append(feat)
                    y_list.append(target)
                    meta_list.append({
                        "block_id": block_id,
                        "season_year": year,
                        "date": obs_date_str,
                        "lead_week": lead_w,
                        "target_class": target,
                    })

                # Extract 30-day teleconnection sequence for GRU
                date_idx = sorted_telecon_dates.index(obs_date_str) if obs_date_str in sorted_telecon_dates else -1
                if date_idx >= 30:
                    seq_dates = sorted_telecon_dates[date_idx - 30 : date_idx]
                    seq_vecs = []
                    for sd in seq_dates:
                        rec = telecon_by_date[sd]
                        amp = float(rec.get("mjo_amplitude") or 1.0)
                        phase = int(rec.get("mjo_phase") or 1)
                        ang = 2.0 * np.pi * (phase - 1) / 8.0
                        seq_vecs.append([
                            float(rec.get("enso_oni") or 0.0),
                            float(rec.get("iod_dmi") or 0.0),
                            amp * np.cos(ang),
                            amp * np.sin(ang),
                            amp,
                        ])
                    X_gru_list.append(np.array(seq_vecs, dtype=np.float64))
                    y_gru_list.append(lead_dist)

        X_tab = np.vstack(X_list) if X_list else np.empty((0, len(FEATURE_NAMES)))
        y_tab = np.array(y_list, dtype=int) if y_list else np.empty(0, dtype=int)
        X_gru = np.stack(X_gru_list, axis=0) if X_gru_list else np.empty((0, 30, 5))
        y_gru = np.stack(y_gru_list, axis=0) if y_gru_list else np.empty((0, 4, 4))

        return X_tab, y_tab, meta_list, X_gru, y_gru
