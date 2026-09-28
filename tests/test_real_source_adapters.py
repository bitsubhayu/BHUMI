"""Tests verifying that production weather data adapters perform genuine data retrieval
and do NOT return synthetic hardcoded placeholder values.
"""

import ast
import datetime
import os
import unittest

from pipeline.sources.chirps import ChirpsAdapter
from pipeline.sources.ecmwf import EcmwfAdapter
from pipeline.sources.era5 import Era5Adapter
from pipeline.sources.gfs import GfsAdapter
from pipeline.sources.gpm_imerg import GpmImergAdapter
from pipeline.sources.smap import SmapAdapter
from pipeline.sources.teleconnections import TeleconnectionsAdapter
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.grib2 import decode_grib2_grid, extract_point_from_grib2, parse_grib2_sections


class TestSourceAdaptersNoPlaceholders(unittest.TestCase):
    """Static and structural AST verification ensuring zero placeholder constants in adapters."""

    def test_sources_contain_no_hardcoded_placeholder_literals(self):
        """Scans all source adapter code files to ensure forbidden placeholder literals

        such as 32.5, 33.1, 31.8, 50.0, 5.2, 8.4, 6.8 are not present in return statements.
        """
        forbidden_literals = {32.5, 33.1, 31.8, 50.0, 5.2, 8.4, 6.8}
        sources_dir = os.path.join(os.path.dirname(__file__), "..", "pipeline", "sources")

        for fname in os.listdir(sources_dir):
            if not fname.endswith(".py") or fname == "__init__.py":
                continue
            fpath = os.path.join(sources_dir, fname)
            with open(fpath, "r", encoding="utf-8") as f:
                tree = ast.parse(f.read(), filename=fname)

            # Walk all AST Return nodes
            for node in ast.walk(tree):
                if isinstance(node, ast.Return) and node.value:
                    if isinstance(node.value, ast.Dict):
                        for val_node in node.value.values:
                            if isinstance(val_node, ast.Constant):
                                self.assertNotIn(
                                    val_node.value,
                                    forbidden_literals,
                                    f"File {fname} contains forbidden placeholder constant {val_node.value} in return dict",
                                )
                    elif isinstance(node.value, ast.Constant):
                        self.assertNotIn(
                            node.value.value,
                            forbidden_literals,
                            f"File {fname} contains forbidden placeholder constant {node.value.value} in return statement",
                        )


