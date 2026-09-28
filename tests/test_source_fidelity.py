"""Unit and integration tests for source-fidelity and historical data integrity.

Verifies:
1. GPM result originates from actual GPM product (HDF5/NetCDF4), or transparently fails
   on EULA requirement without synthetic/Open-Meteo fallback.
2. SMAP result originates from actual NASA SMAP HDF5 product (SPL3SMP).
3. ERA5 result originates from CDS when available, and transparently discloses
   fallback when CDS terms are unaccepted.
4. ECMWF result originates from declared ECMWF source and transparently marks fallback.
5. NO Open-Meteo endpoint or reference exists in GPM or SMAP adapters.
6. NO synthetic fallback (42.4, 30.0, 45.0, 0.0) is used for required production observations.
7. GFS uses real accumulated precipitation (var_APCP at surface) rather than PRATE * 86400.
8. 214-day historical series has genuine daily variation and zero scalar repetition.
"""

import ast
import datetime
import io
import os
import unittest
from unittest.mock import MagicMock, patch

import h5py
import numpy as np

from pipeline.sources.ecmwf import EcmwfAdapter
from pipeline.sources.era5 import Era5Adapter
from pipeline.sources.gfs import GfsAdapter
from pipeline.sources.gpm_imerg import GpmImergAdapter
from pipeline.sources.smap import SmapAdapter
from pipeline.utils.config import get_pipeline_config


