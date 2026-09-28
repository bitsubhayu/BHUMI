"""Production Inference Engine for BHUMI Forecasting.

Executes the complete 3-stage forecasting pipeline:
  1. Loads latest teleconnection state & trajectory
  2. Loads block metadata & recent weather observations
  3. Executes Stage 1 (Analog Ensemble + Small GRU sequence model)
  4. Extracts features & executes Stage 2 (LightGBM + XGBoost downscaling)
  5. Applies Stage 3 (Probability Calibration)
  6. Applies Stage 4 (Statistical Change-Point Detection)
  7. Derives physical drivers & ICAR advisory rules
  8. Produces week_1 through week_4 probabilistic risk rows
  9. Upserts results into public.live_predictions via SupabaseLoader
"""

from __future__ import annotations

import datetime
from pathlib import Path
from typing import Any, Optional, Sequence

import numpy as np

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.ml.calibration.calibrator import ProbabilityCalibrator
from pipeline.ml.changepoint.detector import ChangePointDetector
from pipeline.ml.downscaling.classifiers import DownscalingEnsemble
from pipeline.ml.downscaling.features import FeatureExtractor
from pipeline.ml.explainability.driver_attribution import DriverAttributionEngine
from pipeline.ml.teleconnections.ensemble import TeleconnectionEnsemble
from pipeline.utils.config import PipelineConfig, get_pipeline_config
from pipeline.utils.logger import get_logger