class TestRealDataIngestion(unittest.TestCase):
    """Live network ingestion tests verifying real data extraction from authoritative upstream APIs."""

    @classmethod
    def setUpClass(cls):
        cls.config = get_pipeline_config()
        # Representative coordinate: Pune Haveli (18.5204 N, 73.8567 E)
        cls.test_lat = 18.5204
        cls.test_lon = 73.8567
        cls.today = datetime.date.today()

    def test_gfs_real_operational_forecast(self):
        """Validates that GfsAdapter connects to NOAA NOMADS, parses real GRIB2,

        and returns physical non-placeholder atmospheric parameters.
        """
        adapter = GfsAdapter(config=self.config)
        res = adapter.fetch_daily_forecast(
            target_date=self.today,
            lat=self.test_lat,
            lon=self.test_lon,
        )
        self.assertTrue(res.success, f"GFS fetch failed: {res.error_message}")
        rec = res.data
        self.assertIsNotNone(rec)

        # Assert data types
        self.assertIsInstance(rec["max_temp_c"], float)
        self.assertIsInstance(rec["min_temp_c"], float)
        self.assertIsInstance(rec["rainfall_mm"], float)

        # Assert physically valid tropical/subtropical meteorological ranges
        self.assertGreaterEqual(rec["max_temp_c"], 10.0, "Max temp unreasonably cold for Pune")
        self.assertLessEqual(rec["max_temp_c"], 52.0, "Max temp unreasonably hot for Pune")
        self.assertGreaterEqual(rec["min_temp_c"], 5.0, "Min temp unreasonably cold for Pune")
        self.assertLessEqual(rec["min_temp_c"], rec["max_temp_c"] + 0.1, "Min temp must be <= Max temp")
        self.assertGreaterEqual(rec["rainfall_mm"], 0.0, "Rainfall cannot be negative")

        # Assert values are real dynamic measurements, not forbidden placeholders
        forbidden_temperatures = {32.5, 33.1, 31.8, 50.0}
        self.assertNotIn(rec["max_temp_c"], forbidden_temperatures)
        print(f"[OK] GFS Real Ingestion: max_temp={rec['max_temp_c']}C, min_temp={rec['min_temp_c']}C, rain={rec['rainfall_mm']}mm")

    def test_ecmwf_real_open_data_forecast(self):
        """Validates that EcmwfAdapter connects to ECMWF Open Data,

        and returns real operational forecast values without synthetic constants.
        """
        adapter = EcmwfAdapter(config=self.config)
        res = adapter.fetch_daily_forecast(
            target_date=self.today,
            lat=self.test_lat,
            lon=self.test_lon,
        )
        self.assertTrue(res.success, f"ECMWF fetch failed: {res.error_message}")
        rec = res.data
        self.assertIsNotNone(rec)

        self.assertIsInstance(rec["max_temp_c"], float)
        self.assertIsInstance(rec["min_temp_c"], float)
        self.assertIsInstance(rec["rainfall_mm"], float)

        # Meteorological reality checks
        self.assertGreaterEqual(rec["max_temp_c"], 10.0)
        self.assertLessEqual(rec["max_temp_c"], 52.0)
        self.assertGreaterEqual(rec["min_temp_c"], 5.0)
        self.assertLessEqual(rec["min_temp_c"], rec["max_temp_c"] + 0.1)

        forbidden_temperatures = {32.5, 33.1, 31.8, 50.0}
        self.assertNotIn(rec["max_temp_c"], forbidden_temperatures)
        print(f"[OK] ECMWF Real Ingestion: max_temp={rec['max_temp_c']}C, min_temp={rec['min_temp_c']}C, rain={rec['rainfall_mm']}mm")

    def test_chirps_real_raster_extraction(self):
        """Validates that ChirpsAdapter downloads genuine daily GeoTIFF from UCSB CHC,

        decompresses gzip in-memory, decodes raster, and extracts valid precipitation.
        """
        adapter = ChirpsAdapter(config=self.config)
        # Test a known monsoon date in historical archive: 2023-07-15
        target_date = datetime.date(2023, 7, 15)
        res = adapter.fetch_daily_rainfall(
            target_date=target_date,
            lat=self.test_lat,
            lon=self.test_lon,
        )
        self.assertTrue(res.success, f"CHIRPS fetch failed: {res.error_message}")
        val = res.data
        self.assertIsNotNone(val, "CHIRPS must extract float observation for India coordinate")
        self.assertIsInstance(val, float)
        self.assertGreaterEqual(val, 0.0)
        self.assertLessEqual(val, 800.0, "Rainfall cannot exceed world record daily limits")

        # Western Ghats / Pune region had monsoon rain on 2023-07-15
        print(f"[OK] CHIRPS Real Ingestion (2023-07-15, Lat: {self.test_lat}, Lon: {self.test_lon}): rain={val:.2f}mm")

    def test_smap_earthdata_integration(self):
        """Validates that SmapAdapter connects using Earthdata credentials and parses soil moisture."""
        if not self.config.has_earthdata:
            self.skipTest("NASA Earthdata credentials not configured in environment (required for live SMAP test)")
        adapter = SmapAdapter(config=self.config)
        target_date = self.today - datetime.timedelta(days=5)
        res = adapter.fetch_soil_wetness_index(
            target_date=target_date,
            lat=self.test_lat,
            lon=self.test_lon,
        )
        if not res.success and (
            "Network is unreachable" in (res.error_message or "")
            or "Failed to establish a new connection" in (res.error_message or "")
            or "Max retries exceeded" in (res.error_message or "")
            or "Connection refused" in (res.error_message or "")
        ):
            self.skipTest(f"NASA Earthdata upstream network unreachable: {res.error_message}")

        self.assertTrue(res.success, f"SMAP fetch failed: {res.error_message}")
        idx = res.data
        self.assertIsNotNone(idx)
        self.assertIsInstance(idx, float)
        self.assertGreaterEqual(idx, 0.0)
        self.assertLessEqual(idx, 100.0)
        # Verify not placeholder 50.0
        self.assertNotEqual(idx, 50.0, "SMAP must return real computed wetness, not placeholder 50.0")
        print(f"[OK] SMAP Real Ingestion ({target_date}): soil_idx={idx:.1f}")

    def test_gpm_imerg_real_precipitation(self):
        """Validates that GpmImergAdapter queries NASA Earthdata and parses satellite precipitation

        from authentic NetCDF4/HDF5 product, or transparently reports GES DISC EULA status
        without synthetic fallbacks.
        """
        if not self.config.has_earthdata:
            self.skipTest("NASA Earthdata credentials not configured in environment (required for live GPM test)")
        adapter = GpmImergAdapter(config=self.config)
        target_date = self.today - datetime.timedelta(days=3)
        res = adapter.fetch_daily_precipitation(
            target_date=target_date,
            lat=self.test_lat,
            lon=self.test_lon,
        )
        if not res.success and (
            "Network is unreachable" in (res.error_message or "")
            or "Failed to establish a new connection" in (res.error_message or "")
            or "Max retries exceeded" in (res.error_message or "")
            or "Connection refused" in (res.error_message or "")
        ):
            self.skipTest(f"NASA Earthdata upstream network unreachable: {res.error_message}")
        elif not res.success and "NASA GES DISC EULA" in (res.error_message or ""):
            print(f"[NOTE] GPM IMERG authentic retrieval requires GES DISC EULA authorization in URS: {res.error_message}")
            self.assertIn("NASA GES DISC EULA", res.error_message)
            self.assertIsNone(res.data, "Must not return synthetic data on unaccepted EULA")
        else:
            self.assertTrue(res.success, f"GPM IMERG fetch failed: {res.error_message}")
            rain = res.data
            self.assertIsNotNone(rain)
            self.assertIsInstance(rain, float)
            self.assertGreaterEqual(rain, 0.0)
            self.assertLessEqual(rain, 800.0)
            print(f"[OK] GPM IMERG Real Ingestion ({target_date}): rain={rain:.2f}mm")

    def test_era5_historical_reanalysis(self):
        """Validates that Era5Adapter queries reanalysis data and returns real physical values."""
        adapter = Era5Adapter(config=self.config)
        target_date = datetime.date(2023, 7, 15)
        res = adapter.fetch_daily_reanalysis(
            target_date=target_date,
            lat=self.test_lat,
            lon=self.test_lon,
        )
        self.assertTrue(res.success, f"ERA5 fetch failed: {res.error_message}")
        rec = res.data
        self.assertIsNotNone(rec)

        self.assertIn("max_temp_c", rec)
        self.assertIn("rainfall_mm", rec)
        self.assertIn("soil_moisture_idx", rec)

        self.assertIsInstance(rec["max_temp_c"], float)
        self.assertIsInstance(rec["rainfall_mm"], float)
        self.assertIsInstance(rec["soil_moisture_idx"], float)

        # Check values are physically valid
        self.assertGreaterEqual(rec["max_temp_c"], 15.0)
        self.assertLessEqual(rec["max_temp_c"], 48.0)
        self.assertGreaterEqual(rec["soil_moisture_idx"], 0.0)
        self.assertLessEqual(rec["soil_moisture_idx"], 100.0)

        forbidden_values = {32.5, 33.1, 50.0}
        self.assertNotIn(rec["max_temp_c"], forbidden_values)
        print(f"[OK] ERA5 Real Ingestion: max_temp={rec['max_temp_c']}C, rain={rec['rainfall_mm']}mm, soil_idx={rec['soil_moisture_idx']}")

    def test_teleconnections_real_fetch(self):
        """Validates NOAA CPC teleconnections real calculation without hardcoded values."""
        adapter = TeleconnectionsAdapter(config=self.config)
        res = adapter.fetch_live_recent(days=5)
        self.assertTrue(res.success, f"Teleconnections fetch failed: {res.error_message}")
        records = res.data
        self.assertIsNotNone(records)
        self.assertGreaterEqual(len(records), 1)
        rec = records[-1]
        self.assertIn("enso_oni", rec)
        self.assertIn("iod_dmi", rec)
        self.assertIn("mjo_phase", rec)
        self.assertIn("mjo_amplitude", rec)
        if rec["mjo_phase"] is not None:
            self.assertIn(rec["mjo_phase"], range(1, 9))
        print(f"[OK] Teleconnections Real Ingestion: ONI={rec['enso_oni']}, IOD={rec['iod_dmi']}, MJO={rec['mjo_phase']}")


if __name__ == "__main__":
    unittest.main()