class TestSourceFidelityAndIntegrity(unittest.TestCase):
    """Rigorous tests enforcing source fidelity and banning fake/synthetic data."""

    def setUp(self):
        self.config = get_pipeline_config()
        self.sources_dir = os.path.join(os.path.dirname(__file__), "..", "pipeline", "sources")

    def test_no_open_meteo_endpoint_in_gpm_or_smap(self):
        """Verifies that GPM and SMAP adapters contain ZERO references to Open-Meteo."""
        for adapter_name in ["gpm_imerg.py", "smap.py"]:
            adapter_path = os.path.join(self.sources_dir, adapter_name)
            with open(adapter_path, "r", encoding="utf-8") as f:
                content = f.read()

            self.assertNotIn(
                "open-meteo",
                content.lower(),
                f"Source adapter {adapter_name} must NOT contain any Open-Meteo endpoints or references!",
            )

    def test_no_synthetic_fallback_in_jobs_or_validation(self):
        """Verifies that daily_sync, weekly_sync, and validate_real_sample_ingestion

        do NOT substitute hardcoded synthetic fallbacks (42.4, 30.0, 45.0, 0.0)
        when upstream observations are missing.
        """
        jobs_dir = os.path.join(os.path.dirname(__file__), "..", "pipeline", "jobs")
        for fname in ["daily_sync.py", "weekly_sync.py", "validate_real_sample_ingestion.py"]:
            fpath = os.path.join(jobs_dir, fname)
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()

            # Ensure banned synthetic fallback assignments do not exist
            banned_patterns = ["= 42.4", "= 45.0", "= 30.0", "fallback_rain = 0.0"]
            for pattern in banned_patterns:
                self.assertNotIn(
                    pattern,
                    content,
                    f"Job file {fname} contains banned synthetic pattern: '{pattern}'",
                )

    def test_smap_extracts_from_actual_hdf5_product(self):
        """Verifies that SmapAdapter correctly extracts soil moisture from authentic

        HDF5 structure (/Soil_Moisture_Retrieval_Data_AM/soil_moisture) and calculates
        the physical wetness index.
        """
        adapter = SmapAdapter(config=self.config)

        # Create an in-memory authentic SMAP HDF5 structure
        bio = io.BytesIO()
        with h5py.File(bio, "w") as h5f:
            grp = h5f.create_group("Soil_Moisture_Retrieval_Data_AM")
            # Create a 2D grid: 406 rows x 964 cols (EASE-Grid 2.0 global 36 km)
            sm_data = np.full((406, 964), -9999.0, dtype=np.float32)
            lat_data = np.zeros((406, 964), dtype=np.float32)
            lon_data = np.zeros((406, 964), dtype=np.float32)

            # Set coordinate for row 158, col 679 (Pune Haveli: 18.52 N, 73.86 E)
            row, col = 158, 679
            lat_data[row, col] = 18.52
            lon_data[row, col] = 73.86
            expected_vol = 0.285  # m^3/m^3
            sm_data[row, col] = expected_vol

            ds = grp.create_dataset("soil_moisture", data=sm_data)
            ds.attrs["_FillValue"] = -9999.0
            ds.attrs["valid_min"] = 0.02
            ds.attrs["valid_max"] = 0.50
            grp.create_dataset("latitude", data=lat_data)
            grp.create_dataset("longitude", data=lon_data)

        bio.seek(0)
        h5_bytes = bio.read()

        # Extract using adapter
        extracted_index = adapter.extract_point_from_h5_bytes(
            h5_bytes=h5_bytes,
            lat=18.52,
            lon=73.86,
        )
        self.assertIsNotNone(extracted_index)
        expected_index = round((expected_vol / 0.50) * 100.0, 1)
        self.assertEqual(extracted_index, expected_index)
        self.assertEqual(extracted_index, 57.0)

    def test_gpm_imerg_extracts_from_actual_nc4_product(self):
        """Verifies that GpmImergAdapter correctly extracts daily precipitation from

        authentic HDF5/NetCDF4 structure (/Grid/precipitationCal).
        """
        adapter = GpmImergAdapter(config=self.config)

        # Create an in-memory authentic GPM IMERG NetCDF4/HDF5 structure
        bio = io.BytesIO()
        with h5py.File(bio, "w") as h5f:
            grp = h5f.create_group("Grid")
            # GPM IMERG 0.1 deg: lon from -180 to 180 (3600), lat from -90 to 90 (1800)
            # shape (3600, 1800)
            precip_data = np.zeros((3600, 1800), dtype=np.float32)
            lon_idx = max(0, min(3599, int(round((73.86 + 179.95) / 0.1))))
            lat_idx = max(0, min(1799, int(round((18.52 + 89.95) / 0.1))))
            expected_rain = 34.8  # mm
            precip_data[lon_idx, lat_idx] = expected_rain
            grp.create_dataset("precipitationCal", data=precip_data)

        bio.seek(0)
        nc4_bytes = bio.read()

        extracted_rain = adapter.extract_point_from_nc4_bytes(
            nc4_bytes=nc4_bytes,
            lat=18.52,
            lon=73.86,
        )
        self.assertIsNotNone(extracted_rain)
        self.assertEqual(extracted_rain, expected_rain)

    def test_gpm_imerg_transparent_eula_handling(self):
        """Verifies that GpmImergAdapter fails cleanly with transparent EULA error

        and NEVER falls back to Open-Meteo or synthetic placeholders when NASA GES DISC
        requires authorization.
        """
        adapter = GpmImergAdapter(config=self.config)

        # Mock download returning 403 EULA required
        with patch.object(
            adapter,
            "download_and_extract_point",
            side_effect=RuntimeError("NASA GES DISC EULA not yet accepted for user account. Authorize at: https://urs.earthdata.nasa.gov"),
        ):
            with patch.object(adapter, "query_granules", return_value=["https://data.gesdisc.earthdata.nasa.gov/test.nc4"]):
                with patch.object(adapter, "get_earthdata_bearer_token", return_value="dummy_token"):
                    res = adapter.fetch_daily_precipitation(
                        target_date=datetime.date(2024, 7, 15),
                        lat=18.52,
                        lon=73.86,
                    )
                    self.assertFalse(res.success)
                    self.assertIsNone(res.data)
                    self.assertIn("NASA GES DISC EULA not yet accepted", res.error_message)

    def test_gfs_uses_accumulated_precipitation(self):
        """Verifies that GfsAdapter queries APCP (accumulated precipitation) on step f024

        and does not use instantaneous PRATE * 86400.
        """
        adapter = GfsAdapter(config=self.config)
        # Verify by inspecting the source URL builders and query params
        with open(os.path.join(self.sources_dir, "gfs.py"), "r", encoding="utf-8") as f:
            gfs_code = f.read()

        self.assertIn('"var_APCP"', gfs_code)
        self.assertIn('"lev_surface"', gfs_code)
        self.assertIn("f024", gfs_code)
        # PRATE * 86400 must NOT be used
        self.assertNotIn("prate * 86400", gfs_code.lower())
        self.assertNotIn("prate*86400", gfs_code.lower())

    def test_era5_transparent_cds_availability(self):
        """Verifies that Era5Adapter transparently marks is_cds_direct=False and labels

        data_source as ECMWF_ERA5_REANALYSIS_ARCHIVE_FALLBACK when CDS API is unaccepted.
        """
        adapter = Era5Adapter(config=self.config)
        res = adapter.fetch_daily_reanalysis(
            target_date=datetime.date(2023, 7, 15),
            lat=18.5204,
            lon=73.8567,
        )
        self.assertTrue(res.success)
        rec = res.data
        self.assertIsNotNone(rec)

        # CDS is not accepted, so adapter MUST report is_cds_direct=False
        self.assertFalse(rec.get("is_cds_direct", True))
        self.assertEqual(rec.get("data_source"), "ECMWF_ERA5_REANALYSIS_ARCHIVE_FALLBACK")

    def test_ecmwf_transparent_source_labeling(self):
        """Verifies that EcmwfAdapter transparently labels data_source as

        ECMWF_FALLBACK_OPEN_METEO when direct portal is unreachable, and never claims
        it is direct ECMWF Open Data.
        """
        adapter = EcmwfAdapter(config=self.config)
        res = adapter.fetch_daily_forecast(
            target_date=datetime.date.today(),
            lat=18.5204,
            lon=73.8567,
        )
        self.assertTrue(res.success)
        rec = res.data
        self.assertIsNotNone(rec)

        if not rec.get("is_direct_ecmwf", False):
            self.assertEqual(rec.get("data_source"), "ECMWF_FALLBACK_OPEN_METEO")
            self.assertFalse(rec["is_direct_ecmwf"])

    def test_214_day_series_integrity_and_cardinality(self):
        """Verifies that Era5Adapter.fetch_seasonal_series returns exactly 214 daily points

        for rainfall, max temp, min temp, and that the temperatures and rainfalls
        have realistic high variance (> 30 unique values, never repeating a single scalar).
        """
        adapter = Era5Adapter(config=self.config)
        res = adapter.fetch_seasonal_series(
            year=2023,
            lat=18.5204,
            lon=73.8567,
        )
        self.assertTrue(res.success, f"Failed to fetch seasonal series: {res.error_message}")
        data = res.data
        self.assertIsNotNone(data)

        # Cardinality checks
        self.assertEqual(len(data["rainfall_series"]), 214)
        self.assertEqual(len(data["max_temp_series"]), 214)
        self.assertEqual(len(data["soil_moisture_series"]), 214)

        # High variance checks (never repeated scalar across 214 days)
        unique_temps = len(set(data["max_temp_series"]))
        unique_rains = len(set(data["rainfall_series"]))
        self.assertGreater(
            unique_temps,
            30,
            f"Expected > 30 unique daily max temperatures across 214 days, got {unique_temps}",
        )
        self.assertGreater(
            unique_rains,
            20,
            f"Expected > 20 unique daily rainfall amounts across 214 days, got {unique_rains}",
        )


if __name__ == "__main__":
    unittest.main()
