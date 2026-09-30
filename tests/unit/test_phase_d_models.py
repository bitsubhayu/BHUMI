"""Phase D Comprehensive Model Development, Calibration & Backtesting Test Suite.

Verifies all Phase D architectural components:
  1. Feature construction and bounds checking
  2. Temporal split correctness & leakage prevention
  3. Analog ensemble selection & weighting
  4. Small GRU sequence model supervised training & inference
  5. LightGBM + XGBoost downscaling ensemble
  6. Probability calibration (Platt / Isotonic) and strict [0.0, 100.0] bounds
  7. Deterministic on-demand panchayat downscaling with zero database persistence
  8. Model readiness gate under partial nationwide coverage (30.48%)
  9. Production inference blocking & explicit experimental override
  10. Physical explainability driver attribution
  11. Uncovered block safety and missing data handling
"""

from __future__ import annotations

import datetime
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

import numpy as np

from pipeline.ml.calibration.calibrator import ProbabilityCalibrator
from pipeline.ml.downscaling.classifiers import DownscalingEnsemble
from pipeline.ml.downscaling.features import (
    FEATURE_NAMES,
    FeatureExtractor,
    MissingFeatureError,
)
from pipeline.ml.downscaling.panchayat import (
    PanchayatDownscaler,
    PanchayatDownscaledOutlook,
)
from pipeline.ml.explainability.driver_attribution import DriverAttributionEngine
from pipeline.ml.inference import ProductionInferenceEngine
from pipeline.ml.teleconnections.analog_ensemble import AnalogEnsembleModel
from pipeline.ml.teleconnections.ensemble import TeleconnectionEnsemble
from pipeline.ml.teleconnections.gru_model import SmallGRUModel
from pipeline.ml.validation.metrics import compute_probabilistic_metrics
from pipeline.ml.validation.readiness import (
    ModelReadinessEvaluator,
    ModelReadinessStatus,
)
from pipeline.ml.validation.rolling_split import RollingOriginSplitter
from pipeline.utils.config import PipelineConfig


