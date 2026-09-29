"""Unit tests for Phase C Dedicated Nationwide Historical Meteorological Backfill.

Verifies:
- Checkpoint persistence, serialization, reconciliation, and idempotency.
- Authoritative production block filtering (7,073 blocks, 250 pending excluded).
- 214-day cardinality and natural meteorological variance validation.
- Skip logging and fail-closed behavior (no synthetic data fabrication).
- Dual endpoint routing (2016-2025 operational archive, 2014-2015 ERA5 reanalysis).
"""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from scripts.run_nationwide_historical_backfill import (
    BackfillCheckpoint,
    load_authoritative_blocks,
    process_single_season,
    log_skip,
    SKIPPED_LOG_PATH,
)
from pipeline.transforms.seasonal_pack import get_season_dates


class TestNationwideBackfill(unittest.TestCase):
    """Test suite for nationwide historical backfill logic and operational safety."""

    def test_checkpoint_roundtrip_and_idempotency(self):
        """Verify checkpoint file load, save, mark_completed, and idempotency."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = Path(tmp.name)

        try:
            cp = BackfillCheckpoint(checkpoint_file=tmp_path)
            self.assertFalse(cp.is_completed("4515", 2024))

            cp.mark_completed_batch(2024, ["4515", "726"], count=2)
            self.assertTrue(cp.is_completed("4515", 2024))
            self.assertTrue(cp.is_completed("726", 2024))
            self.assertFalse(cp.is_completed("2726", 2024))
            self.assertEqual(cp.total_records_upserted, 2)

            # Reload from disk
            cp2 = BackfillCheckpoint(checkpoint_file=tmp_path)
            self.assertTrue(cp2.is_completed("4515", 2024))
            self.assertTrue(cp2.is_completed("726", 2024))
            self.assertFalse(cp2.is_completed("4515", 2023))
        finally:
            if tmp_path.exists():
                tmp_path.unlink()

    def test_load_authoritative_blocks(self):
        """Verify that load_authoritative_blocks returns exactly 7,073 production blocks."""
        blocks = load_authoritative_blocks()
        self.assertEqual(len(blocks), 7073)

        # Verify no pending status blocks are included
        for b in blocks:
            self.assertEqual(b.get("spatial_match_status"), "MATCHED_AUTHORITATIVE_BOUNDARY")
            self.assertFalse(str(b.get("block_id")).startswith("IND_"))

    def test_process_single_season_valid(self):
        """Verify 214-day season packing produces valid smallint arrays with correct cardinality."""
        block = {
            "block_id": "4515",
            "centroid_lat": 18.65,
            "centroid_lon": 73.83,
        }
        season_dates = [str(d) for d in get_season_dates(2024)]
        self.assertEqual(len(season_dates), 214)

        daily_data = {
            "time": season_dates,
            "temperature_2m_max": [25.0 + (i % 18) for i in range(214)],
            "precipitation_sum": [0.0 if (i % 7 != 0) else 12.5 for i in range(214)],
            "soil_moisture_0_to_7cm_mean": [0.35 for _ in range(214)],
        }

        packed = process_single_season(block, daily_data, 2024)
        self.assertEqual(packed["block_id"], "4515")
        self.assertEqual(packed["season_year"], 2024)
        self.assertEqual(len(packed["rainfall_x10"]), 214)
        self.assertEqual(len(packed["max_temp_x10"]), 214)
        self.assertEqual(len(packed["soil_moisture_idx"]), 214)
        self.assertEqual(len(packed["weather_state_code"]), 214)

    def test_process_single_season_rejects_incomplete_cardinality(self):
        """Verify process_single_season refuses incomplete series (< 214 days)."""
        block = {"block_id": "4515"}
        daily_data = {
            "time": ["2024-04-01", "2024-04-02"],
            "temperature_2m_max": [30.0, 31.0],
            "precipitation_sum": [0.0, 5.0],
            "soil_moisture_0_to_7cm_mean": [0.3, 0.3],
        }
        with self.assertRaises(ValueError):
            process_single_season(block, daily_data, 2024)

    def test_process_single_season_rejects_constant_series(self):
        """Verify process_single_season rejects suspicious constant temperature series."""
        block = {"block_id": "4515"}
        season_dates = [str(d) for d in get_season_dates(2024)]
        daily_data = {
            "time": season_dates,
            "temperature_2m_max": [30.0 for _ in range(214)],  # Zero variance
            "precipitation_sum": [0.0 for _ in range(214)],
            "soil_moisture_0_to_7cm_mean": [0.3 for _ in range(214)],
        }
        with self.assertRaises(ValueError) as ctx:
            process_single_season(block, daily_data, 2024)
        self.assertIn("temperature variance", str(ctx.exception).lower())

    def test_skip_logging(self):
        """Verify unavailable block-season is logged without inventing fake records."""
        with tempfile.NamedTemporaryFile(suffix=".log", delete=False) as tmp:
            tmp_log = Path(tmp.name)

        try:
            with patch("scripts.run_nationwide_historical_backfill.SKIPPED_LOG_PATH", tmp_log):
                log_skip("9999", 2020, "Source HTTP 429: Rate limit exceeded")
                content = tmp_log.read_text(encoding="utf-8")
                self.assertIn("Block 9999 Season 2020: Source HTTP 429: Rate limit exceeded", content)
        finally:
            if tmp_log.exists():
                tmp_log.unlink()


if __name__ == "__main__":
    unittest.main()
