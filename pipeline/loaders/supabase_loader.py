"""Supabase database loader for the BHUMI data pipeline.

Performs idempotent batch upserts to Supabase PostgreSQL + PostGIS via the REST API.
Enforces the 500 MB budget constraints, chunked batching, duplicate prevention,
and dry-run test modes.
"""

from __future__ import annotations

import time
from typing import Any, Optional

import requests
from pipeline.transforms.spatial import assert_no_panchayat_storage
from pipeline.utils.config import PipelineConfig, get_pipeline_config
from pipeline.utils.logger import get_logger
from pipeline.utils.validation import (
    validate_live_prediction,
    validate_live_weather_buffer,
    validate_seasonal_archive,
    validate_teleconnection_record,
)


class SupabaseLoader:
    """Idempotent database loader for BHUMI tables."""

    def __init__(
        self,
        config: Optional[PipelineConfig] = None,
        dry_run: bool = False,
    ) -> None:
        self.config = config or get_pipeline_config()
        self.dry_run = dry_run
        self.logger = get_logger("bhumi.loaders.supabase")

        if not self.config.has_supabase and not self.dry_run:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured")

    def _get_headers(self) -> dict[str, str]:
        """Generate authenticated headers with PostgREST upsert preference."""
        return {
            "apikey": self.config.supabase_service_role_key,
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        }

    def _execute_upsert(
        self,
        table_name: str,
        records: list[dict[str, Any]],
        batch_size: Optional[int] = None,
    ) -> int:
        """Execute a chunked batch upsert against a PostgREST endpoint."""
        assert_no_panchayat_storage(table_name)

        if not records:
            self.logger.info(f"No records to load into {table_name}")
            return 0

        chunk_size = batch_size or self.config.batch_size
        total_loaded = 0
        total_chunks = (len(records) + chunk_size - 1) // chunk_size

        conflict_targets = {
            "blocks": "block_id",
            "seasonal_archives": "block_id,season_year",
            "live_weather_buffer": "block_id,observation_date",
            "teleconnections_history": "observation_date",
            "live_predictions": "block_id,prediction_date,lead_time_bucket",
        }
        conflict_col = conflict_targets.get(table_name)
        query_param = f"?on_conflict={conflict_col}" if conflict_col else ""
        endpoint = f"{self.config.supabase_url.rstrip('/')}/rest/v1/{table_name}{query_param}"
        self.logger.info(
            f"Loading {len(records)} records into public.{table_name} "
            f"in {total_chunks} chunks (dry_run={self.dry_run})"
        )

        if self.dry_run:
            self.logger.info(f"[DRY-RUN] Simulated upsert of {len(records)} records into {table_name}")
            return len(records)

        headers = self._get_headers()
        for idx in range(0, len(records), chunk_size):
            chunk = records[idx : idx + chunk_size]
            chunk_num = (idx // chunk_size) + 1

            for attempt in range(1, self.config.max_retries + 1):
                try:
                    resp = requests.post(
                        endpoint,
                        headers=headers,
                        json=chunk,
                        timeout=self.config.request_timeout_seconds,
                    )
                    if resp.status_code in (200, 201, 204):
                        total_loaded += len(chunk)
                        self.logger.debug(
                            f"Chunk {chunk_num}/{total_chunks} ({len(chunk)} records) loaded into {table_name}"
                        )
                        break
                    else:
                        err_text = resp.text[:200]
                        raise requests.RequestException(
                            f"HTTP {resp.status_code} from PostgREST: {err_text}"
                        )
                except requests.RequestException as e:
                    if attempt == self.config.max_retries:
                        self.logger.error(
                            f"Failed chunk {chunk_num}/{total_chunks} into {table_name} after {self.config.max_retries} attempts: {e}"
                        )
                        raise
                    sleep_time = self.config.retry_backoff_factor ** attempt
                    self.logger.warning(
                        f"Chunk {chunk_num} attempt {attempt} failed ({e}). Retrying in {sleep_time:.1f}s..."
                    )
                    time.sleep(sleep_time)

        self.logger.info(f"Successfully upserted {total_loaded} records into public.{table_name}")
        return total_loaded

    def load_blocks(self, blocks: list[dict[str, Any]]) -> int:
        """Upsert administrative block records into public.blocks."""
        return self._execute_upsert("blocks", blocks)

    def load_seasonal_archives(self, records: list[dict[str, Any]]) -> int:
        """Upsert validated 214-day array records into public.seasonal_archives."""
        valid_records = [validate_seasonal_archive(r) for r in records]
        return self._execute_upsert("seasonal_archives", valid_records)

    def load_live_weather_buffer(self, records: list[dict[str, Any]]) -> int:
        """Upsert daily weather observations into public.live_weather_buffer."""
        valid_records = [validate_live_weather_buffer(r) for r in records]
        return self._execute_upsert("live_weather_buffer", valid_records)

    def load_teleconnections(self, records: list[dict[str, Any]]) -> int:
        """Upsert national climate index daily timeseries into public.teleconnections_history."""
        valid_records = [validate_teleconnection_record(r) for r in records]
        return self._execute_upsert("teleconnections_history", valid_records)

    def load_live_predictions(self, records: list[dict[str, Any]]) -> int:
        """Upsert calibrated probabilistic predictions into public.live_predictions."""
        valid_records = [validate_live_prediction(r) for r in records]
        return self._execute_upsert("live_predictions", valid_records)

    def fetch_blocks(self) -> list[dict[str, Any]]:
        """Fetch all administrative blocks with centroid and terrain features."""
        endpoint = f"{self.config.supabase_url.rstrip('/')}/rest/v1/blocks?select=block_id,block_name,district_name,state_name,centroid_lat,centroid_lon,elevation_m,slope_deg,distance_to_coast_km,agro_climatic_zone"
        headers = {
            "apikey": self.config.supabase_service_role_key,
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
            "Range": "0-9999",
        }
        try:
            resp = requests.get(endpoint, headers=headers, timeout=self.config.request_timeout_seconds)
            if resp.status_code == 200:
                return resp.json()
            self.logger.warning(f"Failed to fetch blocks: HTTP {resp.status_code}")
            return []
        except Exception as e:
            self.logger.error(f"Error fetching blocks: {e}")
            return []

    def fetch_seasonal_archives(self, block_ids: Optional[list[str]] = None) -> list[dict[str, Any]]:
        """Fetch seasonal archive records (214-day arrays)."""
        base = f"{self.config.supabase_url.rstrip('/')}/rest/v1/seasonal_archives?select=id,block_id,season_year,season_start_date,season_end_date,rainfall_x10,max_temp_x10,soil_moisture_idx,weather_state_code"
        if block_ids:
            # PostgREST in filter: block_id=in.(id1,id2)
            joined = ",".join(block_ids)
            endpoint = f"{base}&block_id=in.({joined})"
        else:
            endpoint = base

        headers = {
            "apikey": self.config.supabase_service_role_key,
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
            "Range": "0-9999",
        }
        try:
            resp = requests.get(endpoint, headers=headers, timeout=self.config.request_timeout_seconds)
            if resp.status_code == 200:
                return resp.json()
            self.logger.warning(f"Failed to fetch seasonal archives: HTTP {resp.status_code}")
            return []
        except Exception as e:
            self.logger.error(f"Error fetching seasonal archives: {e}")
            return []

    def fetch_teleconnections_history(self, limit: Optional[int] = None) -> list[dict[str, Any]]:
        """Fetch teleconnections timeseries ordered by observation_date."""
        endpoint = f"{self.config.supabase_url.rstrip('/')}/rest/v1/teleconnections_history?select=observation_date,enso_oni,iod_dmi,mjo_phase,mjo_amplitude,source_agency&order=observation_date.asc"
        if limit:
            endpoint = f"{self.config.supabase_url.rstrip('/')}/rest/v1/teleconnections_history?select=observation_date,enso_oni,iod_dmi,mjo_phase,mjo_amplitude,source_agency&order=observation_date.desc&limit={limit}"

        headers = {
            "apikey": self.config.supabase_service_role_key,
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
            "Range": "0-9999",
        }
        try:
            resp = requests.get(endpoint, headers=headers, timeout=self.config.request_timeout_seconds)
            if resp.status_code == 200:
                data = resp.json()
                if limit:
                    data = sorted(data, key=lambda x: x["observation_date"])
                return data
            self.logger.warning(f"Failed to fetch teleconnections: HTTP {resp.status_code}")
            return []
        except Exception as e:
            self.logger.error(f"Error fetching teleconnections: {e}")
            return []

    def fetch_live_weather_buffer(self, block_ids: Optional[list[str]] = None, days: int = 30) -> list[dict[str, Any]]:
        """Fetch recent observations from live_weather_buffer."""
        endpoint = f"{self.config.supabase_url.rstrip('/')}/rest/v1/live_weather_buffer?select=block_id,observation_date,rainfall_mm,max_temp_c,min_temp_c,soil_moisture_idx,data_source&order=observation_date.desc&limit=500"
        if block_ids:
            joined = ",".join(block_ids)
            endpoint = f"{endpoint}&block_id=in.({joined})"

        headers = {
            "apikey": self.config.supabase_service_role_key,
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
            "Range": "0-9999",
        }
        try:
            resp = requests.get(endpoint, headers=headers, timeout=self.config.request_timeout_seconds)
            if resp.status_code == 200:
                return resp.json()
            self.logger.warning(f"Failed to fetch live weather buffer: HTTP {resp.status_code}")
            return []
        except Exception as e:
            self.logger.error(f"Error fetching live weather buffer: {e}")
            return []

    def fetch_live_predictions(self, prediction_date: Optional[str] = None) -> list[dict[str, Any]]:
        """Fetch predictions from public.live_predictions."""
        endpoint = f"{self.config.supabase_url.rstrip('/')}/rest/v1/live_predictions?select=id,block_id,prediction_date,lead_time_bucket,onset_probability,break_probability,heavy_spell_probability,calibrated_confidence,primary_driver,secondary_driver,teleconnection_analog_year,advisory_code&order=prediction_date.desc,block_id.asc,lead_time_bucket.asc"
        if prediction_date:
            endpoint = f"{endpoint}&prediction_date=eq.{prediction_date}"

        headers = {
            "apikey": self.config.supabase_service_role_key,
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
            "Range": "0-9999",
        }
        try:
            resp = requests.get(endpoint, headers=headers, timeout=self.config.request_timeout_seconds)
            if resp.status_code == 200:
                return resp.json()
            self.logger.warning(f"Failed to fetch live predictions: HTTP {resp.status_code}")
            return []
        except Exception as e:
            self.logger.error(f"Error fetching live predictions: {e}")
            return []

    def prune_live_buffer_older_than(self, days: int = 90) -> int:
        """Prune observations from live_weather_buffer older than the retention window."""
        if self.dry_run:
            self.logger.info(f"[DRY-RUN] Pruning records older than {days} days from live_weather_buffer")
            return 0

        cutoff = (time.strftime("%Y-%m-%d", time.gmtime(time.time() - days * 86400)))
        endpoint = f"{self.config.supabase_url.rstrip('/')}/rest/v1/live_weather_buffer?observation_date=lt.{cutoff}"
        headers = {
            "apikey": self.config.supabase_service_role_key,
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
        }

        try:
            resp = requests.delete(endpoint, headers=headers, timeout=self.config.request_timeout_seconds)
            if resp.status_code in (200, 204):
                self.logger.info(f"Pruned live_weather_buffer records older than {cutoff}")
                return 1
            else:
                self.logger.warning(f"Prune returned HTTP {resp.status_code}: {resp.text[:200]}")
                return 0
        except Exception as e:
            self.logger.error(f"Error pruning live_weather_buffer: {e}")
            return 0
