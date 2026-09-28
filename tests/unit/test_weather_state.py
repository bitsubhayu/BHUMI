"""Unit tests for monsoon weather state classification engine."""

import unittest
from pipeline.transforms.seasonal_pack import get_season_dates
from pipeline.transforms.weather_state import classify_monsoon_states


class TestWeatherStateClassification(unittest.TestCase):

    def setUp(self):
        self.dates = get_season_dates(2024)
        self.assertEqual(len(self.dates), 214)

    def test_heavy_rainfall_detection(self):
        # Base dry sequence
        rain = [0.0] * 214
        # Inject heavy rain event (day 100)
        rain[100] = 75.0  # >= 64.5 mm
        states = classify_monsoon_states(self.dates, rain)
        self.assertEqual(states[100], 4)

    def test_monsoon_onset_detection(self):
        rain = [0.0] * 214
        # Day 45 (approx 15 May) gets sustained rain
        rain[45] = 12.0
        rain[46] = 18.0
        states = classify_monsoon_states(self.dates, rain)
        self.assertEqual(states[45], 1)
        self.assertEqual(states[46], 1)

    def test_monsoon_break_detection(self):
        rain = [10.0] * 214  # Active rainy baseline
        # Insert a 4-day dry spell in July (approx day 100-103)
        for i in range(100, 104):
            rain[i] = 0.5  # < 2.5 mm

        states = classify_monsoon_states(self.dates, rain)
        for i in range(100, 104):
            self.assertEqual(states[i], 3, f"Day {i} should be classified as Break (code 3)")

    def test_active_monsoon_detection(self):
        rain = [0.0] * 214
        # Wet day in July (day 110) with 25 mm rain
        rain[110] = 25.0
        states = classify_monsoon_states(self.dates, rain)
        self.assertEqual(states[110], 2, "Rain > 15mm in monsoon month should be Active (code 2)")


if __name__ == "__main__":
    unittest.main()
