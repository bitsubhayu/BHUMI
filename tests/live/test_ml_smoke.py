"""Real-Data Smoke Test for BHUMI ML Forecasting Engine.

Uses ONLY currently available genuine historical data in Supabase (2024 season).
Does NOT fabricate synthetic data.
Verifies end-to-end:
  1. Offline model training & rolling validation on actual archive
  2. Artifact generation in pipeline/ml/artifacts/
  3. Live inference execution
  4. Database upsert and verification in public.live_predictions
"""

from __future__ import annotations

import unittest
from pathlib import Path

from pipeline.ml.inference import ProductionInferenceEngine
from pipeline.ml.trainer import SeasonalModelTrainer
from pipeline.utils.config import get_pipeline_config


class TestRealDataMLSmoke(unittest.TestCase):
    """End-to-end smoke test on real Supabase archive data."""

    def setUp(self) -> None:
        self.config = get_pipeline_config()
        if not self.config.has_supabase:
            self.skipTest("Supabase credentials not configured in environment or .env.local")

    def test_real_data_training_and_inference(self) -> None:
        """Execute real training pass and live inference against Supabase."""
        # 1. Run trainer against authentic Supabase archive
        trainer = SeasonalModelTrainer(config=self.config)
        metadata = trainer.train_and_evaluate()

        self.assertIn("model_version", metadata)
        self.assertIn("training_coverage", metadata)
        self.assertIn("validation_metrics", metadata)

        # Verify artifacts exist on disk
        artifacts_dir = Path(__file__).resolve().parent.parent.parent / "pipeline" / "ml" / "artifacts"
        self.assertTrue((artifacts_dir / "metadata.json").exists())
        self.assertTrue((artifacts_dir / "calibrator.json").exists())
        self.assertTrue((artifacts_dir / "ensemble_meta.json").exists())
        self.assertTrue((artifacts_dir / "gru_weights.json").exists())

        # Verify size constraints (< 5 MB total)
        total_size_bytes = sum(f.stat().st_size for f in artifacts_dir.glob("*") if f.is_file())
        self.assertLess(total_size_bytes, 5 * 1024 * 1024, "Artifacts exceed 5 MB size limit")

        # 2. Run real live inference
        engine = ProductionInferenceEngine(config=self.config, dry_run=False)
        inf_result = engine.run_inference()

        self.assertGreater(inf_result["blocks_processed"], 0)
        self.assertGreater(inf_result["predictions_count"], 0)
        self.assertEqual(inf_result["predictions_count"], inf_result["rows_loaded"])

        # 3. Query back public.live_predictions from Supabase
        loader = engine.loader
        preds = loader.fetch_live_predictions()
        self.assertGreater(len(preds), 0, "No rows found in public.live_predictions")

        # Check lead weeks 1 through 4 exist
        lead_buckets = {p["lead_time_bucket"] for p in preds}
        for expected_w in ["week_1", "week_2", "week_3", "week_4"]:
            self.assertIn(expected_w, lead_buckets)

        # Check probability bounds and drivers
        for p in preds[:10]:
            self.assertGreaterEqual(p["onset_probability"], 0.0)
            self.assertLessEqual(p["onset_probability"], 100.0)
            self.assertGreaterEqual(p["break_probability"], 0.0)
            self.assertLessEqual(p["break_probability"], 100.0)
            self.assertGreaterEqual(p["heavy_spell_probability"], 0.0)
            self.assertLessEqual(p["heavy_spell_probability"], 100.0)
            self.assertGreaterEqual(p["calibrated_confidence"], 0.0)
            self.assertLessEqual(p["calibrated_confidence"], 100.0)
            self.assertTrue(len(p["primary_driver"].strip()) > 0)

        # Check uniqueness constraint: (block_id, prediction_date, lead_time_bucket)
        tuples = [(p["block_id"], p["prediction_date"], p["lead_time_bucket"]) for p in preds]
        self.assertEqual(len(tuples), len(set(tuples)), "Duplicate predictions found in database!")


if __name__ == "__main__":
    unittest.main()
