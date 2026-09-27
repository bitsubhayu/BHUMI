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

        endpoint = f"{self.config.supabase_url.rstrip('/')}/rest/v1/{table_name}"
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
