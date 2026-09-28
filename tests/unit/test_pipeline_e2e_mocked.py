"""Deterministic end-to-end pipeline test for BHUMI data pipeline.

Validates the complete transformation -> validation -> database-loading path
using dry-run mode and mock datasets with zero external network calls.
"""

import datetime
import unittest

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.transforms.buffer_pack import pack_live_buffer_record
from pipeline.transforms.seasonal_pack import pack_seasonal_archive
from pipeline.utils.config import PipelineConfig
from pipeline.utils.validation import validate_teleconnection_record


class TestPipelineEndToEndMocked(unittest.TestCase):

    def setUp(self):
        self.mock_config = PipelineConfig(
            supabase_url="https://mock-project.supabase.co",
            supabase_service_role_key="mock_key",
            supabase_anon_key="mock_anon_key",
            cdsapi_url=None,
            cdsapi_key=None,
            earthdata_username=None,
            earthdata_password=None,
            imd_api_key=None,
            imd_pune_user=None,
        )
        self.loader = SupabaseLoader(config=self.mock_config, dry_run=True)
        self.test_block_id = "IND_SAMPLE_REP_001"

    def test_complete_representative_pipeline_path_deterministic(self):
        # 1. Representative Block
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
        }
        loaded_blocks = self.loader.load_blocks([representative_block])
        self.assertEqual(loaded_blocks, 1)

        # 2. Pack 214-day seasonal series
        rainfall_series = [12.5 + (i % 8) for i in range(214)]
        max_temp_series = [32.0 + (i % 6) for i in range(214)]
        soil_moisture_series = [45.0 + (i % 20) for i in range(214)]

        archive_record = pack_seasonal_archive(
            block_id=self.test_block_id,
            season_year=2024,
            rainfall_series=rainfall_series,
            max_temp_series=max_temp_series,
            soil_moisture_series=soil_moisture_series,
        )
        self.assertEqual(len(archive_record["rainfall_x10"]), 214)
        loaded_archives = self.loader.load_seasonal_archives([archive_record])
        self.assertEqual(loaded_archives, 1)

        # 3. Live buffer record
        live_record = pack_live_buffer_record(
            block_id=self.test_block_id,
            observation_date=datetime.date(2024, 7, 15),
            rainfall_mm=14.2,
            max_temp_c=31.8,
            min_temp_c=23.4,
            soil_moisture_idx=62.0,
            data_source="GFS_ECMWF_IMD_CONSENSUS",
            is_preliminary=False,
        )
        loaded_live = self.loader.load_live_weather_buffer([live_record])
        self.assertEqual(loaded_live, 1)

        # 4. Teleconnection record
        teleconn_record = {
            "observation_date": "2099-01-01",
            "enso_oni": 0.45,
            "iod_dmi": -0.15,
            "mjo_phase": 5,
            "mjo_amplitude": 1.62,
            "source_agency": "NOAA_CPC_BOM_AU",
        }
        validated_tele = validate_teleconnection_record(teleconn_record)
        loaded_tele = self.loader.load_teleconnections([validated_tele])
        self.assertEqual(loaded_tele, 1)


if __name__ == "__main__":
    unittest.main()