class ProductionInferenceEngine:
    """End-to-end inference engine generating live block-level predictions."""

    def __init__(
        self,
        config: Optional[PipelineConfig] = None,
        artifacts_dir: Optional[Path] = None,
        dry_run: bool = False,
    ) -> None:
        self.config = config or get_pipeline_config()
        self.artifacts_dir = artifacts_dir or Path(__file__).resolve().parent / "artifacts"
        self.dry_run = dry_run
        self.logger = get_logger("bhumi.ml.inference")
        self.loader = SupabaseLoader(config=self.config, dry_run=dry_run)

        # Initialize pipeline stages
        self.telecon_ensemble = TeleconnectionEnsemble()
        self.downscaling_ensemble = DownscalingEnsemble.load(self.artifacts_dir)
        self.calibrator = ProbabilityCalibrator.load(self.artifacts_dir / "calibrator.json")

    def run_inference(
        self,
        as_of_date: Optional[str] = None,
        block_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Execute daily live inference and write predictions to public.live_predictions."""
        today = as_of_date or str(datetime.date.today())
        self.logger.info(f"Starting BHUMI production inference run for prediction_date={today} (dry_run={self.dry_run})")

        # 1. Fetch blocks
        all_blocks = self.loader.fetch_blocks()
        if not all_blocks:
            # Fallback block if empty database
            all_blocks = [{
                "block_id": "IND_MH_PUN_001",
                "block_name": "Haveli (Pune)",
                "district_name": "Pune",
                "state_name": "Maharashtra",
                "centroid_lat": 18.5204,
                "centroid_lon": 73.8567,
                "elevation_m": 560.0,
                "slope_deg": 1.5,
                "distance_to_coast_km": 120.0,
            }]
        if block_ids:
            blocks = [b for b in all_blocks if b["block_id"] in block_ids]
        else:
            blocks = all_blocks

        self.logger.info(f"Processing inference for {len(blocks)} target administrative blocks")

        # 2. Fetch latest teleconnection trajectory
        telecon_history = self.loader.fetch_teleconnections_history(limit=60)
        self.telecon_ensemble.fit(telecon_history)
        telecon_pred = self.telecon_ensemble.predict(telecon_history)

        analog_year = telecon_pred.get("analog_year", 2024)
        latest_telecon = telecon_history[-1] if telecon_history else {
            "observation_date": today,
            "enso_oni": 0.0,
            "iod_dmi": 0.0,
            "mjo_phase": 1,
            "mjo_amplitude": 1.0,
        }

        # 3. Fetch recent observations from live_weather_buffer
        live_buffer = self.loader.fetch_live_weather_buffer(days=30)
        obs_by_block: dict[str, list[dict[str, Any]]] = {}
        for obs in live_buffer:
            b_id = obs["block_id"]
            obs_by_block.setdefault(b_id, []).append(obs)

        prediction_records: list[dict[str, Any]] = []

        # 4. Generate predictions per block and lead week
        for block in blocks:
            b_id = block["block_id"]
            block_obs = sorted(obs_by_block.get(b_id, []), key=lambda x: str(x.get("observation_date", "")))

            # Extract recent observation series
            rain_series = [float(o.get("rainfall_mm") or 0.0) for o in block_obs]
            temp_series = [float(o.get("max_temp_c") or 32.0) for o in block_obs]
            soil_series = [float(o.get("soil_moisture_idx") or 45.0) for o in block_obs]
            dates_series = [str(o.get("observation_date", today)) for o in block_obs]

            # Detect change-points for explanation
            cp_onset = ChangePointDetector.detect_onset_transition(rain_series, dates_series, soil_series)
            cp_break = ChangePointDetector.detect_break_transition(rain_series, temp_series, dates_series)
            active_cp = cp_break if cp_break.get("detected") else cp_onset

            # For each lead week (week_1 through week_4)
            for lead_w in range(1, 5):
                lead_key = f"week_{lead_w}"
                analog_lead_probs = telecon_pred["lead_probabilities"].get(lead_key, {})

                # Feature extraction
                feat_vec = FeatureExtractor.extract_single_feature_vector(
                    block=block,
                    telecon=latest_telecon,
                    analog_signals=analog_lead_probs,
                    lagged_rain=rain_series,
                    lagged_temp=temp_series,
                    lagged_soil=soil_series,
                    lagged_states=[],
                    lead_week=lead_w,
                )

                # Stage 2: LightGBM + XGBoost ensemble prediction
                raw_prob_matrix = self.downscaling_ensemble.predict_proba(feat_vec.reshape(1, -1))
                # Classes: [0: Active, 1: Onset, 2: Break, 3: Heavy]
                raw_active = float(raw_prob_matrix[0, 0])
                raw_onset = float(raw_prob_matrix[0, 1])
                raw_break = float(raw_prob_matrix[0, 2])
                raw_heavy = float(raw_prob_matrix[0, 3])

                # Stage 3: Calibration
                calibrated = self.calibrator.calibrate(
                    raw_onset_p=raw_onset,
                    raw_break_p=raw_break,
                    raw_heavy_p=raw_heavy,
                )

                # Stage 11: Physical Driver Attribution
                p_driver, s_driver, adv_code = DriverAttributionEngine.attribute(
                    telecon=latest_telecon,
                    block=block,
                    lead_week=lead_key,
                    onset_prob=calibrated["onset_prob"],
                    break_prob=calibrated["break_prob"],
                    heavy_prob=calibrated["heavy_prob"],
                    soil_moisture=soil_series[-1] if soil_series else None,
                    rain_7d_sum=sum(rain_series[-7:]) if rain_series else None,
                    analog_year=analog_year,
                    changepoint_info=active_cp,
                )

                pred_record = {
                    "block_id": b_id,
                    "prediction_date": today,
                    "lead_time_bucket": lead_key,
                    "onset_probability": calibrated["onset_prob"],
                    "break_probability": calibrated["break_prob"],
                    "heavy_spell_probability": calibrated["heavy_prob"],
                    "calibrated_confidence": calibrated["calibrated_confidence"],
                    "primary_driver": p_driver,
                    "secondary_driver": s_driver,
                    "teleconnection_analog_year": analog_year,
                    "advisory_code": adv_code,
                }
                prediction_records.append(pred_record)

        self.logger.info(f"Generated {len(prediction_records)} lead prediction records for {len(blocks)} blocks")

        # 5. Upsert to Supabase public.live_predictions
        rows_loaded = self.loader.load_live_predictions(prediction_records)
        self.logger.info(f"Successfully loaded {rows_loaded} rows into public.live_predictions")

        return {
            "prediction_date": today,
            "blocks_processed": len(blocks),
            "predictions_count": len(prediction_records),
            "rows_loaded": rows_loaded,
            "teleconnection_analog_year": analog_year,
            "sample_prediction": prediction_records[0] if prediction_records else None,
        }
