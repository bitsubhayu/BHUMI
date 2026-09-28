"""Unit tests for seasonal archive packing."""

import unittest
from pipeline.transforms.seasonal_pack import pack_seasonal_archive


class TestSeasonalPack(unittest.TestCase):

    def test_pack_seasonal_archive_scaling(self):
        # 214 daily values
        rain = [12.4] * 214
        temp = [32.6] * 214
        soil = [45.2] * 214

        packed = pack_seasonal_archive(
            block_id="IND_TEST_001",
            season_year=2024,
            rainfall_series=rain,
            max_temp_series=temp,
            soil_moisture_series=soil,
        )

        self.assertEqual(packed["block_id"], "IND_TEST_001")
        self.assertEqual(packed["season_year"], 2024)
        # Scaled values check: 12.4 * 10 = 124
        self.assertEqual(packed["rainfall_x10"][0], 124)
        # 32.6 * 10 = 326
        self.assertEqual(packed["max_temp_x10"][0], 326)
        # 45.2 rounded = 45
        self.assertEqual(packed["soil_moisture_idx"][0], 45)
        # Cardinality
        self.assertEqual(len(packed["rainfall_x10"]), 214)
        self.assertEqual(len(packed["max_temp_x10"]), 214)
        self.assertEqual(len(packed["soil_moisture_idx"]), 214)
        self.assertEqual(len(packed["weather_state_code"]), 214)

    def test_pack_seasonal_archive_invalid_length(self):
        with self.assertRaises(ValueError):
            pack_seasonal_archive(
                block_id="IND_TEST_001",
                season_year=2024,
                rainfall_series=[10.0] * 200,  # Invalid length
                max_temp_series=[30.0] * 214,
                soil_moisture_series=[50.0] * 214,
            )


if __name__ == "__main__":
    unittest.main()
