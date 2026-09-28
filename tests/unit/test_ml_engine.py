"""Deterministic Unit Tests for BHUMI ML & Forecasting Engine.

Tests:
- Analog selection and distance metrics
- Teleconnection state feature generation
- GRU sequence model input/output shapes and parameter serialization
- Downscaling feature extraction
- Probability range invariance [0.0, 100.0]
- Platt & Isotonic calibration
- Temporal leakage prevention
- Rolling-origin validation split
- Statistical change-point detection (Mann-Kendall & Pettitt)
- Explainability & physical driver attribution
- Live prediction schema validation
- Deterministic inference pipeline execution
"""

from __future__ import annotations

import datetime
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np

from pipeline.ml.calibration.calibrator import ProbabilityCalibrator
from pipeline.ml.changepoint.detector import ChangePointDetector
from pipeline.ml.downscaling.classifiers import DownscalingEnsemble
from pipeline.ml.downscaling.features import FEATURE_NAMES, FeatureExtractor, MissingFeatureError
from pipeline.ml.explainability.driver_attribution import DriverAttributionEngine
from pipeline.ml.inference import ProductionInferenceEngine
from pipeline.ml.teleconnections.analog_ensemble import AnalogEnsembleModel
from pipeline.ml.teleconnections.ensemble import TeleconnectionEnsemble
from pipeline.ml.teleconnections.gru_model import SmallGRUModel
from pipeline.ml.validation.imd_ground_truth import IMDGroundTruthAdapter
from pipeline.ml.validation.metrics import compute_probabilistic_metrics
from pipeline.ml.validation.readiness import ModelReadinessEvaluator, ModelReadinessStatus
from pipeline.ml.validation.rolling_split import RollingOriginSplitter
from pipeline.utils.config import PipelineConfig
from pipeline.utils.validation import ValidationError, validate_live_prediction


