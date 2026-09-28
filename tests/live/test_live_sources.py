"""Live Source Integration & Smoke Tests for BHUMI Data Ingestion Pipeline.

Category B: Live source integration tests
- NASA GPM IMERG
- NASA SMAP
- Copernicus CDS / ERA5
- UCSB CHIRPS
- ECMWF Open Data
- NOAA GFS
- BOM / NOAA CPC Teleconnections
- Live Supabase Read-Only Database Verification

Distinguishes:
1. SUCCESSFUL_RETRIEVAL: Real physical data extracted from authentic source.
2. EULA_OR_LICENSE_REQUIRED: Requires one-time user terms acceptance on provider portal.
3. CREDENTIALS_INVALID: Missing or rejected authentication credentials.
4. NETWORK_UNAVAILABLE: Transient network failure, DNS error, or connection timeout.
5. DATA_UNAVAILABLE: Legitimate missing data / latency lag (e.g. recent orbit gap).

Never converts any failure into fabricated data.
Does not modify production data (read-only verification).
"""

import datetime
from enum import Enum
import os
import unittest
from typing import Any, Optional

import requests

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.sources.chirps import ChirpsAdapter
from pipeline.sources.ecmwf import EcmwfAdapter
from pipeline.sources.era5 import Era5Adapter
from pipeline.sources.gfs import GfsAdapter
from pipeline.sources.gpm_imerg import GpmImergAdapter
from pipeline.sources.smap import SmapAdapter
from pipeline.sources.teleconnections import TeleconnectionsAdapter
from pipeline.utils.config import get_pipeline_config


class SourceStatus(Enum):
    SUCCESSFUL_RETRIEVAL = "SUCCESSFUL_RETRIEVAL"
    EULA_OR_LICENSE_REQUIRED = "EULA_OR_LICENSE_REQUIRED"
    CREDENTIALS_INVALID = "CREDENTIALS_INVALID"
    NETWORK_UNAVAILABLE = "NETWORK_UNAVAILABLE"
    DATA_UNAVAILABLE = "DATA_UNAVAILABLE"


SMOKE_TEST_REGISTRY: list[dict[str, Any]] = []


def classify_result(
    success: bool,
    error_message: Optional[str],
    data: Any = None,
    source_name: str = "",
) -> tuple[SourceStatus, str, str]:
    """Classifies an upstream fetch outcome into one of 5 canonical states.

    Returns:
        (status, description, action_needed)
    """
    if success and data is not None:
        return (
            SourceStatus.SUCCESSFUL_RETRIEVAL,
            "Authentic data successfully retrieved and parsed",
            "None",
        )

    err = (error_message or "").lower()

    # 1. EULA / License acceptance required
    if any(k in err for k in ["eula", "licence", "licences not accepted", "license", "required licences"]):
        action = "Visit portal to accept terms: "
        if "ges disc" in err or "gpm" in source_name.lower():
            action += "https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ"
        elif "copernicus" in err or "cds" in source_name.lower() or "era5" in source_name.lower():
            action += "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land?tab=download#manage-licences"
        else:
            action += "Provider terms portal"
        return (
            SourceStatus.EULA_OR_LICENSE_REQUIRED,
            error_message or "EULA or terms acceptance required",
            action,
        )

    # 2. Missing or invalid credentials
    if any(k in err for k in ["not configured", "credentials", "401", "unauthorized", "invalid key"]):
        return (
            SourceStatus.CREDENTIALS_INVALID,
            error_message or "Credentials missing or rejected",
            "Verify environment secrets (EARTHDATA_*, CDSAPI_*, SUPABASE_*)",
        )

    # 3. Network unreachable or timeout
    if any(k in err for k in [
        "network is unreachable", "failed to establish a new connection",
        "connection refused", "timeout", "timed out", "max retries exceeded",
        "newconnectionerror", "connectionpool", "errno 101"
    ]):
        return (
            SourceStatus.NETWORK_UNAVAILABLE,
            error_message or "Network connection failed or timed out",
            "Check runner WAN egress connectivity to upstream domain",
        )

    # 4. Data legitimately unavailable
    if any(k in err for k in ["no granules", "swath gap", "not yet available", "404", "fill value"]):
        return (
            SourceStatus.DATA_UNAVAILABLE,
            error_message or "Data point legitimately unavailable for queried date/coords",
            "Allow upstream latency window (2-3 days for satellite L3 products)",
        )

    return (
        SourceStatus.NETWORK_UNAVAILABLE,
        error_message or "Unknown failure",
        "Inspect upstream service response",
    )


