"""End-to-end representative dataset test for BHUMI data pipeline.

Validates the complete transformation -> validation -> database-loading path
against the live configured Supabase database using a minimal representative sample.
Ensures zero pollution by cleaning up test records after verification.
"""

import datetime
import unittest
import requests

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.transforms.buffer_pack import pack_live_buffer_record
from pipeline.transforms.seasonal_pack import pack_seasonal_archive
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.validation import validate_teleconnection_record


class TestPipelineEndToEnd(unittest.TestCase):

    def setUp(self):
        self.config = get_pipeline_config()
        if not self.config.has_supabase:
            self.skipTest("Supabase credentials not configured in environment")

        self.loader = SupabaseLoader(config=self.config, dry_run=False)
        self.test_block_id = "IND_SAMPLE_REP_001"
        self.headers = {
            "apikey": self.config.supabase_service_role_key,
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
        }

    def tearDown(self):
        """Clean up sample test records."""
        url = self.config.supabase_url.rstrip("/")
        # Delete sample block (cascades to seasonal_archives and live_weather_buffer)
        requests.delete(
            f"{url}/rest/v1/blocks?block_id=eq.{self.test_block_id}",
            headers=self.headers,
        )
        # Delete sample teleconnection date
        requests.delete(
            f"{url}/rest/v1/teleconnections_history?observation_date=eq.2099-01-01",
            headers=self.headers,
        )

    def test_complete_representative_pipeline_path(self):
        url = self.config.supabase_url.rstrip("/")

        # 1. Upsert Representative Block into public.blocks
        representative_block = {
            "block_id": self.test_block_id,
            "block_name": "Sample Haveli Block",
            "district_name": "Pune",
            "state_name": "Maharashtra",
            "centroid_lat": 18.5204,
            "centroid_lon": 73.8567,
            "elevation_m": 560.0,
            "slope_deg": 2.1,
            "distance_to_coast_km": 120.0,
            "agro_climatic_zone": "Western Plateau and Hills",
        }
        loaded_blocks = self.loader.load_blocks([representative_block])
        self.assertEqual(loaded_blocks, 1)

        # 2. Transform & Load 214-day Seasonal Archive Record
        # Generate 214 daily representative observations (simulating monsoon rainfall curve)
        rain_series = [0.0] * 214
        for d in range(60, 150):  # June to August wet season
            rain_series[d] = 18.5
        temp_series = [31.5] * 214
        soil_series = [45.0] * 214

        seasonal_record = pack_seasonal_archive(
            block_id=self.test_block_id,
            season_year=2024,
            rainfall_series=rain_series,
            max_temp_series=temp_series,
            soil_moisture_series=soil_series,
        )
        loaded_archives = self.loader.load_seasonal_archives([seasonal_record])
        self.assertEqual(loaded_archives, 1)

        # Verify remote seasonal_archive via PostgREST
        res = requests.get(
            f"{url}/rest/v1/seasonal_archives?block_id=eq.{self.test_block_id}&select=season_year,rainfall_x10",
            headers=self.headers,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["season_year"], 2024)
        self.assertEqual(len(data[0]["rainfall_x10"]), 214)

        # 3. Transform & Load Live Weather Buffer Observation
        live_rec = pack_live_buffer_record(
            block_id=self.test_block_id,
            observation_date="2024-07-15",
            rainfall_mm=22.4,
            max_temp_c=31.2,
            min_temp_c=23.5,
            soil_moisture_idx=65.0,
            data_source="GFS_OPEN_DATA",
            is_preliminary=True,
        )
        loaded_live = self.loader.load_live_weather_buffer([live_rec])
        self.assertEqual(loaded_live, 1)

        # 4. Load National Teleconnection Daily Record
        tele_rec = validate_teleconnection_record({
            "observation_date": "2099-01-01",  # Future test date to isolate
            "enso_oni": 0.72,
            "iod_dmi": 0.15,
            "mjo_phase": 5,
            "mjo_amplitude": 1.25,
            "source_agency": "TEST_PIPELINE",
        })
        loaded_tele = self.loader.load_teleconnections([tele_rec])
        self.assertEqual(loaded_tele, 1)

        print("[OK] Complete representative pipeline path verified against live Supabase database!")


if __name__ == "__main__":
    unittest.main()
