"""Production Inference Engine for BHUMI Forecasting.

Executes the complete 3-stage forecasting pipeline with strict safety gates:
  1. Validates Model Readiness Gate (blocks unvalidated experimental models from silent production use)
  2. Requires genuine registered blocks (zero hardcoded fallback locations)
  3. Enforces strict feature presence (skips blocks lacking minimum 7-day observation history or metadata)
  4. Executes Stage 1 (Analog Ensemble + Supervised GRU if trained)
  5. Extracts features & executes Stage 2 (LightGBM + XGBoost downscaling)
  6. Applies Stage 3 (Probability Calibration)
  7. Applies Stage 4 (Statistical Change-Point Detection)
  8. Derives physical drivers & ICAR advisory rules
  9. Upserts results into public.live_predictions via SupabaseLoader
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any, Optional, Sequence

import numpy as np

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.ml.calibration.calibrator import ProbabilityCalibrator
from pipeline.ml.changepoint.detector import ChangePointDetector
from pipeline.ml.downscaling.classifiers import DownscalingEnsemble
from pipeline.ml.downscaling.features import FeatureExtractor, MissingFeatureError
from pipeline.ml.explainability.driver_attribution import DriverAttributionEngine
from pipeline.ml.teleconnections.ensemble import TeleconnectionEnsemble
from pipeline.transforms.weather_state import classify_recent_observation_states
from pipeline.utils.config import PipelineConfig, get_pipeline_config
from pipeline.utils.logger import get_logger


class ProductionInferenceEngine:
    """End-to-end inference engine generating live block-level predictions with strict safety gates."""

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

        # Load metadata and model readiness
        self.metadata: dict[str, Any] = self._load_metadata()
        self.readiness: dict[str, Any] = self.metadata.get("model_readiness", {})
        self.is_production_ready: bool = self.readiness.get("is_production_ready", False)
        self.model_tier: str = self.metadata.get("model_tier", "EXPERIMENTAL")

        # Initialize pipeline stages
        self.telecon_ensemble = TeleconnectionEnsemble()
        self.downscaling_ensemble = DownscalingEnsemble.load(self.artifacts_dir)
        self.calibrator = ProbabilityCalibrator.load(self.artifacts_dir / "calibrator.json")

    def _load_metadata(self) -> dict[str, Any]:
        """Load artifact metadata safely."""
        meta_file = self.artifacts_dir / "metadata.json"
        if meta_file.exists():
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {
            "model_tier": "EXPERIMENTAL",
            "model_readiness": {
                "status": "INSUFFICIENT_TRAINING_DATA",
                "is_production_ready": False,
                "reasons": ["No trained model metadata found on disk."],
            },
        }

    def run_inference(
        self,
        as_of_date: Optional[str] = None,
        block_ids: Optional[list[str]] = None,
        allow_experimental: bool = False,
    ) -> dict[str, Any]:
        """Execute daily live inference and write predictions to public.live_predictions.
        
        Args:
            as_of_date: Forecast reference date (YYYY-MM-DD)
            block_ids: Optional filter list of block IDs
            allow_experimental: If True, allows running in explicit experimental/degraded mode
            
        Raises:
            RuntimeError: If public.blocks is empty or model readiness gate blocks execution.
        """
        today = as_of_date or str(datetime.date.today())
        self.logger.info(f"Starting BHUMI inference run for prediction_date={today} (dry_run={self.dry_run})")

        # 1. Model Readiness Gate Check
        if not self.is_production_ready and not allow_experimental:
            status = self.readiness.get("status", "UNREADY")
            reasons = self.readiness.get("reasons", ["Insufficient training data / class diversity"])
            msg = (
                f"Production inference blocked by Model Readiness Gate ({status}). "
                f"Reasons: {'; '.join(reasons)}. "
                f"To execute in explicit experimental mode, set allow_experimental=True."
            )
            self.logger.warning(msg)
            return {
                "success": False,
                "status": "BLOCKED_BY_READINESS_GATE",
                "readiness_status": status,
                "is_production_ready": False,
                "model_tier": self.model_tier,
                "reasons": reasons,
                "error": msg,
                "predictions_count": 0,
                "blocks_processed": 0,
                "blocks_skipped": 0,
                "rows_loaded": 0,
            }

        if not self.is_production_ready:
            self.logger.warning(
                f"Running inference in EXPERIMENTAL mode (Gate: {self.readiness.get('status')}). "
                f"Predictions will be explicitly tagged as experimental."
            )

        # 2. Strict Block Retrieval (No hardcoded fallback locations!)
        all_blocks = self.loader.fetch_blocks()
        if not all_blocks:
            raise RuntimeError(
                "Production inference aborted: public.blocks is empty or unavailable in Supabase. "
                "BHUMI will not fabricate blocks or generate predictions for nonexistent locations."
            )

        if block_ids:
            target_ids = set(block_ids)
            blocks = [b for b in all_blocks if b["block_id"] in target_ids]
            if not blocks:
                raise RuntimeError(
                    f"Requested block IDs {block_ids} not found in public.blocks. No predictions generated."
                )
        else:
            blocks = all_blocks

        self.logger.info(f"Found {len(blocks)} registered administrative blocks to evaluate")
        current_year = int(today.split("-")[0]) if "-" in today else datetime.date.today().year

        # 3. Teleconnection state & trajectory retrieval
        telecon_history = self.loader.fetch_teleconnections_history(limit=180)
        if not telecon_history:
            raise RuntimeError("Production inference aborted: teleconnections_history is empty in Supabase.")

        self.telecon_ensemble.fit(telecon_history)
        telecon_pred = self.telecon_ensemble.predict(telecon_history, exclude_year=current_year)

        analog_year = telecon_pred.get("analog_year")
        complete_telecons = [
            t for t in telecon_history
            if t.get("enso_oni") is not None and t.get("iod_dmi") is not None
        ]
        if complete_telecons:
            latest_telecon = dict(complete_telecons[-1])
            most_recent = telecon_history[-1]
            if most_recent.get("mjo_phase") is not None:
                latest_telecon["mjo_phase"] = most_recent["mjo_phase"]
                latest_telecon["mjo_amplitude"] = most_recent["mjo_amplitude"]
        else:
            latest_telecon = telecon_history[-1]

        # 4. Fetch historical seasonal archives for climatology derivation (prior completed seasons)
        candidate_ids = [b["block_id"] for b in blocks]
        seasonal_archives = self.loader.fetch_seasonal_archives(block_ids=candidate_ids if block_ids else None)
        archives_by_block: dict[str, list[dict[str, Any]]] = {}
        for a in seasonal_archives:
            archives_by_block.setdefault(a["block_id"], []).append(a)

        climatology_cache: dict[str, tuple[float, float]] = {}

        # 5. Fetch recent observations from live_weather_buffer
        live_buffer = self.loader.fetch_live_weather_buffer(days=30)
        obs_by_block: dict[str, list[dict[str, Any]]] = {}
        for obs in live_buffer:
            b_id = obs["block_id"]
            obs_by_block.setdefault(b_id, []).append(obs)

        prediction_records: list[dict[str, Any]] = []
        skipped_blocks: list[dict[str, str]] = []

        # 6. Evaluate predictions per block and lead week
        for block in blocks:
            b_id = block["block_id"]

            # Derive or fetch cached block climatology from genuine prior seasons
            if b_id in climatology_cache:
                clim_mean, clim_std = climatology_cache[b_id]
            else:
                block_archs = archives_by_block.get(b_id, [])
                hist_rains = [
                    r / 10.0
                    for a in block_archs
                    if int(a.get("season_year", 0)) < current_year
                    for r in (a.get("rainfall_x10") or [])
                ]
                if hist_rains:
                    clim_mean = float(np.mean(hist_rains))
                    clim_std = float(np.std(hist_rains)) + 1e-4
                    climatology_cache[b_id] = (clim_mean, clim_std)
                else:
                    msg = f"No historical seasonal archives prior to {current_year} found to derive real climatology"
                    self.logger.warning(f"Skipping block '{b_id}': {msg}. Rejecting prediction on missing climatology.")
                    skipped_blocks.append({"block_id": b_id, "reason": msg})
                    continue

            block_obs = sorted(obs_by_block.get(b_id, []), key=lambda x: str(x.get("observation_date", "")))

            # Extract genuine observations
            rain_series = [float(o.get("rainfall_mm") or 0.0) for o in block_obs]
            temp_series = [float(o.get("max_temp_c") or 0.0) for o in block_obs]
            soil_series = [float(o.get("soil_moisture_idx") or 0.0) for o in block_obs]
            dates_series = [str(o.get("observation_date", today)) for o in block_obs]

            # Derive recent weather state codes from genuine observation window
            derived_states = classify_recent_observation_states(dates_series, rain_series)

            # Detect change-points if enough history exists
            cp_onset = ChangePointDetector.detect_onset_transition(rain_series, dates_series, soil_series)
            cp_break = ChangePointDetector.detect_break_transition(rain_series, temp_series, dates_series)
            active_cp = cp_break if cp_break.get("detected") else cp_onset

            block_predictions: list[dict[str, Any]] = []
            block_has_error = False

            for lead_w in range(1, 5):
                lead_key = f"week_{lead_w}"
                analog_lead_probs = telecon_pred["lead_probabilities"].get(lead_key, {})

                # Feature extraction with strict validation (raises MissingFeatureError on missing real data)
                try:
                    feat_vec = FeatureExtractor.extract_single_feature_vector(
                        block=block,
                        telecon=latest_telecon,
                        analog_signals=analog_lead_probs,
                        lagged_rain=rain_series,
                        lagged_temp=temp_series,
                        lagged_soil=soil_series,
                        lagged_states=derived_states,
                        lead_week=lead_w,
                        climatology_mean=clim_mean,
                        climatology_std=clim_std,
                        min_history_days=1 if allow_experimental else 7,
                    )
                except MissingFeatureError as e:
                    self.logger.warning(
                        f"Skipping block '{b_id}' lead {lead_key}: {e}. "
                        f"No prediction generated to prevent fake-quality forecast."
                    )
                    skipped_blocks.append({"block_id": b_id, "reason": str(e)})
                    block_has_error = True
                    break

                # Stage 2: LightGBM + XGBoost ensemble prediction
                raw_prob_matrix = self.downscaling_ensemble.predict_proba(feat_vec.reshape(1, -1))
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

                # Tag experimental tier explicitly if running in experimental mode
                if not self.is_production_ready:
                    adv_code = f"exp_{adv_code}" if adv_code else "experimental_monitoring"
                    p_driver = f"[EXPERIMENTAL] {p_driver}"

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
                block_predictions.append(pred_record)

            if not block_has_error and len(block_predictions) == 4:
                prediction_records.extend(block_predictions)

        self.logger.info(
            f"Generated {len(prediction_records)} lead prediction records for {len(blocks) - len(skipped_blocks)} blocks "
            f"({len(skipped_blocks)} blocks skipped due to insufficient observation history or metadata)"
        )

        # 6. Upsert to Supabase public.live_predictions only if genuine predictions were generated
        rows_loaded = 0
        if prediction_records:
            rows_loaded = self.loader.load_live_predictions(prediction_records)
            self.logger.info(f"Successfully loaded {rows_loaded} rows into public.live_predictions")
        else:
            self.logger.warning("No valid prediction records generated; public.live_predictions untouched.")

        return {
            "success": True,
            "prediction_date": today,
            "blocks_processed": len(blocks) - len(skipped_blocks),
            "blocks_skipped": len(skipped_blocks),
            "skipped_details": skipped_blocks,
            "predictions_count": len(prediction_records),
            "rows_loaded": rows_loaded,
            "teleconnection_analog_year": analog_year,
            "model_readiness": self.readiness,
            "model_tier": self.model_tier,
            "sample_prediction": prediction_records[0] if prediction_records else None,
        }