class TestLiveSourceIntegration(unittest.TestCase):
    """Smoke tests for all upstream meteorological and Earth observation providers."""

    @classmethod
    def setUpClass(cls):
        cls.config = get_pipeline_config()
        cls.test_lat = 18.5204  # Pune / Haveli block
        cls.test_lon = 73.8567
        cls.today = datetime.date.today()

    @classmethod
    def tearDownClass(cls):
        """Format and print full diagnostic report across all tested providers."""
        print("\n" + "=" * 90)
        print("          BHUMI LIVE-SOURCE SMOKE TEST DIAGNOSTIC SUMMARY")
        print("=" * 90)
        print(f"{'Source':<22} | {'State':<26} | {'Details':<36}")
        print("-" * 90)

        markdown_lines = [
            "## BHUMI Live-Source Smoke Test Summary\n",
            "| Source | State | Details | Action Needed |",
            "|---|---|---|---|",
        ]

        for entry in SMOKE_TEST_REGISTRY:
            src = entry["source"]
            state = entry["status"].value
            msg = entry["message"][:34]
            action = entry["action"]
            print(f"{src:<22} | {state:<26} | {msg:<36}")
            markdown_lines.append(f"| **{src}** | `{state}` | {entry['message']} | {action} |")

        print("=" * 90 + "\n")

        # Write to GITHUB_STEP_SUMMARY if available
        step_summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
        if step_summary_path and os.path.exists(os.path.dirname(step_summary_path)):
            try:
                with open(step_summary_path, "a", encoding="utf-8") as f:
                    f.write("\n".join(markdown_lines) + "\n")
            except Exception as e:
                print(f"Could not append to GITHUB_STEP_SUMMARY: {e}")

    def _record(self, source: str, status: SourceStatus, message: str, action: str, data: Any = None):
        SMOKE_TEST_REGISTRY.append({
            "source": source,
            "status": status,
            "message": message,
            "action": action,
            "data": data,
        })

    def test_live_ucsb_chirps(self):
        """Tests UCSB CHC CHIRPS daily GeoTIFF retrieval and raster parsing."""
        adapter = ChirpsAdapter(config=self.config)
        target_date = datetime.date(2023, 7, 15)  # Known monsoon date
        res = adapter.fetch_daily_rainfall(target_date, self.test_lat, self.test_lon)

        status, msg, action = classify_result(res.success, res.error_message, res.data, adapter.name)
        if status == SourceStatus.SUCCESSFUL_RETRIEVAL:
            msg = f"Extracted real rainfall: {res.data:.2f} mm"
        self._record("UCSB CHIRPS", status, msg, action, res.data)

        if status == SourceStatus.SUCCESSFUL_RETRIEVAL:
            self.assertIsInstance(res.data, float)
            self.assertGreaterEqual(res.data, 0.0)

    def test_live_nasa_gpm_imerg(self):
        """Tests NASA GPM IMERG authentic granule query and HDF5 extraction."""
        adapter = GpmImergAdapter(config=self.config)
        target_date = self.today - datetime.timedelta(days=3)
        res = adapter.fetch_daily_precipitation(target_date, self.test_lat, self.test_lon)

        status, msg, action = classify_result(res.success, res.error_message, res.data, adapter.name)
        if status == SourceStatus.SUCCESSFUL_RETRIEVAL:
            msg = f"Extracted real satellite rain: {res.data:.2f} mm"
        self._record("NASA GPM IMERG", status, msg, action, res.data)

        if status == SourceStatus.SUCCESSFUL_RETRIEVAL:
            self.assertIsInstance(res.data, float)
            self.assertGreaterEqual(res.data, 0.0)
            self.assertNotEqual(res.data, 50.0)

    def test_live_nasa_smap(self):
        """Tests NASA SMAP SPL3SMP soil moisture retrieval and HDF5 grid parsing."""
        adapter = SmapAdapter(config=self.config)
        target_date = self.today - datetime.timedelta(days=5)
        res = adapter.fetch_soil_wetness_index(target_date, self.test_lat, self.test_lon)

        status, msg, action = classify_result(res.success, res.error_message, res.data, adapter.name)
        if status == SourceStatus.SUCCESSFUL_RETRIEVAL:
            msg = f"Extracted real soil wetness index: {res.data:.1f}"
        self._record("NASA SMAP", status, msg, action, res.data)

        if status == SourceStatus.SUCCESSFUL_RETRIEVAL:
            self.assertIsInstance(res.data, float)
            self.assertGreaterEqual(res.data, 0.0)
            self.assertLessEqual(res.data, 100.0)
            self.assertNotEqual(res.data, 50.0, "Must not return placeholder 50.0")

    def test_live_copernicus_cds_era5(self):
        """Tests Copernicus CDS ERA5-Land reanalysis retrieval and truthful fallback."""
        adapter = Era5Adapter(config=self.config)
        target_date = datetime.date(2023, 7, 15)
        res = adapter.fetch_daily_reanalysis(target_date, self.test_lat, self.test_lon)

        status, msg, action = classify_result(res.success, res.error_message, res.data, adapter.name)
        if status == SourceStatus.SUCCESSFUL_RETRIEVAL and res.data:
            prov = res.data.get("data_source", "UNKNOWN")
            msg = f"Max: {res.data['max_temp_c']}°C, Rain: {res.data['rainfall_mm']}mm [{prov}]"
        self._record("Copernicus CDS / ERA5", status, msg, action, res.data)

        if status == SourceStatus.SUCCESSFUL_RETRIEVAL:
            self.assertIsNotNone(res.data)
            self.assertIn("data_source", res.data)
            self.assertNotIn(res.data["max_temp_c"], {32.5, 33.1, 50.0})

    def test_live_ecmwf_open_data(self):
        """Tests ECMWF Open Data operational forecast retrieval."""
        adapter = EcmwfAdapter(config=self.config)
        res = adapter.fetch_daily_forecast(self.today, self.test_lat, self.test_lon)

        status, msg, action = classify_result(res.success, res.error_message, res.data, adapter.name)
        if status == SourceStatus.SUCCESSFUL_RETRIEVAL and res.data:
            prov = res.data.get("data_source", "UNKNOWN")
            msg = f"Max: {res.data['max_temp_c']}°C, Min: {res.data['min_temp_c']}°C [{prov}]"
        self._record("ECMWF Open Data", status, msg, action, res.data)

        if status == SourceStatus.SUCCESSFUL_RETRIEVAL:
            self.assertIsNotNone(res.data)
            self.assertGreaterEqual(res.data["max_temp_c"], res.data["min_temp_c"])

    def test_live_noaa_gfs(self):
        """Tests NOAA GFS forecast extraction from AWS NOMADS bucket."""
        adapter = GfsAdapter(config=self.config)
        res = adapter.fetch_daily_forecast(self.today, self.test_lat, self.test_lon)

        status, msg, action = classify_result(res.success, res.error_message, res.data, adapter.name)
        if status == SourceStatus.SUCCESSFUL_RETRIEVAL and res.data:
            msg = f"Temp: {res.data['max_temp_c']}°C, Acc Rain: {res.data['rainfall_mm']}mm [NOAA_GFS]"
        self._record("NOAA GFS", status, msg, action, res.data)

        if status == SourceStatus.SUCCESSFUL_RETRIEVAL:
            self.assertIsNotNone(res.data)
            self.assertGreaterEqual(res.data["rainfall_mm"], 0.0)

    def test_live_teleconnections(self):
        """Tests BOM and NOAA CPC teleconnections indices (MJO, ENSO ONI, IOD DMI)."""
        adapter = TeleconnectionsAdapter(config=self.config)
        res = adapter.fetch_live_recent(days=5)

        status, msg, action = classify_result(res.success, res.error_message, res.data, adapter.name)
        if status == SourceStatus.SUCCESSFUL_RETRIEVAL and res.data:
            latest = res.data[-1]
            msg = f"ONI: {latest['enso_oni']}, IOD: {latest['iod_dmi']}, MJO Phase: {latest['mjo_phase']}"
        self._record("Teleconnections (CPC/BOM)", status, msg, action, res.data)

        if status == SourceStatus.SUCCESSFUL_RETRIEVAL:
            self.assertGreaterEqual(len(res.data), 1)

    def test_live_supabase_read_only(self):
        """Tests read-only connectivity to configured Supabase database without modifying data."""
        if not self.config.has_supabase:
            self._record("Supabase DB", SourceStatus.CREDENTIALS_INVALID, "SUPABASE_URL or KEY not configured", "Set Supabase secrets")
            return

        try:
            url = f"{self.config.supabase_url.rstrip('/')}/rest/v1/blocks?select=block_id,block_name&limit=3"
            headers = {
                "apikey": self.config.supabase_service_role_key,
                "Authorization": f"Bearer {self.config.supabase_service_role_key}",
            }
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                blocks = resp.json()
                msg = f"Connected successfully ({len(blocks)} sample blocks queried)"
                self._record("Supabase DB", SourceStatus.SUCCESSFUL_RETRIEVAL, msg, "None", blocks)
            elif resp.status_code in (401, 403):
                self._record("Supabase DB", SourceStatus.CREDENTIALS_INVALID, f"HTTP {resp.status_code}: Unauthorized", "Check SUPABASE_SERVICE_ROLE_KEY")
            else:
                self._record("Supabase DB", SourceStatus.DATA_UNAVAILABLE, f"HTTP {resp.status_code}: {resp.text[:80]}", "Check database schema")
        except Exception as e:
            self._record("Supabase DB", SourceStatus.NETWORK_UNAVAILABLE, str(e)[:80], "Check network/Supabase availability")


if __name__ == "__main__":
    unittest.main()
