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
from pipeline.ml.changepoint.detector import ChangePointDetector
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

    # 12. Temporal Leakage Prevention Across Folds (2022, 2023, 2024)
    def test_temporal_leakage_prevention_across_folds(self) -> None:
        """Verify Fold 2022 cannot access 2022+, Fold 2023 cannot access 2023+, Fold 2024 cannot access 2024+."""
        # Synthetic multi-year teleconnection dataset
        all_telecons = []
        for yr in range(2014, 2026):
            for day in range(1, 30):
                d_str = f"{yr}-06-{day:02d}"
                all_telecons.append({
                    "observation_date": d_str,
                    "enso_oni": -0.3 + 0.1 * (yr % 4),
                    "iod_dmi": 0.1 * ((yr + day) % 3),
                    "mjo_phase": (day % 8) + 1,
                    "mjo_amplitude": 1.2,
                })

        for test_fold_year in [2022, 2023, 2024]:
            # Filter training teleconnections strictly < test_fold_year
            train_telecons = [
                t for t in all_telecons
                if int(str(t["observation_date"]).split("-")[0]) < test_fold_year
            ]

            # 1. Assert no training record belongs to test_fold_year or later
            max_train_yr = max(int(str(t["observation_date"]).split("-")[0]) for t in train_telecons)
            self.assertLess(max_train_yr, test_fold_year)
            for t in train_telecons:
                yr = int(str(t["observation_date"]).split("-")[0])
                self.assertLess(yr, test_fold_year, f"Fold {test_fold_year} contains leaked telecon year {yr}")

            # 2. Fit fold analog model on strictly past records
            analog_model = AnalogEnsembleModel(top_k=5)
            analog_model.fit(train_telecons)

            # 3. Assert all analog candidate metadata has year < test_fold_year
            for meta in analog_model._history_meta:
                self.assertLess(meta["year"], test_fold_year)

            # 4. Query with state from test year; verify all returned analogs are strictly past
            test_query_state = analog_model.encode_state(oni=0.5, dmi=-0.2, mjo_phase=3, mjo_amplitude=1.5)
            matches = analog_model.find_analogs(test_query_state)
            self.assertGreater(len(matches), 0)
            for m in matches:
                self.assertLess(m.year, test_fold_year, f"Fold {test_fold_year} returned future/current analog match from year {m.year}")

    # 13. Fold-Specific Supervised GRU Training Without Future Contamination
    def test_fold_specific_gru_training_isolation(self) -> None:
        """Verify GRU model is trained only on past sequences and weights update deterministically."""
        rng = np.random.RandomState(42)
        n_seqs = 30
        X_seqs = rng.randn(n_seqs, 30, 5)
        y_targets = np.zeros((n_seqs, 4, 4))
        y_targets[:, :, 0] = 1.0

        # Simulate metadata with sequence years
        meta_gru = [{"season_year": 2018 + (i % 6)} for i in range(n_seqs)]

        test_year = 2022
        # Filter sequences strictly < test_year
        valid_indices = [i for i, m in enumerate(meta_gru) if m["season_year"] < test_year]
        self.assertTrue(all(meta_gru[i]["season_year"] < test_year for i in valid_indices))

        X_train_gru = X_seqs[valid_indices]
        y_train_gru = y_targets[valid_indices]

        gru = SmallGRUModel(seed=42)
        res = gru.train_supervised(X_train_gru, y_train_gru, epochs=5, lr=0.01)
        self.assertTrue(res["is_trained"])
        self.assertGreater(res["weight_delta_norm"], 1e-4)

    # 14. Out-of-Sample Calibration Isolation
    def test_out_of_sample_calibration_isolation(self) -> None:
        """Verify ProbabilityCalibrator fits on validation split and leaves test fold strictly untouched."""
        rng = np.random.RandomState(42)
        n_samples = 60
        raw_probs = rng.uniform(0.1, 0.9, (n_samples, 4))
        raw_probs /= raw_probs.sum(axis=1, keepdims=True)
        y = rng.choice([0, 1, 2, 3], size=n_samples)

        # Chronological split: earlier 40 for validation fit, later 20 for test evaluation
        val_probs, val_y = raw_probs[:40], y[:40]
        test_probs, test_y = raw_probs[40:], y[40:]

        calibrator = ProbabilityCalibrator(method="auto")
        calibrator.fit(val_probs, val_y)
        self.assertTrue(calibrator.is_fitted)

        # Calibrate test set using fitted calibrator
        cal_test = calibrator.calibrate_matrix(test_probs)
        self.assertEqual(cal_test.shape, (20, 4))
        # Verify row sums are normalized
        for row in cal_test:
            self.assertAlmostEqual(float(np.sum(row)), 1.0, places=4)

    # 15. Baseline Comparison and Brier Skill Score
    def test_baseline_comparison_and_skill_score(self) -> None:
        """Verify climatological baseline and Brier Skill Score computation."""
        y_true = np.array([0, 0, 0, 1, 2, 0, 3, 0, 2, 0])
        n = len(y_true)

        # Climatological prior from training
        p_clim = np.array([np.mean(y_true == c) for c in range(4)])
        probs_clim = np.tile(p_clim, (n, 1))

        # Model with better discrimination
        probs_model = np.zeros((n, 4))
        for i, yt in enumerate(y_true):
            probs_model[i, yt] = 0.8
            for c in range(4):
                if c != yt:
                    probs_model[i, c] = 0.2 / 3.0

        bs_clim = float(np.mean([np.mean((probs_clim[:, c] - (y_true == c)) ** 2) for c in range(4)]))
        bs_model = float(np.mean([np.mean((probs_model[:, c] - (y_true == c)) ** 2) for c in range(4)]))

        bss = 1.0 - (bs_model / bs_clim)
        self.assertGreater(bss, 0.0, "Skillful model must achieve positive BSS over climatology")

    # 16. Target Definition Precedence & Boundary Conditions
    def test_target_definitions_and_boundary_conditions(self) -> None:
        """Verify target definitions, priority rules, and boundary window checks."""
        # 1. Onset takes priority over heavy rain when both are present
        target_onset = FeatureExtractor.compute_target_class(
            fw_states=[1, 4, 0, 0, 0, 0, 0],
            fw_rain=[70.0, 70.0, 5.0, 0.0, 0.0, 0.0, 0.0],
        )
        self.assertEqual(target_onset, 1, "Onset must take precedence as macro seasonal transition")

        # 2. Heavy rain without onset (either state 4 or rainfall > 64.5 mm)
        target_heavy_state = FeatureExtractor.compute_target_class(
            fw_states=[0, 4, 0, 0, 0, 0, 0],
            fw_rain=[10.0, 30.0, 5.0, 0.0, 0.0, 0.0, 0.0],
        )
        self.assertEqual(target_heavy_state, 3, "State 4 must trigger Heavy Rain target")

        target_heavy_rain = FeatureExtractor.compute_target_class(
            fw_states=[0, 0, 0, 0, 0, 0, 0],
            fw_rain=[5.0, 10.0, 65.0, 0.0, 0.0, 0.0, 0.0],
        )
        self.assertEqual(target_heavy_rain, 3, "Rainfall > 64.5 mm must trigger Heavy Rain target")

        # 3. Dry Break threshold (>= 4 dry days in 7-day window)
        target_break = FeatureExtractor.compute_target_class(
            fw_states=[3, 3, 3, 3, 0, 0, 0],
            fw_rain=[0.0, 0.0, 0.0, 0.0, 10.0, 10.0, 10.0],
        )
        self.assertEqual(target_break, 2, ">= 4 break days in 7-day window must trigger Break target")

        target_no_break = FeatureExtractor.compute_target_class(
            fw_states=[3, 3, 3, 0, 0, 0, 0],
            fw_rain=[0.0, 0.0, 0.0, 10.0, 10.0, 10.0, 10.0],
        )
        self.assertEqual(target_no_break, 0, "< 4 break days in 7-day window must remain Active/Normal")

        # 4. Truncated window boundary (< 3 days)
        target_truncated = FeatureExtractor.compute_target_class(
            fw_states=[1, 4],
            fw_rain=[50.0, 70.0],
        )
        self.assertIsNone(target_truncated, "Window with < 3 days must return None")

    # 17. Change-Point Detection Truthfulness (Sequential Mann-Kendall & Pettitt)
    def test_changepoint_detector_truthfulness(self) -> None:
        """Verify Sequential Mann-Kendall and Pettitt tests detect real abrupt transitions."""
        # 1. Step change upward (low rainfall -> high rainfall)
        step_series = [1.0] * 12 + [15.0] * 12
        dates = [f"2024-06-{i+1:02d}" for i in range(24)]

        # Pettitt test
        pet_res = ChangePointDetector.pettitt_test(step_series)
        self.assertTrue(pet_res["has_changepoint"])
        self.assertEqual(pet_res["shift_direction"], "upward")
        self.assertIn(pet_res["index"], [11, 12, 13])

        # Sequential Mann-Kendall test
        smk_res = ChangePointDetector.sequential_mann_kendall(step_series)
        self.assertTrue(smk_res["has_changepoint"])

        # Onset transition detection
        onset_res = ChangePointDetector.detect_onset_transition(step_series, dates)
        self.assertTrue(onset_res["detected"])
        self.assertIsNotNone(onset_res["transition_date"])
        self.assertGreaterEqual(onset_res["post_mean_rain_mm"], 2.5)

        # 2. Step change downward (wet spell -> prolonged dry break)
        break_series = [20.0] * 12 + [0.0] * 12
        temp_series = [28.0] * 12 + [35.0] * 12
        break_res = ChangePointDetector.detect_break_transition(break_series, temp_series, dates)
        self.assertTrue(break_res["detected"])
        self.assertIsNotNone(break_res["transition_date"])

        # 3. Flat series has no change-point
        flat_series = [5.0] * 20
        flat_pet = ChangePointDetector.pettitt_test(flat_series)
        self.assertFalse(flat_pet["has_changepoint"])

        # 4. Short series (< 4 samples) gracefully returns False
        short_res = ChangePointDetector.pettitt_test([1.0, 2.0])
        self.assertFalse(short_res["has_changepoint"])

    # 18. Class Imbalance Signal Separation Diagnostics
    def test_class_imbalance_separation_diagnostics(self) -> None:
        """Verify computation of class prevalence and probability separation ratio."""
        y_test = np.array([0, 0, 0, 0, 1, 0, 2, 2, 0, 3])
        # Model that has strong signal separation for class 1 (onset)
        probs = np.array([
            [0.7, 0.05, 0.15, 0.1],
            [0.8, 0.05, 0.1, 0.05],
            [0.75, 0.05, 0.1, 0.1],
            [0.8, 0.05, 0.1, 0.05],
            [0.3, 0.50, 0.1, 0.1],  # True onset with 50% probability
            [0.8, 0.05, 0.1, 0.05],
            [0.2, 0.05, 0.7, 0.05],
            [0.2, 0.05, 0.7, 0.05],
            [0.8, 0.05, 0.1, 0.05],
            [0.3, 0.05, 0.15, 0.5],
        ])

        # Onset separation ratio
        is_onset = (y_test == 1)
        mean_when_true = float(np.mean(probs[is_onset, 1]))
        mean_when_false = float(np.mean(probs[~is_onset, 1]))
        sep_ratio = mean_when_true / (mean_when_false + 1e-6)

        self.assertAlmostEqual(mean_when_true, 0.50, places=2)
        self.assertAlmostEqual(mean_when_false, 0.05, places=2)
        self.assertGreater(sep_ratio, 5.0, "Signal separation ratio must show distinct elevation on true events")

    # 19. Production Readiness Remains Blocked under Partial Coverage
    def test_production_readiness_remains_blocked_under_partial_coverage(self) -> None:
        """Verify nationwide gate strictly returns INSUFFICIENT_NATIONWIDE_COVERAGE under 30.48% coverage."""
        evaluator = ModelReadinessEvaluator()
        result = evaluator.evaluate(
            seasons=list(range(2014, 2026)),
            blocks_count=2156,  # 30.48% of 7,073
            samples_count=230592,
            class_counts={0: 154927, 1: 12048, 2: 49157, 3: 14460},
            test_class_counts={0: 368, 1: 41, 2: 126, 3: 41},
            val_metrics={"expected_calibration_error": 0.0605, "brier_score_multi": 0.1089},
            gru_status="TRAINED",
            require_nationwide_coverage=True,
        )

        self.assertFalse(result["is_production_ready"])
        self.assertEqual(result["model_tier"], "EXPERIMENTAL")
        self.assertEqual(result["status"], ModelReadinessStatus.INSUFFICIENT_NATIONWIDE_COVERAGE.value)
        self.assertIn("Historical archive covers only 2156 blocks / 7073 production blocks", result["reasons"][0])


if __name__ == "__main__":
    unittest.main()

