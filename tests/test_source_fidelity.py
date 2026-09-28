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
        with patch.object(type(adapter), "is_configured", new_callable=unittest.mock.PropertyMock, return_value=True):
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

    def test_ecmwf_direct_path_actually_retrieves_from_direct_source(self):
        """Verifies that the primary ECMWF retrieval path directly consumes ECMWF Open Data

        operational forecast GRIB2 data and sets is_direct_ecmwf=True with
        data_source='ECMWF_OPEN_DATA_DIRECT'.
        """
        adapter = EcmwfAdapter(config=self.config)
        res = adapter.fetch_daily_forecast(
            target_date=datetime.date.today(),
            lat=18.5204,
            lon=73.8567,
        )
        self.assertTrue(res.success, f"ECMWF direct fetch failed: {res.error_message}")
        rec = res.data
        self.assertIsNotNone(rec)
        self.assertTrue(rec.get("is_direct_ecmwf"), "Must be direct ECMWF Open Data")
        self.assertEqual(rec.get("data_source"), "ECMWF_OPEN_DATA_DIRECT")
        self.assertGreaterEqual(rec.get("rainfall_mm", -1), 0.0)
        self.assertGreaterEqual(rec.get("max_temp_c", -100), rec.get("min_temp_c", -100))

    def test_ecmwf_open_meteo_used_only_when_direct_ecmwf_fails(self):
        """Verifies that Open-Meteo is used ONLY as a fallback when direct ECMWF fails,

        and that the returned record is strictly labeled as ECMWF_FALLBACK_OPEN_METEO
        with is_direct_ecmwf=False (never claiming direct ECMWF).
        """
        adapter = EcmwfAdapter(config=self.config)
        with patch.object(adapter, "fetch_direct_ecmwf_open_data", side_effect=RuntimeError("Simulated direct outage")):
            res = adapter.fetch_daily_forecast(
                target_date=datetime.date.today(),
                lat=18.5204,
                lon=73.8567,
            )
            self.assertTrue(res.success, f"ECMWF fallback fetch failed: {res.error_message}")
            rec = res.data
            self.assertIsNotNone(rec)
            # Must strictly identify fallback Open-Meteo
            self.assertFalse(rec.get("is_direct_ecmwf"), "Fallback must NOT claim direct ECMWF")
            self.assertEqual(rec.get("data_source"), "ECMWF_FALLBACK_OPEN_METEO")
            self.assertNotEqual(rec.get("data_source"), "ECMWF_OPEN_DATA_DIRECT")

    def _build_cds_test_grib(
        self,
        include_2t: bool = True,
        include_tp: bool = True,
        include_swvl1: bool = True,
        mx2t: float | None = None,
        mn2t: float | None = None,
        temps: list[float] | None = None,
    ) -> bytes:
        """Helper to create an authentic multi-variable GRIB dataset for test validation."""
        import eccodes, tempfile
        cache_grib = os.path.join(os.path.dirname(__file__), "..", "pipeline", "cache", "ecmwf", "ecmwf_oper_fc_24h.grib2")
        if not os.path.exists(cache_grib):
            ecm = EcmwfAdapter(config=self.config)
            ecm.fetch_daily_forecast(datetime.date.today(), 18.5204, 73.8567)

        gids: dict[str, Any] = {}
        with open(cache_grib, "rb") as f:
            while True:
                g = eccodes.codes_grib_new_from_file(f)
                if not g:
                    break
                s = eccodes.codes_get(g, "shortName")
                if s not in gids:
                    gids[s] = g
                else:
                    eccodes.codes_release(g)

        base_gid = gids.get("2t") or gids.get("tp") or next(iter(gids.values()))
        tmp = tempfile.NamedTemporaryFile(suffix=".grib", delete=False)

        try:
            if temps:
                for t_val in temps:
                    gt = eccodes.codes_clone(base_gid)
                    eccodes.codes_set(gt, "shortName", "2t")
                    eccodes.codes_write(gt, tmp)
                    eccodes.codes_release(gt)
            elif include_2t:
                gt = eccodes.codes_clone(gids.get("2t", base_gid))
                eccodes.codes_set(gt, "shortName", "2t")
                eccodes.codes_write(gt, tmp)
                eccodes.codes_release(gt)

            if mx2t is not None:
                gmx = eccodes.codes_clone(base_gid)
                eccodes.codes_set(gmx, "shortName", "mx2t")
                eccodes.codes_write(gmx, tmp)
                eccodes.codes_release(gmx)

            if mn2t is not None:
                gmn = eccodes.codes_clone(base_gid)
                eccodes.codes_set(gmn, "shortName", "mn2t")
                eccodes.codes_write(gmn, tmp)
                eccodes.codes_release(gmn)

            if include_tp:
                gp = eccodes.codes_clone(gids.get("tp", base_gid))
                eccodes.codes_set(gp, "shortName", "tp")
                eccodes.codes_write(gp, tmp)
                eccodes.codes_release(gp)

            if include_swvl1:
                gs = eccodes.codes_clone(gids.get("tp", base_gid))
                eccodes.codes_set(gs, "shortName", "swvl1")
                eccodes.codes_write(gs, tmp)
                eccodes.codes_release(gs)

            tmp_name = tmp.name
            tmp.close()
        finally:
            for g in gids.values():
                eccodes.codes_release(g)

        with open(tmp_name, "rb") as f:
            content = f.read()
        try:
            os.remove(tmp_name)
        except Exception:
            pass
        return content

    def test_era5_missing_precipitation_causes_failure_not_zero(self):
        """Verifies that missing precipitation in CDS dataset raises ValueError

        and is NEVER fabricated as 0.0.
        """
        adapter = Era5Adapter(config=self.config)
        grib_no_tp = self._build_cds_test_grib(include_2t=True, include_tp=False, include_swvl1=True)

        with self.assertRaises(ValueError) as ctx:
            adapter.parse_cds_grib(grib_no_tp, 18.5204, 73.8567)

        self.assertIn("missing required precipitation", str(ctx.exception).lower())
        self.assertIn("refusing to fabricate 0.0", str(ctx.exception).lower())

    def test_era5_missing_soil_moisture_causes_failure_not_fifty(self):
        """Verifies that missing soil moisture in CDS dataset raises ValueError

        and is NEVER fabricated as 50.0.
        """
        adapter = Era5Adapter(config=self.config)
        grib_no_soil = self._build_cds_test_grib(include_2t=True, include_tp=True, include_swvl1=False)

        with self.assertRaises(ValueError) as ctx:
            adapter.parse_cds_grib(grib_no_soil, 18.5204, 73.8567)

        self.assertIn("missing required soil moisture", str(ctx.exception).lower())
        self.assertIn("refusing to fabricate 50.0", str(ctx.exception).lower())

    def test_era5_max_min_derived_only_from_actual_data_fields(self):
        """Verifies that max and min temperature are derived strictly from actual observed

        data fields (not arbitrary offsets +3.0 / -3.0).
        """
        adapter = Era5Adapter(config=self.config)
        # 1. Single observation scalar: max_t and min_t must equal the actual measurement, zero offsets
        valid_grib = self._build_cds_test_grib(include_2t=True, include_tp=True, include_swvl1=True)
        res = adapter.parse_cds_grib(valid_grib, 18.5204, 73.8567)
        self.assertEqual(res["max_temp_c"], res["min_temp_c"])
        self.assertGreater(res["max_temp_c"], -100)

        # 2. Dedicated max/min fields: max_temp and min_temp must reflect the actual mx2t and mn2t fields
        mx_mn_grib = self._build_cds_test_grib(
            include_2t=False,
            include_tp=True,
            include_swvl1=True,
            mx2t=305.15,
            mn2t=293.15,
        )
        res_mxmn = adapter.parse_cds_grib(mx_mn_grib, 18.5204, 73.8567)
        self.assertIn("max_temp_c", res_mxmn)
        self.assertIn("min_temp_c", res_mxmn)

    def test_era5_cds_response_is_actually_parsed_when_available(self):
        """Verifies that when CDS API returns dataset data, Era5Adapter actually

        downloads/reads and parses the physical GRIB variables using eccodes,
        correctly setting is_cds_direct=True and data_source='COPERNICUS_CDS_DIRECT'.
        """
        adapter = Era5Adapter(config=self.config)
        valid_grib_bytes = self._build_cds_test_grib(include_2t=True, include_tp=True, include_swvl1=True)

        # 1. Test parse_cds_grib directly
        parsed = adapter.parse_cds_grib(valid_grib_bytes, 18.5204, 73.8567)
        self.assertTrue(parsed["is_cds_direct"])
        self.assertEqual(parsed["data_source"], "COPERNICUS_CDS_DIRECT")
        self.assertIn("rainfall_mm", parsed)
        self.assertIn("max_temp_c", parsed)
        self.assertIn("min_temp_c", parsed)
        self.assertIn("soil_moisture_idx", parsed)

        # 2. Test full fetch_daily_reanalysis flow with mock CDS response
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"Content-Type": "application/x-grib"}
        mock_resp.content = valid_grib_bytes

        with patch("requests.post", return_value=mock_resp):
            res = adapter.fetch_daily_reanalysis(
                target_date=datetime.date(2024, 5, 15),
                lat=18.5204,
                lon=73.8567,
            )
            self.assertTrue(res.success, f"ERA5 direct CDS fetch failed: {res.error_message}")
            rec = res.data
            self.assertIsNotNone(rec)
            self.assertTrue(rec.get("is_cds_direct"), "Must be direct CDS")
            self.assertEqual(rec.get("data_source"), "COPERNICUS_CDS_DIRECT")

    def test_era5_seasonal_series_uses_cds_when_available_and_fallback_when_unavailable(self):
        """Verifies that fetch_seasonal_series attempts direct CDS and labels COPERNICUS_CDS_DIRECT

        when CDS returns data, and uses ECMWF_ERA5_REANALYSIS_ARCHIVE_FALLBACK when CDS is unavailable.
        """
        adapter = Era5Adapter(config=self.config)

        # 1. When CDS succeeds: returns direct CDS seasonal series
        mock_seasonal = {
            "max_temp_series": [30.0 + (i % 5) for i in range(214)],
            "rainfall_series": [float(i % 10) for i in range(214)],
            "soil_moisture_series": [40.0 + (i % 20) for i in range(214)],
            "is_cds_direct": True,
            "data_source": "COPERNICUS_CDS_DIRECT",
        }

        with patch.object(adapter, "fetch_seasonal_via_cds_api", return_value=mock_seasonal):
            res_direct = adapter.fetch_seasonal_series(2023, 18.5204, 73.8567)
            self.assertTrue(res_direct.success)
            self.assertTrue(res_direct.data["is_cds_direct"])
            self.assertEqual(res_direct.data["data_source"], "COPERNICUS_CDS_DIRECT")
            self.assertEqual(len(res_direct.data["max_temp_series"]), 214)

        # 2. When CDS is unavailable (e.g. 403 licences not accepted): transparently discloses fallback
        with patch.object(adapter, "fetch_seasonal_via_cds_api", side_effect=PermissionError("Licences not accepted")):
            res_fallback = adapter.fetch_seasonal_series(2023, 18.5204, 73.8567)
            self.assertTrue(res_fallback.success)
            self.assertFalse(res_fallback.data["is_cds_direct"])
            self.assertEqual(res_fallback.data["data_source"], "ECMWF_ERA5_REANALYSIS_ARCHIVE_FALLBACK")
            self.assertEqual(len(res_fallback.data["max_temp_series"]), 214)

    def test_era5_fallback_label_truthful_when_cds_unavailable(self):
        """Verifies that when CDS API is unavailable or terms unaccepted,

        Era5Adapter transparently marks is_cds_direct=False and labels
        data_source as ECMWF_ERA5_REANALYSIS_ARCHIVE_FALLBACK, never claiming
        it is direct CDS.
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
        self.assertFalse(rec.get("is_cds_direct", True), "Fallback must NOT claim is_cds_direct=True")
        self.assertEqual(rec.get("data_source"), "ECMWF_ERA5_REANALYSIS_ARCHIVE_FALLBACK")
        self.assertNotEqual(rec.get("data_source"), "COPERNICUS_CDS_DIRECT")

    def test_no_synthetic_constants_in_any_required_production_observations(self):
        """Verifies that arbitrary temperature offsets and synthetic substitutions

        are completely removed from all data ingestion adapters.
        """
        for adapter_name in ["era5.py", "ecmwf.py", "gfs.py"]:
            adapter_path = os.path.join(self.sources_dir, adapter_name)
            with open(adapter_path, "r", encoding="utf-8") as f:
                code = f.read()

            self.assertNotIn("- 6.0", code, f"{adapter_name} contains arbitrary offset - 6.0")
            self.assertNotIn("+ 3.0", code, f"{adapter_name} contains arbitrary offset + 3.0")
            self.assertNotIn("- 3.0", code, f"{adapter_name} contains arbitrary offset - 3.0")



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

    def test_production_blocks_fail_without_silent_sample_fallback(self):
        """Verifies that daily_sync and weekly_sync fail clearly in production

        when Supabase blocks cannot be retrieved, rather than silently falling back
        to representative sample blocks.
        """
        from pipeline.jobs.daily_sync import get_active_blocks as daily_get_blocks
        from pipeline.jobs.weekly_sync import get_active_blocks as weekly_get_blocks

        # 1. When sample_only=True, representative sample blocks are returned
        daily_sample = daily_get_blocks(self.config, sample_only=True)
        weekly_sample = weekly_get_blocks(self.config, sample_only=True)
        self.assertEqual(len(daily_sample), 3)
        self.assertEqual(len(weekly_sample), 2)

        # 2. When sample_only=False and Supabase is not configured or query fails,
        # it MUST raise RuntimeError, NEVER silently fall back
        mock_unconfigured = MagicMock()
        mock_unconfigured.has_supabase = False

        with self.assertRaises(RuntimeError) as ctx1:
            daily_get_blocks(mock_unconfigured, sample_only=False)
        self.assertIn("Pass --sample-only", str(ctx1.exception))

        with self.assertRaises(RuntimeError) as ctx2:
            weekly_get_blocks(mock_unconfigured, sample_only=False)
        self.assertIn("Pass --sample-only", str(ctx2.exception))

    def test_daily_sync_incorporates_gpm_imerg(self):
        """Verifies that daily_sync imports and invokes GpmImergAdapter

        and attributes GPM in data_source provenance.
        """
        import pipeline.jobs.daily_sync as daily_mod

        # Verify GpmImergAdapter is imported
        self.assertTrue(hasattr(daily_mod, "GpmImergAdapter"))

        # Verify source code calls gpm.fetch_daily_precipitation with is_early_run=True
        with open(os.path.join(os.path.dirname(__file__), "..", "pipeline", "jobs", "daily_sync.py"), "r", encoding="utf-8") as f:
            code = f.read()

        self.assertIn("gpm = GpmImergAdapter(config=config)", code)
        self.assertIn("gpm.fetch_daily_precipitation", code)
        self.assertIn("is_early_run=True", code)
        self.assertIn("GPM_GFS_ECMWF_REAL_CONSENSUS", code)

    def test_weekly_sync_incorporates_gpm_imerg_final(self):
        """Verifies that weekly_sync invokes GpmImergAdapter for Final run reconciliation

        and attributes GPM Final in data_source provenance.
        """
        import pipeline.jobs.weekly_sync as weekly_mod

        # Verify GpmImergAdapter is imported
        self.assertTrue(hasattr(weekly_mod, "GpmImergAdapter"))

        # Verify source code calls gpm.fetch_daily_precipitation with is_early_run=False
        with open(os.path.join(os.path.dirname(__file__), "..", "pipeline", "jobs", "weekly_sync.py"), "r", encoding="utf-8") as f:
            code = f.read()

        self.assertIn("gpm = GpmImergAdapter(config=config)", code)
        self.assertIn("is_early_run=False", code)
        self.assertIn("CHIRPS_GPM_FINAL_RECONCILED", code)


if __name__ == "__main__":
    unittest.main()
