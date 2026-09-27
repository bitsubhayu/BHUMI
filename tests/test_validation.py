"""Unit tests for pipeline validation functions."""

import unittest
from pipeline.utils.validation import (
    ValidationError,
    validate_block_id,
    validate_date_string,
    validate_live_weather_buffer,
    validate_seasonal_archive,
    validate_seasonal_array,
    validate_teleconnection_record,
)


class TestValidation(unittest.TestCase):

    def test_validate_date_string(self):
        d = validate_date_string("2024-06-15")
        self.assertEqual(d.year, 2024)
        self.assertEqual(d.month, 6)
        self.assertEqual(d.day, 15)

        with self.assertRaises(ValidationError):
            validate_date_string("invalid-date")
        with self.assertRaises(ValidationError):
            validate_date_string("2024-02-30")

    def test_validate_block_id(self):
        self.assertEqual(validate_block_id("IND_MH_PUN_001"), "IND_MH_PUN_001")
        with self.assertRaises(ValidationError):
            validate_block_id("")
        with self.assertRaises(ValidationError):
            validate_block_id(" " * 5)
        with self.assertRaises(ValidationError):
            validate_block_id("x" * 51)

    def test_validate_seasonal_array_cardinality(self):
        valid_arr = [10] * 214
        res = validate_seasonal_array(valid_arr, "test", min_val=0, max_val=100)
        self.assertEqual(len(res), 214)

        # Wrong cardinality (213 elements)
        with self.assertRaises(ValidationError):
            validate_seasonal_array([10] * 213, "test", min_val=0, max_val=100)

        # Wrong cardinality (215 elements)
        with self.assertRaises(ValidationError):
            validate_seasonal_array([10] * 215, "test", min_val=0, max_val=100)

    def test_validate_seasonal_array_bounds_and_nulls(self):
        arr_with_none = [10] * 213 + [None]
        with self.assertRaises(ValidationError):
            validate_seasonal_array(arr_with_none, "test", min_val=0, max_val=100)

        arr_out_of_bounds = [10] * 213 + [150]
        with self.assertRaises(ValidationError):
            validate_seasonal_array(arr_out_of_bounds, "test", min_val=0, max_val=100)

    def test_validate_seasonal_archive_full(self):
        record = {
            "block_id": "IND_TEST_001",
            "season_year": 2024,
            "season_start_date": "2024-04-01",
            "season_end_date": "2024-10-31",
            "rainfall_x10": [25] * 214,
            "max_temp_x10": [320] * 214,
            "soil_moisture_idx": [45] * 214,
            "weather_state_code": [0] * 214,
        }
        validated = validate_seasonal_archive(record)
        self.assertEqual(validated["block_id"], "IND_TEST_001")
        self.assertEqual(len(validated["rainfall_x10"]), 214)

        # Missing required key
        invalid = dict(record)
        del invalid["rainfall_x10"]
        with self.assertRaises(ValidationError):
            validate_seasonal_archive(invalid)

    def test_validate_live_weather_buffer(self):
        record = {
            "block_id": "IND_TEST_001",
            "observation_date": "2024-07-01",
            "rainfall_mm": 12.4,
            "max_temp_c": 33.5,
            "min_temp_c": 24.1,
            "soil_moisture_idx": 55.0,
            "data_source": "GFS",
            "is_preliminary": True,
        }
        validated = validate_live_weather_buffer(record)
        self.assertEqual(validated["rainfall_mm"], 12.4)

        # Impossible rainfall
        with self.assertRaises(ValidationError):
            bad = dict(record, rainfall_mm=-5.0)
            validate_live_weather_buffer(bad)

        # Min temp > max temp
        with self.assertRaises(ValidationError):
            bad = dict(record, min_temp_c=35.0, max_temp_c=30.0)
            validate_live_weather_buffer(bad)

    def test_validate_teleconnection_record(self):
        record = {
            "observation_date": "2024-06-15",
            "enso_oni": 0.85,
            "iod_dmi": -0.12,
            "mjo_phase": 4,
            "mjo_amplitude": 1.45,
            "source_agency": "NOAA_CPC_BOM_AU",
        }
        validated = validate_teleconnection_record(record)
        self.assertEqual(validated["mjo_phase"], 4)

        # Invalid MJO phase (out of 1-8)
        with self.assertRaises(ValidationError):
            bad = dict(record, mjo_phase=9)
            validate_teleconnection_record(bad)


if __name__ == "__main__":
    unittest.main()
