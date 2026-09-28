"""Unit tests for Supabase loader in dry-run mode and architectural enforcement."""

import unittest
from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.utils.config import PipelineConfig


class TestSupabaseLoader(unittest.TestCase):

    def setUp(self):
        self.mock_config = PipelineConfig(
            supabase_url="https://mock-project.supabase.co",
            supabase_service_role_key="mock_secret_key",
            supabase_anon_key="mock_anon_key",
            cdsapi_url=None,
            cdsapi_key=None,
            earthdata_username=None,
            earthdata_password=None,
            imd_api_key=None,
            imd_pune_user=None,
        )
        self.loader = SupabaseLoader(config=self.mock_config, dry_run=True)

    def test_panchayat_storage_ban(self):
        """Verify that attempting to load into any panchayat table is strictly prevented."""
        with self.assertRaises(RuntimeError) as ctx:
            self.loader._execute_upsert("panchayat_historical", [{"id": 1}])
        self.assertIn("Architectural Violation", str(ctx.exception))

    def test_dry_run_seasonal_load(self):
        record = {
            "block_id": "IND_TEST_001",
            "season_year": 2024,
            "season_start_date": "2024-04-01",
            "season_end_date": "2024-10-31",
            "rainfall_x10": [10] * 214,
            "max_temp_x10": [300] * 214,
            "soil_moisture_idx": [50] * 214,
            "weather_state_code": [0] * 214,
        }
        loaded = self.loader.load_seasonal_archives([record])
        self.assertEqual(loaded, 1)

    def test_dry_run_live_buffer_load(self):
        record = {
            "block_id": "IND_TEST_001",
            "observation_date": "2024-07-01",
            "rainfall_mm": 5.4,
            "max_temp_c": 31.0,
            "min_temp_c": 22.0,
            "soil_moisture_idx": 45.0,
            "data_source": "GFS",
            "is_preliminary": True,
        }
        loaded = self.loader.load_live_weather_buffer([record])
        self.assertEqual(loaded, 1)


if __name__ == "__main__":
    unittest.main()