class TestMLEngine(unittest.TestCase):
    """Test suite for BHUMI forecasting engine components."""

    def test_teleconnection_feature_generation(self) -> None:
        """Verify polar-to-Cartesian encoding and trajectory derivative calculation."""
        vec = AnalogEnsembleModel.encode_state(
            oni=1.2,
            dmi=-0.5,
            mjo_phase=3,
            mjo_amplitude=1.8,
            oni_prev=1.0,
            dmi_prev=-0.3,
            mjo_phase_prev=2,
            mjo_amplitude_prev=1.5,
        )
        self.assertEqual(len(vec), 8)
        self.assertAlmostEqual(vec[0], 1.2)   # ONI
        self.assertAlmostEqual(vec[1], -0.5)  # DMI
        self.assertAlmostEqual(vec[4], 0.2)   # d_ONI
        self.assertAlmostEqual(vec[5], -0.2)  # d_DMI

    def test_analog_selection(self) -> None:
        """Verify weighted Euclidean distance metric and analog ranking."""
        model = AnalogEnsembleModel(top_k=2)
        history = [
            {"observation_date": "2015-06-15", "enso_oni": 1.5, "iod_dmi": 0.4, "mjo_phase": 5, "mjo_amplitude": 1.5},
            {"observation_date": "2018-06-15", "enso_oni": -0.8, "iod_dmi": -0.6, "mjo_phase": 2, "mjo_amplitude": 1.2},
            {"observation_date": "2020-06-15", "enso_oni": -1.2, "iod_dmi": 0.1, "mjo_phase": 4, "mjo_amplitude": 1.0},
        ]
        model.fit(history)

        # Query close to 2018 (Negative IOD + Suppressed MJO)
        query = AnalogEnsembleModel.encode_state(oni=-0.7, dmi=-0.5, mjo_phase=2, mjo_amplitude=1.1)
        matches = model.find_analogs(query)

        self.assertEqual(len(matches), 2)
        # 2018 should be top match
        self.assertEqual(matches[0].year, 2018)
        self.assertGreater(matches[0].similarity_weight, matches[1].similarity_weight)

    def test_gru_input_output_shape(self) -> None:
        """Verify GRU forward pass shapes, normalization, and parameter persistence."""
        model = SmallGRUModel(input_dim=5, hidden_dim=16)
        
        # Single sequence (30 days, 5 features)
        seq = np.random.randn(30, 5)
        out = model.forward(seq)
        self.assertEqual(out.shape, (4, 4))  # 4 lead times x 4 states

        # Batch sequence (3 batches, 30 days, 5 features)
        batch = np.random.randn(3, 30, 5)
        batch_out = model.forward(batch)
        self.assertEqual(batch_out.shape, (3, 4, 4))

        lead_probs = model.predict_lead_probabilities(seq)
        self.assertIn("week_1", lead_probs)
        self.assertIn("week_4", lead_probs)
        for lead, probs in lead_probs.items():
            total = sum(probs.values())
            self.assertAlmostEqual(total, 1.0, places=2)

    def test_downscaling_feature_preparation(self) -> None:
        """Verify tabular downscaling feature extraction shape and content."""
        block = {
            "centroid_lat": 18.52,
            "centroid_lon": 73.86,
            "elevation_m": 560.0,
            "slope_deg": 2.1,
            "distance_to_coast_km": 120.0,
        }
        telecon = {"enso_oni": 0.3, "iod_dmi": -0.2, "mjo_phase": 4, "mjo_amplitude": 1.4}
        analog_signals = {"onset": 0.15, "active": 0.50, "break": 0.25, "heavy": 0.10}

        vec = FeatureExtractor.extract_single_feature_vector(
            block=block,
            telecon=telecon,
            analog_signals=analog_signals,
            lagged_rain=[2.0] * 14,
            lagged_temp=[32.0] * 7,
            lagged_soil=[50.0] * 7,
            lagged_states=[2] * 14,
            lead_week=2,
            climatology_mean=8.5,
            climatology_std=12.0,
        )

        self.assertEqual(len(vec), len(FEATURE_NAMES))
        self.assertEqual(vec[0], 18.52)   # lat
        self.assertEqual(vec[2], 560.0)   # elevation
        self.assertEqual(vec[-1], 2.0)    # lead_week

    def test_probability_range(self) -> None:
        """Verify all predicted probabilities are strictly bounded within [0.0, 100.0]."""
        calibrator = ProbabilityCalibrator()
        # Test extreme raw values
        for raw_o, raw_b, raw_h in [(0.0, 0.0, 0.0), (1.0, 1.0, 1.0), (0.01, 0.95, 0.04)]:
            cal = calibrator.calibrate(raw_o, raw_b, raw_h)
            for k in ["onset_prob", "break_prob", "heavy_prob", "calibrated_confidence"]:
                val = cal[k]
                self.assertGreaterEqual(val, 0.0, f"{k} was {val} < 0")
                self.assertLessEqual(val, 100.0, f"{k} was {val} > 100")

    def test_calibration(self) -> None:
        """Verify calibration transforms raw probabilities and computes confidence."""
        # Simulated overconfident raw probabilities
        np.random.seed(42)
        raw_probs = np.array([
            [0.8, 0.1, 0.05, 0.05],
            [0.1, 0.7, 0.1, 0.1],
            [0.1, 0.1, 0.75, 0.05],
            [0.1, 0.1, 0.1, 0.7],
        ] * 10)
        y_true = np.array([0, 1, 2, 3] * 10)

        cal = ProbabilityCalibrator(method="platt")
        cal.fit(raw_probs, y_true)

        res = cal.calibrate(raw_onset_p=0.7, raw_break_p=0.1, raw_heavy_p=0.1)
        self.assertIn("onset_prob", res)
        self.assertIn("calibrated_confidence", res)
        self.assertGreater(res["onset_prob"], res["break_prob"])

    def test_leakage_prevention(self) -> None:
        """Verify feature extraction at time t strictly looks back and does not touch forward targets."""
        blocks = {
            "B1": {
                "block_id": "B1",
                "centroid_lat": 20.0,
                "centroid_lon": 80.0,
                "elevation_m": 300.0,
                "slope_deg": 1.5,
                "distance_to_coast_km": 200.0,
            }
        }
        archive = [{
            "block_id": "B1",
            "season_year": 2024,
            "season_start_date": "2024-04-01",
            "season_end_date": "2024-10-31",
            "rainfall_x10": [100 if i >= 100 else 0 for i in range(214)],
            "max_temp_x10": [350] * 214,
            "soil_moisture_idx": [50] * 214,
            "weather_state_code": [2 if i >= 100 else 3 for i in range(214)],
        }]
        telecon = {f"2024-04-{d:02d}": {"enso_oni": 0.0, "iod_dmi": 0.0, "mjo_phase": 1, "mjo_amplitude": 1.0} for d in range(1, 31)}
        analog = AnalogEnsembleModel()

        X, y, meta, *_ = FeatureExtractor.extract_from_seasonal_archives(
            blocks_by_id=blocks,
            seasonal_archives=archive,
            telecon_by_date=telecon,
            analog_model=analog,
            sample_step=20,
        )

        # For samples where t < 100, the lagged rainfall features must be strictly 0.0
        for i, m in enumerate(meta):
            dt = datetime.date.fromisoformat(m["date"])
            t = (dt - datetime.date(2024, 4, 1)).days
            if t < 100:
                # rain_lag_1d_mm is at index 15
                self.assertEqual(X[i, 15], 0.0)

    def test_rolling_origin_split(self) -> None:
        """Verify that training years strictly precede validation and test years."""
        meta_rows = [
            {"season_year": 2018, "date": "2018-06-01"},
            {"season_year": 2019, "date": "2019-06-01"},
            {"season_year": 2020, "date": "2020-06-01"},
            {"season_year": 2021, "date": "2021-06-01"},
            {"season_year": 2022, "date": "2022-06-01"},
        ]
        splitter = RollingOriginSplitter(min_train_years=2, val_years_count=1, test_years_count=1)
        splits = list(splitter.split(meta_rows))

        self.assertGreater(len(splits), 0)
        for s in splits:
            max_train = max(s.train_years)
            min_val = min(s.val_years)
            min_test = min(s.test_years) if s.test_years else 9999
            self.assertLess(max_train, min_val, "Train year must be strictly earlier than validation year")
            self.assertLess(min_val, min_test, "Validation year must be strictly earlier than test year")

    def test_changepoint_detection(self) -> None:
        """Verify change-point detection on known synthetic step function."""
        # 10 days dry, then 10 days heavy rainfall (monsoon onset)
        series = [0.0] * 10 + [25.0] * 10
        dates = [f"2024-06-{i+1:02d}" for i in range(20)]

        res = ChangePointDetector.detect_onset_transition(series, dates)
        self.assertTrue(res["detected"])
        self.assertEqual(res["transition_date"], "2024-06-11")

    def test_explanation_generation(self) -> None:
        """Verify that physical driver strings reflect actual inputs."""
        telecon = {"enso_oni": -0.85, "iod_dmi": -0.52, "mjo_phase": 3, "mjo_amplitude": 1.6}
        block = {"elevation_m": 450.0, "distance_to_coast_km": 250.0}

        p_driver, s_driver, adv = DriverAttributionEngine.attribute(
            telecon=telecon,
            block=block,
            lead_week="week_1",
            onset_prob=15.0,
            break_prob=65.0,
            heavy_prob=5.0,
            soil_moisture=20.0,
            rain_7d_sum=2.0,
            analog_year=2018,
        )

        self.assertIn("Negative IOD", p_driver)
        self.assertIn("MJO Phase 3", p_driver)
        self.assertIn("soil moisture deficit", s_driver.lower())
        self.assertEqual(adv, "delay_sowing")

    def test_prediction_schema(self) -> None:
        """Verify validation of prediction rows for public.live_predictions."""
        valid_record = {
            "block_id": "IND_MH_PUN_001",
            "prediction_date": "2026-09-28",
            "lead_time_bucket": "week_1",
            "onset_probability": 25.5,
            "break_probability": 45.0,
            "heavy_spell_probability": 10.0,
            "calibrated_confidence": 78.5,
            "primary_driver": "Negative IOD + MJO Phase 3",
            "secondary_driver": "Soil moisture deficit 18%",
            "teleconnection_analog_year": 2018,
        }
        cleaned = validate_live_prediction(valid_record)
        self.assertEqual(cleaned["lead_time_bucket"], "week_1")
        self.assertEqual(cleaned["onset_probability"], 25.5)

        # Test invalid lead_time_bucket
        invalid_record = dict(valid_record)
        invalid_record["lead_time_bucket"] = "week_5"
        with self.assertRaises(ValidationError):
            validate_live_prediction(invalid_record)

        # Test invalid probability range
        invalid_prob = dict(valid_record)
        invalid_prob["break_probability"] = 105.0
        with self.assertRaises(ValidationError):
            validate_live_prediction(invalid_prob)

    def test_imd_ground_truth_status(self) -> None:
        """Verify IMD ground-truth adapter reports unavailable status cleanly without fabricating data."""
        config = PipelineConfig(
            supabase_url="https://mock.supabase.co",
            supabase_service_role_key="mock_key",
            supabase_anon_key=None,
            cdsapi_url=None,
            cdsapi_key=None,
            earthdata_username=None,
            earthdata_password=None,
            imd_api_key=None,
            imd_pune_user=None,
        )
        adapter = IMDGroundTruthAdapter(config=config)
        self.assertFalse(adapter.is_available())
        status = adapter.get_validation_status()
        self.assertEqual(status["status"], "IMD_VALIDATION_UNAVAILABLE")

    def test_deterministic_inference_dry_run(self) -> None:
        """Verify complete deterministic inference pipeline runs end-to-end in dry-run mode."""
        config = PipelineConfig(
            supabase_url="https://mock.supabase.co",
            supabase_service_role_key="mock_key",
            supabase_anon_key=None,
            cdsapi_url=None,
            cdsapi_key=None,
            earthdata_username=None,
            earthdata_password=None,
            imd_api_key=None,
            imd_pune_user=None,
        )
        engine = ProductionInferenceEngine(config=config, dry_run=True)

        # Mock loader query returns
        engine.loader.fetch_blocks = MagicMock(return_value=[{
            "block_id": "IND_MH_PUN_001",
            "block_name": "Haveli",
            "district_name": "Pune",
            "state_name": "Maharashtra",
            "centroid_lat": 18.52,
            "centroid_lon": 73.86,
            "elevation_m": 560.0,
            "slope_deg": 1.5,
            "distance_to_coast_km": 120.0,
        }])
        engine.loader.fetch_teleconnections_history = MagicMock(return_value=[
            {"observation_date": f"2026-09-{i:02d}", "enso_oni": -0.6, "iod_dmi": -0.4, "mjo_phase": 3, "mjo_amplitude": 1.5}
            for i in range(1, 29)
        ])
        # Provide authentic historical seasonal archive for block climatology derivation
        engine.loader.fetch_seasonal_archives = MagicMock(return_value=[
            {
                "block_id": "IND_MH_PUN_001",
                "season_year": 2024,
                "rainfall_x10": [20] * 214,
            }
        ])
        # Provide authentic 8-day observation buffer so minimum history requirement (7 days) is satisfied
        engine.loader.fetch_live_weather_buffer = MagicMock(return_value=[
            {
                "block_id": "IND_MH_PUN_001",
                "observation_date": f"2026-09-{20 + i:02d}",
                "rainfall_mm": 5.0,
                "max_temp_c": 32.0,
                "min_temp_c": 22.0,
                "soil_moisture_idx": 45.0,
                "data_source": "TEST",
                "is_preliminary": False,
            }
            for i in range(8)
        ])

        res = engine.run_inference(as_of_date="2026-09-28", allow_experimental=True)
        self.assertTrue(res["success"])
        self.assertEqual(res["blocks_processed"], 1)
        self.assertEqual(res["predictions_count"], 4)  # 4 lead weeks
        self.assertEqual(res["rows_loaded"], 4)        # dry-run simulated upsert

    def test_gru_supervised_training_weights_differ(self) -> None:
        """Verify supervised GRU training reduces loss and produces weights differing from random initialization."""
        np.random.seed(42)
        model = SmallGRUModel(input_dim=5, hidden_dim=8)
        initial_w = model.W.copy()

        # Generate synthetic sequences with consistent pattern
        N = 25
        X_seqs = np.random.randn(N, 30, 5) * 0.5
        y_targets = np.zeros((N, 4, 4), dtype=np.float64)
        for i in range(N):
            for lead in range(4):
                y_targets[i, lead, 0] = 0.7  # Active dominant
                y_targets[i, lead, 1] = 0.1
                y_targets[i, lead, 2] = 0.1
                y_targets[i, lead, 3] = 0.1

        metrics = model.train_supervised(X_seqs, y_targets, epochs=10, lr=0.02)
        self.assertGreater(metrics["weight_delta_norm"], 0.0, "Trained weights must differ from random initialization")
        self.assertLess(metrics["final_loss"], metrics["initial_loss"], "Training loss must decrease")
        self.assertFalse(np.allclose(model.W, initial_w), "W weights must shift during backpropagation")

    def test_gru_explicitly_disabled_when_insufficient_data(self) -> None:
        """Verify GRU is automatically disabled from production ensemble when sample size is insufficient."""
        ensemble = TeleconnectionEnsemble()
        history = [
            {"observation_date": f"2024-01-{i:02d}", "enso_oni": 0.5, "iod_dmi": 0.2, "mjo_phase": 3, "mjo_amplitude": 1.2}
            for i in range(1, 25)
        ]
        # Only 5 sequence pairs (< 100 threshold)
        X_seqs = np.zeros((5, 30, 5))
        y_targets = np.zeros((5, 4, 4))
        y_targets[:, :, 0] = 1.0

        ensemble.fit(history, X_seqs=X_seqs, y_targets=y_targets)
        self.assertFalse(ensemble.gru_enabled, "GRU must be disabled when sample size is insufficient")
        self.assertEqual(ensemble.gru_weight, 0.0, "GRU weight must be 0.0 when disabled")
        self.assertEqual(ensemble.analog_weight, 1.0, "Analog weight must be 1.0 when GRU is disabled")
        self.assertTrue(ensemble.gru_status.startswith("DISABLED_INSUFFICIENT_TRAINING_DATA"))

        # Predict should run 100% on analog ensemble without error
        pred = ensemble.predict(history)
        self.assertIn("week_1", pred["lead_probabilities"])
        self.assertAlmostEqual(sum(pred["lead_probabilities"]["week_1"].values()), 1.0, places=2)

    def test_model_readiness_gate_insufficient_data(self) -> None:
        """Verify model readiness gate rejects 1-season / 2-block archives as non-production."""
        res = ModelReadinessEvaluator.evaluate(
            seasons=[2024],
            blocks_count=2,
            samples_count=96,
            class_counts={0: 66, 1: 4, 2: 22, 3: 4},
            test_class_counts={0: 15, 1: 0, 2: 5, 3: 0},
            gru_status="DISABLED_INSUFFICIENT_TRAINING_DATA",
        )
        self.assertFalse(res["is_production_ready"], "1-season/2-block archive cannot be production ready")
        self.assertEqual(res["model_tier"], "EXPERIMENTAL")
        self.assertEqual(res["status"], ModelReadinessStatus.INSUFFICIENT_CLASS_DIVERSITY.value)
        self.assertGreater(len(res["reasons"]), 0)
        reasons_text = " ".join(res["reasons"])
        self.assertIn("1 season", reasons_text)
        self.assertIn("2 block", reasons_text)

    def test_model_readiness_gate_production_ready(self) -> None:
        """Verify model readiness gate approves when national criteria are satisfied."""
        res = ModelReadinessEvaluator.evaluate(
            seasons=[2021, 2022, 2023, 2024],
            blocks_count=25,
            samples_count=1200,
            class_counts={0: 600, 1: 150, 2: 300, 3: 150},
            test_class_counts={0: 60, 1: 15, 2: 30, 3: 15},
            gru_status="TRAINED_SUPERVISED",
        )
        self.assertTrue(res["is_production_ready"])
        self.assertEqual(res["model_tier"], "PRODUCTION")
        self.assertEqual(res["status"], ModelReadinessStatus.READY_FOR_PRODUCTION.value)
        self.assertEqual(len(res["reasons"]), 0)

    def test_zero_block_production_failure(self) -> None:
        """Verify inference engine fails clearly with RuntimeError when public.blocks is empty."""
        config = PipelineConfig(
            supabase_url="https://mock.supabase.co",
            supabase_service_role_key="mock_key",
            supabase_anon_key=None,
            cdsapi_url=None,
            cdsapi_key=None,
            earthdata_username=None,
            earthdata_password=None,
            imd_api_key=None,
            imd_pune_user=None,
        )
        engine = ProductionInferenceEngine(config=config, dry_run=True)
        engine.loader.fetch_blocks = MagicMock(return_value=[])  # Empty blocks

        with self.assertRaises(RuntimeError) as ctx:
            engine.run_inference(allow_experimental=True)
        self.assertIn("public.blocks is empty or unavailable", str(ctx.exception))

    def test_missing_feature_rejection(self) -> None:
        """Verify FeatureExtractor raises MissingFeatureError on missing block metadata, telecon, or observations."""
        valid_block = {
            "centroid_lat": 18.52,
            "centroid_lon": 73.86,
            "elevation_m": 560.0,
            "slope_deg": 2.1,
            "distance_to_coast_km": 120.0,
        }
        valid_telecon = {"enso_oni": 0.3, "iod_dmi": -0.2, "mjo_phase": 4, "mjo_amplitude": 1.4}
        valid_analog = {"onset": 0.1, "active": 0.6, "break": 0.2, "heavy": 0.1}

        # 1. Missing terrain field
        bad_block = dict(valid_block)
        bad_block["centroid_lat"] = None
        with self.assertRaises(MissingFeatureError):
            FeatureExtractor.extract_single_feature_vector(
                block=bad_block, telecon=valid_telecon, analog_signals=valid_analog,
                lagged_rain=[5.0] * 7, lagged_temp=[32.0] * 7, lagged_soil=[45.0] * 7, lagged_states=[0] * 7,
                lead_week=1,
            )

        # 2. Missing oceanic teleconnection field
        bad_telecon = dict(valid_telecon)
        bad_telecon["enso_oni"] = None
        with self.assertRaises(MissingFeatureError):
            FeatureExtractor.extract_single_feature_vector(
                block=valid_block, telecon=bad_telecon, analog_signals=valid_analog,
                lagged_rain=[5.0] * 7, lagged_temp=[32.0] * 7, lagged_soil=[45.0] * 7, lagged_states=[0] * 7,
                lead_week=1,
            )

        # 3. Insufficient observation history (< 7 days)
        with self.assertRaises(MissingFeatureError):
            FeatureExtractor.extract_single_feature_vector(
                block=valid_block, telecon=valid_telecon, analog_signals=valid_analog,
                lagged_rain=[5.0] * 3,  # Only 3 days
                lagged_temp=[32.0] * 7, lagged_soil=[45.0] * 7, lagged_states=[0] * 7,
                lead_week=1,
            )

    def test_prediction_safety_blocks_unready_model(self) -> None:
        """Verify ProductionInferenceEngine blocks execution when model is unready and allow_experimental=False."""
        config = PipelineConfig(
            supabase_url="https://mock.supabase.co",
            supabase_service_role_key="mock_key",
            supabase_anon_key=None,
            cdsapi_url=None,
            cdsapi_key=None,
            earthdata_username=None,
            earthdata_password=None,
            imd_api_key=None,
            imd_pune_user=None,
        )
        engine = ProductionInferenceEngine(config=config, dry_run=True)
        # Force model readiness to unready
        engine.is_production_ready = False
        engine.readiness = {
            "status": "INSUFFICIENT_CLASS_DIVERSITY",
            "is_production_ready": False,
            "reasons": ["Archive has only 1 season", "Only 2 blocks"],
        }

        # Blocked without allow_experimental
        result = engine.run_inference(allow_experimental=False)
        self.assertFalse(result["success"])
        self.assertEqual(result["status"], "BLOCKED_BY_READINESS_GATE")
        self.assertEqual(result["predictions_count"], 0)
        self.assertEqual(result["rows_loaded"], 0)

    def test_no_fabricated_predictions_on_missing_observations(self) -> None:
        """Verify blocks with empty observation buffers are skipped without generating fake predictions."""
        config = PipelineConfig(
            supabase_url="https://mock.supabase.co",
            supabase_service_role_key="mock_key",
            supabase_anon_key=None,
            cdsapi_url=None,
            cdsapi_key=None,
            earthdata_username=None,
            earthdata_password=None,
            imd_api_key=None,
            imd_pune_user=None,
        )
        engine = ProductionInferenceEngine(config=config, dry_run=True)
        engine.loader.fetch_blocks = MagicMock(return_value=[{
            "block_id": "IND_MH_PUN_001",
            "block_name": "Haveli",
            "centroid_lat": 18.52,
            "centroid_lon": 73.86,
            "elevation_m": 560.0,
            "slope_deg": 1.5,
            "distance_to_coast_km": 120.0,
        }])
        engine.loader.fetch_teleconnections_history = MagicMock(return_value=[
            {"observation_date": f"2026-09-{i:02d}", "enso_oni": -0.6, "iod_dmi": -0.4, "mjo_phase": 3, "mjo_amplitude": 1.5}
            for i in range(1, 29)
        ])
        # Live buffer is empty (0 observations)
        engine.loader.fetch_live_weather_buffer = MagicMock(return_value=[])

        res = engine.run_inference(as_of_date="2026-09-28", allow_experimental=True)
        self.assertTrue(res["success"])
        self.assertEqual(res["blocks_processed"], 0, "Block must be skipped when observations are missing")
        self.assertEqual(res["blocks_skipped"], 1)
        self.assertEqual(res["predictions_count"], 0, "No fake predictions must be generated")
        self.assertEqual(res["rows_loaded"], 0)


if __name__ == "__main__":
    unittest.main()