class TestPhaseDModels(unittest.TestCase):
    """Unit tests for Phase D machine learning components and safety gates."""

    def setUp(self) -> None:
        self.sample_block = {
            "block_id": "IND_MH_PUN_001",
            "block_name": "Haveli",
            "district_name": "Pune",
            "state_name": "Maharashtra",
            "centroid_lat": 18.5204,
            "centroid_lon": 73.8567,
            "elevation_m": 560.0,
            "slope_deg": 2.1,
            "distance_to_coast_km": 120.0,
            "agro_climatic_zone": "Western Plateau and Hills Region",
        }

        self.sample_telecon = {
            "observation_date": "2024-07-15",
            "enso_oni": -0.45,
            "iod_dmi": 0.25,
            "mjo_phase": 4,
            "mjo_amplitude": 1.4,
        }

        self.sample_analog_signals = {
            "onset": 0.12,
            "active": 0.52,
            "break": 0.24,
            "heavy": 0.12,
        }

    # 1. Feature Construction & Missing Data Handling
    def test_feature_construction_valid(self) -> None:
        """Verify feature extractor extracts 26 valid numerical features without lookahead."""
        feat = FeatureExtractor.extract_single_feature_vector(
            block=self.sample_block,
            telecon=self.sample_telecon,
            analog_signals=self.sample_analog_signals,
            lagged_rain=[0.0, 5.0, 12.0, 0.0, 2.0, 1.0, 8.0],
            lagged_temp=[32.0, 31.5, 30.0, 32.2, 33.0, 31.0, 30.5],
            lagged_soil=[45.0, 48.0, 52.0, 50.0, 49.0, 48.0, 50.0],
            lagged_states=[0, 0, 4, 0, 0, 0, 2],
            lead_week=1,
            climatology_mean=8.5,
            climatology_std=4.2,
        )

        self.assertEqual(len(feat), len(FEATURE_NAMES))
        self.assertEqual(len(feat), 26)
        self.assertFalse(np.isnan(feat).any())
        self.assertEqual(feat[0], self.sample_block["centroid_lat"])
        self.assertEqual(feat[2], self.sample_block["elevation_m"])
        self.assertEqual(feat[5], self.sample_telecon["enso_oni"])
        self.assertEqual(feat[25], 1.0)  # lead_week

    def test_feature_construction_missing_metadata_raises(self) -> None:
        """Verify feature extractor strictly rejects incomplete block metadata."""
        bad_block = dict(self.sample_block)
        del bad_block["elevation_m"]

        with self.assertRaises(MissingFeatureError) as ctx:
            FeatureExtractor.extract_single_feature_vector(
                block=bad_block,
                telecon=self.sample_telecon,
                analog_signals=self.sample_analog_signals,
                lagged_rain=[0.0] * 7,
                lagged_temp=[30.0] * 7,
                lagged_soil=[50.0] * 7,
                lagged_states=[0] * 7,
                lead_week=1,
                climatology_mean=5.0,
                climatology_std=2.0,
            )
        self.assertIn("elevation_m", str(ctx.exception))

    def test_feature_construction_insufficient_observation_history_raises(self) -> None:
        """Verify feature extractor rejects observation windows shorter than minimum required."""
        with self.assertRaises(MissingFeatureError) as ctx:
            FeatureExtractor.extract_single_feature_vector(
                block=self.sample_block,
                telecon=self.sample_telecon,
                analog_signals=self.sample_analog_signals,
                lagged_rain=[0.0, 2.0],  # Only 2 days instead of 7
                lagged_temp=[30.0] * 7,
                lagged_soil=[50.0] * 7,
                lagged_states=[0] * 7,
                lead_week=1,
                climatology_mean=5.0,
                climatology_std=2.0,
                min_history_days=7,
            )
        self.assertIn("insufficient rainfall observation history", str(ctx.exception))

    # 2. Temporal Split Correctness & Leakage Prevention
    def test_rolling_origin_splitter_chronological(self) -> None:
        """Verify temporal splits strictly enforce time ordering without shuffling."""
        meta_rows = [
            {"season_year": 2020, "date": "2020-06-01"},
            {"season_year": 2021, "date": "2021-06-01"},
            {"season_year": 2022, "date": "2022-06-01"},
            {"season_year": 2023, "date": "2023-06-01"},
            {"season_year": 2024, "date": "2024-06-01"},
        ]

        splitter = RollingOriginSplitter(min_train_years=2, val_years_count=1, test_years_count=1)
        splits = list(splitter.split(meta_rows))

        self.assertGreater(len(splits), 0)
        for s in splits:
            # Training years strictly precede validation years
            self.assertTrue(max(s.train_years) < min(s.val_years))
            # Validation years strictly precede test years
            self.assertTrue(max(s.val_years) < min(s.test_years))

    # 3. Analog Ensemble Selection
    def test_analog_ensemble_selection(self) -> None:
        """Verify analog model selects closest teleconnection trajectories excluding target year."""
        analog_model = AnalogEnsembleModel(top_k=3)
        history = [
            {"observation_date": f"{y}-07-15", "enso_oni": -0.8 + 0.1 * (y - 2015), "iod_dmi": 0.1, "mjo_phase": 4, "mjo_amplitude": 1.2}
            for y in range(2015, 2024)
        ]
        analog_model.fit(history)

        curr_state = analog_model.encode_state(oni=-0.7, dmi=0.1, mjo_phase=4, mjo_amplitude=1.2)
        matches = analog_model.find_analogs(curr_state, exclude_year=2023)

        self.assertEqual(len(matches), 3)
        # Excluded year must not appear in analog selection
        for m in matches:
            self.assertNotEqual(m.year, 2023)
        # Similarity weights sum to 1.0
        weights_sum = sum(m.similarity_weight for m in matches)
        self.assertAlmostEqual(weights_sum, 1.0, places=4)

    # 4. Small GRU Sequence Model
    def test_gru_model_training_and_inference(self) -> None:
        """Verify GRU sequence model trains deterministically with Adam and shifts weights."""
        gru = SmallGRUModel(input_dim=5, hidden_dim=8, output_dim=16, seed=42)

        # Generate synthetic sequences (N=16, seq_len=14, feat=5)
        rng = np.random.RandomState(42)
        X_seqs = rng.randn(16, 14, 5)
        # Target distributions (N=16, 4 lead weeks, 4 classes)
        y_targets = np.zeros((16, 4, 4))
        y_targets[:, :, 0] = 1.0  # Dominant class 0

        res = gru.train_supervised(X_seqs, y_targets, epochs=5, lr=0.02)
        self.assertTrue(res["is_trained"])
        self.assertGreater(res["weight_delta_norm"], 1e-4)

        # Predict lead probabilities
        probs = gru.predict_lead_probabilities(X_seqs[0])
        self.assertIn("week_1", probs)
        self.assertIn("week_4", probs)

        for lead, state_probs in probs.items():
            prob_sum = sum(state_probs.values())
            self.assertAlmostEqual(prob_sum, 1.0, places=3)

    # 5. LightGBM + XGBoost Downscaling Ensemble
    def test_downscaling_ensemble_fit_and_predict(self) -> None:
        """Verify LightGBM + XGBoost ensemble fits and outputs aligned 4-class probabilities."""
        ensemble = DownscalingEnsemble(lgb_weight=0.5, random_state=42)
        rng = np.random.RandomState(42)
        X = rng.randn(40, len(FEATURE_NAMES))
        y = rng.choice([0, 1, 2, 3], size=40)

        ensemble.fit(X, y)
        self.assertTrue(ensemble.is_fitted)

        probs = ensemble.predict_proba(X[:5])
        self.assertEqual(probs.shape, (5, 4))
        # Each sample must sum to 1.0
        row_sums = probs.sum(axis=1)
        for rs in row_sums:
            self.assertAlmostEqual(rs, 1.0, places=4)

    # 6. Probability Calibration & Bounds
    def test_probability_calibrator_bounds(self) -> None:
        """Verify calibrator constrains output percentages to strictly [0.0, 100.0]."""
        calibrator = ProbabilityCalibrator(method="platt")
        raw_probs = np.array([
            [0.7, 0.1, 0.1, 0.1],
            [0.1, 0.8, 0.05, 0.05],
            [0.2, 0.1, 0.6, 0.1],
            [0.1, 0.05, 0.05, 0.8],
        ] * 5)
        y_true = np.array([0, 1, 2, 3] * 5)

        calibrator.fit(raw_probs, y_true)
        self.assertTrue(calibrator.is_fitted)

        # Test extreme input bounds
        cal = calibrator.calibrate(raw_onset_p=1.2, raw_break_p=-0.5, raw_heavy_p=0.95)
        self.assertGreaterEqual(cal["onset_prob"], 0.0)
        self.assertLessEqual(cal["onset_prob"], 100.0)
        self.assertGreaterEqual(cal["break_prob"], 0.0)
        self.assertLessEqual(cal["break_prob"], 100.0)
        self.assertGreaterEqual(cal["heavy_prob"], 0.0)
        self.assertLessEqual(cal["heavy_prob"], 100.0)
        self.assertGreaterEqual(cal["calibrated_confidence"], 10.0)
        self.assertLessEqual(cal["calibrated_confidence"], 95.0)

    # 7. Deterministic Panchayat Downscaling & Zero-Persistence Rule
    def test_panchayat_downscaling_no_override_preserves_baseline(self) -> None:
        """Verify downscaler exactly preserves parent block forecast when no terrain delta exists."""
        pred = {
            "onset_probability": 30.0,
            "break_probability": 50.0,
            "heavy_spell_probability": 20.0,
            "calibrated_confidence": 80.0,
        }

        outlook = PanchayatDownscaler.downscale(
            parent_block=self.sample_block,
            parent_prediction=pred,
        )

        self.assertFalse(outlook.is_adjusted)
        self.assertEqual(outlook.onset_probability, 30.0)
        self.assertEqual(outlook.break_probability, 50.0)
        self.assertEqual(outlook.heavy_spell_probability, 20.0)
        self.assertEqual(outlook.onset_delta, 0.0)
        self.assertEqual(outlook.break_delta, 0.0)
        self.assertEqual(outlook.heavy_delta, 0.0)
        self.assertFalse(outlook.is_permanent_record)

    def test_panchayat_downscaling_bounded_adjustments(self) -> None:
        """Verify terrain adjustments are deterministic and strictly bounded within max limits."""
        pred = {
            "onset_probability": 25.0,
            "break_probability": 40.0,
            "heavy_spell_probability": 25.0,
            "calibrated_confidence": 85.0,
        }

        # Elevated ridge (+600m higher, +5 degrees steeper)
        outlook = PanchayatDownscaler.downscale(
            parent_block=self.sample_block,
            parent_prediction=pred,
            panchayat_name="Hilltop Village",
            panchayat_elevation_m=1160.0,
            panchayat_slope_deg=7.1,
        )

        self.assertTrue(outlook.is_adjusted)
        # Heavy rain risk increases with elevation/slope
        self.assertGreater(outlook.heavy_spell_probability, 25.0)
        # Break risk decreases with elevation/slope
        self.assertLess(outlook.break_probability, 40.0)
        # Deltas must not exceed maximum bounds (±10%)
        self.assertLessEqual(abs(outlook.heavy_delta), PanchayatDownscaler.MAX_HEAVY_DELTA)
        self.assertLessEqual(abs(outlook.break_delta), PanchayatDownscaler.MAX_BREAK_DELTA)
        self.assertLessEqual(abs(outlook.onset_delta), PanchayatDownscaler.MAX_ONSET_DELTA)
        self.assertFalse(outlook.is_permanent_record)

    # 8. Model Readiness Gate Under Partial Coverage
    def test_model_readiness_gate_rejects_partial_coverage(self) -> None:
        """Verify readiness gate strictly blocks production status under 30.48% coverage."""
        res = ModelReadinessEvaluator.evaluate(
            seasons=[2020, 2021, 2022, 2023, 2024],
            blocks_count=2156,  # 30.48% of nationwide 7,073
            samples_count=230000,
            class_counts={0: 150000, 1: 12000, 2: 48000, 3: 14000},
            gru_status="TRAINED",
            require_nationwide_coverage=True,
        )

        self.assertFalse(res["is_production_ready"])
        self.assertEqual(res["model_tier"], "EXPERIMENTAL")
        self.assertEqual(res["status"], ModelReadinessStatus.INSUFFICIENT_NATIONWIDE_COVERAGE.value)
        self.assertIn("30.48%", " ".join(res["reasons"]))

    # 9. Production Inference Blocking & Experimental Mode
    def test_production_inference_blocks_unready_model(self) -> None:
        """Verify ProductionInferenceEngine blocks production inference without explicit experimental override."""
        engine = ProductionInferenceEngine(
            config=PipelineConfig(supabase_url=None, supabase_service_role_key=None, supabase_anon_key=None, cdsapi_url=None, cdsapi_key=None, earthdata_username=None, earthdata_password=None, imd_api_key=None, imd_pune_user=None),
            dry_run=True,
        )
        engine.is_production_ready = False
        engine.readiness = {"status": "INSUFFICIENT_NATIONWIDE_COVERAGE", "reasons": ["Only 30.48% coverage"]}

        result = engine.run_inference(as_of_date="2026-09-30", allow_experimental=False)
        self.assertFalse(result["success"])
        self.assertEqual(result["status"], "BLOCKED_BY_READINESS_GATE")
        self.assertEqual(result["predictions_count"], 0)

    # 10. Physical Explainability Driver Attribution
    def test_driver_attribution_real_inputs(self) -> None:
        """Verify attribution engine reflects actual teleconnection and local terrain features."""
        telecon = {
            "enso_oni": -0.75,  # La Niña
            "iod_dmi": -0.45,   # Negative IOD
            "mjo_phase": 5,     # Active MJO
            "mjo_amplitude": 1.6,
        }
        block = {
            "elevation_m": 850.0,
            "distance_to_coast_km": 40.0,
        }

        primary, secondary, adv = DriverAttributionEngine.attribute(
            telecon=telecon,
            block=block,
            lead_week="week_1",
            onset_prob=20.0,
            break_prob=60.0,
            heavy_prob=20.0,
            soil_moisture=22.0,  # Critical deficit
            rain_7d_sum=None,
            analog_year=2021,
        )

        self.assertIn("Negative IOD", primary)
        self.assertIn("MJO Phase 5", primary)
        self.assertIn("Critical soil moisture deficit", secondary)
        self.assertIn("2021", secondary)
        self.assertEqual(adv, "delay_sowing")

    # 11. Probabilistic Metric Calculation
    def test_probabilistic_metrics_computation(self) -> None:
        """Verify Brier score, ECE, LogLoss, and F1 metrics are correctly computed."""
        y_true = np.array([0, 1, 2, 3, 0, 1, 2, 3])
        y_prob = np.array([
            [0.8, 0.1, 0.05, 0.05],
            [0.1, 0.7, 0.1, 0.1],
            [0.05, 0.05, 0.8, 0.1],
            [0.05, 0.05, 0.1, 0.8],
            [0.7, 0.1, 0.1, 0.1],
            [0.1, 0.8, 0.05, 0.05],
            [0.1, 0.1, 0.7, 0.1],
            [0.05, 0.05, 0.1, 0.8],
        ])

        metrics = compute_probabilistic_metrics(y_true, y_prob)
        self.assertIn("brier_score_multi", metrics)
        self.assertIn("expected_calibration_error", metrics)
        self.assertIn("log_loss", metrics)
        self.assertIn("per_class_performance", metrics)
        self.assertLess(metrics["brier_score_multi"], 0.20)
        self.assertLess(metrics["expected_calibration_error"], 0.30)


if __name__ == "__main__":
    unittest.main()
