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

    def _fetch_paginated(
        self,
        table: str,
        select: str,
        filters: Optional[list[str]] = None,
        order: Optional[str] = None,
        page_size: int = 1000,
        max_rows: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """Fetch all rows from a PostgREST table using robust HTTP Range pagination."""
        all_rows: list[dict[str, Any]] = []
        offset = 0

        filter_str = ("&" + "&".join(filters)) if filters else ""
        order_str = f"&order={order}" if order else ""

        headers_base = {
            "apikey": self.config.supabase_service_role_key,
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
            "Range-Unit": "items",
            "Prefer": "count=exact",
        }

        while True:
            limit_this_page = page_size
            if max_rows is not None:
                remaining = max_rows - len(all_rows)
                if remaining <= 0:
                    break
                limit_this_page = min(page_size, remaining)

            range_start = offset
            range_end = offset + limit_this_page - 1
            headers = {
                **headers_base,
                "Range": f"{range_start}-{range_end}",
            }

            url = f"{self.config.supabase_url.rstrip('/')}/rest/v1/{table}?select={select}{filter_str}{order_str}"

            try:
                resp = requests.get(url, headers=headers, timeout=self.config.request_timeout_seconds)
                if resp.status_code not in (200, 206):
                    if offset == 0:
                        self.logger.warning(f"Failed to fetch {table}: HTTP {resp.status_code} ({resp.text[:200]})")
                        return []
                    raise RuntimeError(
                        f"PostgREST pagination failed for {table} at offset {offset}: "
                        f"HTTP {resp.status_code} {resp.text[:200]}"
                    )

                data = resp.json()
                if not isinstance(data, list) or len(data) == 0:
                    break

                all_rows.extend(data)

                content_range = resp.headers.get("Content-Range") or resp.headers.get("content-range")
                if content_range and "/" in content_range:
                    _, total_str = content_range.split("/", 1)
                    if total_str.strip() != "*":
                        try:
                            total_count = int(total_str.strip())
                            if len(all_rows) >= total_count:
                                break
                        except ValueError:
                            pass

                if len(data) < limit_this_page:
                    break

                offset += len(data)
            except Exception as e:
                if offset > 0:
                    self.logger.error(f"Error during pagination of {table} at offset {offset}: {e}")
                    raise
                self.logger.error(f"Error fetching {table}: {e}")
                return []

        return all_rows

    def fetch_blocks(self) -> list[dict[str, Any]]:
        """Fetch all administrative blocks with centroid and terrain features using full pagination."""
        return self._fetch_paginated(
            table="blocks",
            select="block_id,block_name,district_name,state_name,centroid_lat,centroid_lon,elevation_m,slope_deg,distance_to_coast_km,agro_climatic_zone",
            order="state_name.asc,district_name.asc,block_name.asc",
        )

    def fetch_seasonal_archives(self, block_ids: Optional[list[str]] = None) -> list[dict[str, Any]]:
        """Fetch seasonal archive records (214-day arrays) with pagination and chunked filtering."""
        select_cols = "id,block_id,season_year,season_start_date,season_end_date,rainfall_x10,max_temp_x10,soil_moisture_idx,weather_state_code"
        if not block_ids:
            return self._fetch_paginated(
                table="seasonal_archives",
                select=select_cols,
                order="season_year.asc,block_id.asc",
            )

        # Chunk block_ids to stay well within URL length limits
        chunk_size = 50
        all_archives: list[dict[str, Any]] = []
        for i in range(0, len(block_ids), chunk_size):
            chunk = block_ids[i : i + chunk_size]
            joined = ",".join(chunk)
            chunk_results = self._fetch_paginated(
                table="seasonal_archives",
                select=select_cols,
                filters=[f"block_id=in.({joined})"],
                order="season_year.asc,block_id.asc",
            )
            all_archives.extend(chunk_results)

        return all_archives

    def fetch_teleconnections_history(self, limit: Optional[int] = None) -> list[dict[str, Any]]:
        """Fetch teleconnections timeseries ordered by observation_date."""
        select_cols = "observation_date,enso_oni,iod_dmi,mjo_phase,mjo_amplitude,source_agency"
        if limit:
            data = self._fetch_paginated(
                table="teleconnections_history",
                select=select_cols,
                order="observation_date.desc",
                max_rows=limit,
            )
            return sorted(data, key=lambda x: str(x.get("observation_date", "")))

        return self._fetch_paginated(
            table="teleconnections_history",
            select=select_cols,
            order="observation_date.asc",
        )

    def fetch_live_weather_buffer(
        self,
        block_ids: Optional[list[str]] = None,
        days: int = 30,
    ) -> list[dict[str, Any]]:
        """Fetch recent observations from live_weather_buffer with genuine date window and pagination."""
        cutoff_date = (time.strftime("%Y-%m-%d", time.gmtime(time.time() - days * 86400)))
        select_cols = "block_id,observation_date,rainfall_mm,max_temp_c,min_temp_c,soil_moisture_idx,data_source"

        if not block_ids:
            return self._fetch_paginated(
                table="live_weather_buffer",
                select=select_cols,
                filters=[f"observation_date=gte.{cutoff_date}"],
                order="observation_date.asc,block_id.asc",
            )

        chunk_size = 50
        all_buffer: list[dict[str, Any]] = []
        for i in range(0, len(block_ids), chunk_size):
            chunk = block_ids[i : i + chunk_size]
            joined = ",".join(chunk)
            chunk_results = self._fetch_paginated(
                table="live_weather_buffer",
                select=select_cols,
                filters=[
                    f"observation_date=gte.{cutoff_date}",
                    f"block_id=in.({joined})",
                ],
                order="observation_date.asc,block_id.asc",
            )
            all_buffer.extend(chunk_results)

        return all_buffer

    def fetch_live_predictions(self, prediction_date: Optional[str] = None) -> list[dict[str, Any]]:
        """Fetch predictions from public.live_predictions with full pagination."""
        select_cols = "id,block_id,prediction_date,lead_time_bucket,onset_probability,break_probability,heavy_spell_probability,calibrated_confidence,primary_driver,secondary_driver,teleconnection_analog_year,advisory_code"
        filters = [f"prediction_date=eq.{prediction_date}"] if prediction_date else None
        return self._fetch_paginated(
            table="live_predictions",
            select=select_cols,
            filters=filters,
            order="prediction_date.desc,block_id.asc,lead_time_bucket.asc",
        )

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

    def prune_live_predictions_older_than(self, days: int = 60) -> int:
        """Prune historical predictions from live_predictions older than the retention window."""
        if self.dry_run:
            self.logger.info(f"[DRY-RUN] Pruning prediction records older than {days} days from live_predictions")
            return 0

        cutoff = (time.strftime("%Y-%m-%d", time.gmtime(time.time() - days * 86400)))
        endpoint = f"{self.config.supabase_url.rstrip('/')}/rest/v1/live_predictions?prediction_date=lt.{cutoff}"
        headers = {
            "apikey": self.config.supabase_service_role_key,
            "Authorization": f"Bearer {self.config.supabase_service_role_key}",
        }

        try:
            resp = requests.delete(endpoint, headers=headers, timeout=self.config.request_timeout_seconds)
            if resp.status_code in (200, 204):
                self.logger.info(f"Pruned live_predictions records older than {cutoff}")
                return 1
            else:
                self.logger.warning(f"Prune live_predictions returned HTTP {resp.status_code}: {resp.text[:200]}")
                return 0
        except Exception as e:
            self.logger.error(f"Error pruning live_predictions: {e}")
            return 0
