"""Dedicated Nationwide Historical Meteorological Backfill Script for Phase C.

Executes a production-safe, resumable, checkpointed historical backfill covering:
- 12 seasons: 2014–2025
- 7,073 authoritative production blocks (250 pending blocks excluded)
- Exactly 214 days per season (1 April to 31 October inclusive)
- Target: 84,876 block-season archive rows in public.seasonal_archives

Operational Architecture:
- Season-by-season processing with 50-block multi-coordinate batch requests.
- Dual upstream endpoints:
  * historical-forecast-api (ECMWF operational archive) for seasons 2017–2025.
  * archive-api (Copernicus ERA5 reanalysis archive) for seasons 2014–2016.
- Checkpointed execution via data/backfill_checkpoint.json.
- Automatic discovery of existing Supabase records to prevent redundant API queries.
- Idempotent PostgREST upsert (on_conflict=block_id,season_year).
- Exponential backoff retry and rate-limit cooldown handling.
- Zero synthetic data: unavailable observations are skipped and logged.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Sequence

# Ensure repo root is on sys.path
repo_root = Path(__file__).resolve().parent.parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

import pandas as pd
import requests

from pipeline.loaders.supabase_loader import SupabaseLoader
from pipeline.transforms.seasonal_pack import get_season_dates, pack_seasonal_archive
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.logger import get_logger

ARCHIVE_API_URL = "https://archive-api.open-meteo.com/v1/archive"
HISTORICAL_FORECAST_API_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
CHECKPOINT_PATH = repo_root / "data" / "backfill_checkpoint.json"
SKIPPED_LOG_PATH = repo_root / "data" / "backfill_skipped_blocks.log"
BLOCK_MASTER_PATH = repo_root / "data" / "phase_a_block_master.csv"


class BackfillCheckpoint:
    """Tracks completed (block_id, season_year) pairs across all 7,073 production blocks."""

    def __init__(self, checkpoint_file: Path = CHECKPOINT_PATH) -> None:
        self.path = checkpoint_file
        # completed_map: str(year) -> list[str(block_id)]
        self.completed_map: dict[str, set[str]] = {}
        self.total_records_upserted = 0
        self.started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.load()

    def load(self) -> None:
        if self.path.exists():
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.started_at = data.get("started_at", self.started_at)
                self.total_records_upserted = data.get("total_records_upserted", 0)
                raw_map = data.get("completed_by_year", {})
                self.completed_map = {str(yr): set(b_ids) for yr, b_ids in raw_map.items()}
            except Exception as e:
                print(f"! Warning: Failed to parse checkpoint ({e}). Initializing empty.")

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        serializable_map = {yr: sorted(list(b_ids)) for yr, b_ids in self.completed_map.items()}
        total_completed_pairs = sum(len(b_ids) for b_ids in self.completed_map.values())
        payload = {
            "started_at": self.started_at,
            "last_updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "total_records_upserted": self.total_records_upserted,
            "total_completed_pairs": total_completed_pairs,
            "completed_by_year": serializable_map,
        }
        tmp_path = self.path.with_suffix(".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        tmp_path.replace(self.path)

    def is_completed(self, block_id: str, season_year: int) -> bool:
        yr_str = str(season_year)
        return block_id in self.completed_map.get(yr_str, set())

    def mark_completed_batch(self, season_year: int, block_ids: Sequence[str], count: int) -> None:
        yr_str = str(season_year)
        if yr_str not in self.completed_map:
            self.completed_map[yr_str] = set()
        for b_id in block_ids:
            self.completed_map[yr_str].add(str(b_id))
        self.total_records_upserted += count
        self.save()


def load_authoritative_blocks() -> list[dict[str, Any]]:
    """Load authoritative production blocks (7,073), strictly excluding pending blocks."""
    if not BLOCK_MASTER_PATH.exists():
        raise FileNotFoundError(f"Block master not found at {BLOCK_MASTER_PATH}")

    df = pd.read_csv(BLOCK_MASTER_PATH)
    prod_df = df[df["spatial_match_status"] == "MATCHED_AUTHORITATIVE_BOUNDARY"].copy()
    if len(prod_df) != 7073:
        raise ValueError(f"Expected 7,073 production blocks, found {len(prod_df)}")

    prod_df.sort_values(by=["state_name", "district_name", "block_name"], inplace=True)
    return prod_df.to_dict(orient="records")


def discover_existing_db_records(loader: SupabaseLoader) -> dict[str, set[str]]:
    """Fetch all existing (block_id, season_year) pairs from Supabase seasonal_archives."""
    logger = get_logger("bhumi.backfill")
    logger.info("Scanning public.seasonal_archives for existing block-season records...")
    endpoint = f"{loader.config.supabase_url.rstrip('/')}/rest/v1/seasonal_archives?select=block_id,season_year"
    headers = loader._get_headers()
    headers["Range-Unit"] = "items"
    headers["Prefer"] = "count=exact"

    existing_by_year: dict[str, set[str]] = {}
    offset = 0
    page_size = 2000

    while True:
        headers["Range"] = f"{offset}-{offset + page_size - 1}"
        try:
            resp = requests.get(endpoint, headers=headers, timeout=20)
            if resp.status_code not in (200, 206):
                break
            rows = resp.json()
            if not rows:
                break
            for r in rows:
                b_id = str(r["block_id"])
                yr_str = str(r["season_year"])
                existing_by_year.setdefault(yr_str, set()).add(b_id)
            if len(rows) < page_size:
                break
            offset += len(rows)
        except Exception as e:
            logger.warning(f"Warning during existing records scan: {e}")
            break

    total_found = sum(len(b_ids) for b_ids in existing_by_year.values())
    logger.info(f"Discovered {total_found} existing block-season records across {len(existing_by_year)} seasons in Supabase")
    return existing_by_year


def query_season_batch(
    blocks: list[dict[str, Any]],
    season_year: int,
    max_retries: int = 5,
) -> list[dict[str, Any]]:
    """Query genuine daily observations for a batch of blocks for one 214-day season.
    
    Selects endpoint based on year:
    - 2017..2025: historical-forecast-api (ECMWF operational model archive)
    - 2014..2016: archive-api (Copernicus ERA5 reanalysis archive)
    """
    logger = get_logger("bhumi.backfill")
    lats = ",".join([f"{float(b['centroid_lat']):.4f}" for b in blocks])
    lons = ",".join([f"{float(b['centroid_lon']):.4f}" for b in blocks])

    start_date = f"{season_year}-04-01"
    end_date = f"{season_year}-10-31"

    # Select endpoint
    primary_url = HISTORICAL_FORECAST_API_URL if season_year >= 2016 else ARCHIVE_API_URL
    fallback_url = ARCHIVE_API_URL if primary_url == HISTORICAL_FORECAST_API_URL else None

    params = {
        "latitude": lats,
        "longitude": lons,
        "start_date": start_date,
        "end_date": end_date,
        "daily": "temperature_2m_max,precipitation_sum,soil_moisture_0_to_7cm_mean",
        "timezone": "auto",
    }

    current_url = primary_url
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.get(current_url, params=params, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    return [data]
                return data
            elif resp.status_code == 429:
                if fallback_url and current_url != fallback_url:
                    logger.warning(f"Primary endpoint returned 429, switching to fallback {fallback_url}...")
                    current_url = fallback_url
                    continue
                wait_sec = 65
                logger.warning(f"Rate limit reached on {current_url} (HTTP 429). Cooling down {wait_sec}s (attempt {attempt}/{max_retries})...")
                time.sleep(wait_sec)
            else:
                logger.warning(f"HTTP {resp.status_code} from {current_url} ({resp.text[:120]}). Attempt {attempt}/{max_retries}...")
                time.sleep(2.0 ** attempt)
        except Exception as e:
            logger.warning(f"Network error querying {current_url} ({e}). Attempt {attempt}/{max_retries}...")
            time.sleep(2.0 ** attempt)

    raise RuntimeError(f"Failed to fetch season {season_year} observations for {len(blocks)} blocks after {max_retries} attempts.")


def process_single_season(
    block: dict[str, Any],
    daily_data: dict[str, Any],
    season_year: int,
) -> dict[str, Any]:
    """Validate 214-day cardinality and natural variance, then pack into smallint[214] archive row."""
    block_id = str(block["block_id"])
    times = daily_data.get("time", [])
    if not times:
        raise ValueError(f"Empty time series returned for block {block_id} season {season_year}")

    season_dates = [str(d) for d in get_season_dates(season_year)]
    if len(times) != 214 or times != season_dates:
        # Check alignment via map
        date_to_idx = {d: i for i, d in enumerate(times)}
        missing = [d for d in season_dates if d not in date_to_idx]
        if missing:
            raise ValueError(f"Missing {len(missing)} dates in observations for {block_id} season {season_year}")
        indices = [date_to_idx[d] for d in season_dates]
    else:
        indices = list(range(214))

    raw_temps = daily_data.get("temperature_2m_max", [])
    raw_rains = daily_data.get("precipitation_sum", [])
    raw_soils = daily_data.get("soil_moisture_0_to_7cm_mean", [])

    season_temps = [raw_temps[i] for i in indices]
    season_rains = [raw_rains[i] for i in indices]
    season_soils = [raw_soils[i] for i in indices]

    # Verify zero missing observations
    if any(t is None for t in season_temps) or any(r is None for r in season_rains) or any(s is None for s in season_soils):
        raise ValueError(f"Incomplete observations in season {season_year} for block {block_id}")

    max_temps = [float(t) for t in season_temps]
    rains = [round(max(0.0, float(r)), 2) for r in season_rains]
    soil_indices = [round(max(0.0, min(100.0, (float(s) / 0.50) * 100.0)), 1) for s in season_soils]

    # Physical realism check: temperature must exhibit natural variance
    if len(set(max_temps)) < 15:
        raise ValueError(f"Suspiciously low temperature variance in season {season_year} for block {block_id}")

    return pack_seasonal_archive(
        block_id=block_id,
        season_year=season_year,
        rainfall_series=rains,
        max_temp_series=max_temps,
        soil_moisture_series=soil_indices,
    )


def log_skip(block_id: str, season_year: int, reason: str) -> None:
    """Log an unavailable block-season to the skip log file without inventing data."""
    SKIPPED_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SKIPPED_LOG_PATH, "a", encoding="utf-8") as f:
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        f.write(f"[{timestamp}] Block {block_id} Season {season_year}: {reason}\n")


def run_nationwide_backfill(
    batch_size: int = 50,
    delay_seconds: float = 1.0,
    start_year: int = 2014,
    end_year: int = 2025,
    target_year: int | None = None,
    limit: int | None = None,
    dry_run: bool = False,
    reset_checkpoint: bool = False,
) -> int:
    """Execute the full nationwide historical backfill across all 7,073 production blocks."""
    logger = get_logger("bhumi.backfill")
    config = get_pipeline_config()
    loader = SupabaseLoader(config=config, dry_run=dry_run)

    logger.info("=" * 72)
    logger.info("BHUMI: NATIONWIDE HISTORICAL METEOROLOGICAL BACKFILL")
    logger.info("=" * 72)

    if reset_checkpoint and CHECKPOINT_PATH.exists():
        logger.info(f"Resetting checkpoint file at {CHECKPOINT_PATH}...")
        CHECKPOINT_PATH.unlink()

    checkpoint = BackfillCheckpoint()

    # Discover and populate existing DB records into checkpoint
    if not dry_run and config.has_supabase:
        existing_in_db = discover_existing_db_records(loader)
        checkpoint.completed_map = {yr_str: set(b_ids) for yr_str, b_ids in existing_in_db.items()}
        checkpoint.total_completed_pairs = sum(len(b_ids) for b_ids in checkpoint.completed_map.values())
        checkpoint.save()

    all_blocks = load_authoritative_blocks()
    total_blocks = len(all_blocks)
    logger.info(f"Authoritative production blocks loaded: {total_blocks}")

    years_to_process = [target_year] if target_year else list(range(start_year, end_year + 1))
    target_total_rows = total_blocks * len(years_to_process)
    logger.info(f"Target seasons: {years_to_process} ({len(years_to_process)} seasons)")
    logger.info(f"Total block-season rows target: {target_total_rows:,}")

    start_time = time.time()
    total_loaded_this_run = 0

    for season_year in years_to_process:
        yr_str = str(season_year)
        completed_in_year = checkpoint.completed_map.get(yr_str, set())
        remaining = [b for b in all_blocks if str(b["block_id"]) not in completed_in_year]

        if limit is not None:
            remaining = remaining[:limit]

        logger.info("=" * 72)
        logger.info(
            f"PROCESSING SEASON {season_year}: {len(completed_in_year)}/{total_blocks} completed, "
            f"{len(remaining)} remaining"
        )
        logger.info("=" * 72)

        if not remaining:
            logger.info(f"Season {season_year} is already 100% complete across all blocks. Skipping.")
            continue

        season_batches = (len(remaining) + batch_size - 1) // batch_size
        pending_upsert_records: list[dict[str, Any]] = []
        pending_completed_block_ids: list[str] = []

        for b_idx in range(0, len(remaining), batch_size):
            batch = remaining[b_idx : b_idx + batch_size]
            b_num = (b_idx // batch_size) + 1
            batch_block_ids = [str(b["block_id"]) for b in batch]

            logger.info(
                f"[Season {season_year} | Batch {b_num}/{season_batches}] Querying {len(batch)} blocks "
                f"({batch_block_ids[0]}..{batch_block_ids[-1]})..."
            )

            try:
                obs_results = query_season_batch(batch, season_year)
            except Exception as e:
                logger.error(f"Batch {b_num} failed for season {season_year}: {e}. Logging skips.")
                for b in batch:
                    log_skip(str(b["block_id"]), season_year, str(e))
                time.sleep(delay_seconds)
                continue

            if len(obs_results) != len(batch):
                logger.error(f"Response count mismatch ({len(obs_results)} vs {len(batch)}). Logging skips.")
                for b in batch:
                    log_skip(str(b["block_id"]), season_year, "Response count mismatch")
                continue

            for b, res in zip(batch, obs_results):
                b_id = str(b["block_id"])
                try:
                    packed_row = process_single_season(b, res.get("daily", {}), season_year)
                    pending_upsert_records.append(packed_row)
                    pending_completed_block_ids.append(b_id)
                except Exception as e:
                    logger.warning(f"Validation failed for block {b_id} season {season_year}: {e}")
                    log_skip(b_id, season_year, str(e))

            # Upsert each batch immediately so progress is persisted incrementally to DB and checkpointed
            if pending_upsert_records:
                if dry_run:
                    logger.info(f"[DRY-RUN] Simulated upsert of {len(pending_upsert_records)} records into seasonal_archives")
                    total_loaded_this_run += len(pending_upsert_records)
                    checkpoint.mark_completed_batch(season_year, pending_completed_block_ids, len(pending_upsert_records))
                else:
                    loaded = loader.load_seasonal_archives(pending_upsert_records)
                    total_loaded_this_run += loaded
                    checkpoint.mark_completed_batch(season_year, pending_completed_block_ids, loaded)

                pending_upsert_records.clear()
                pending_completed_block_ids.clear()

            # Progress diagnostics
            elapsed = time.time() - start_time
            done_this_season = len(checkpoint.completed_map.get(yr_str, set()))
            season_pct = (done_this_season / total_blocks) * 100.0
            total_db_rows = sum(len(s) for s in checkpoint.completed_map.values())
            total_pct = (total_db_rows / target_total_rows) * 100.0

            logger.info(
                f"[Progress] Season {season_year}: {done_this_season}/{total_blocks} ({season_pct:.1f}%) | "
                f"Overall DB Archives: {total_db_rows:,}/{target_total_rows:,} ({total_pct:.1f}%) | "
                f"Elapsed: {int(elapsed)}s"
            )

            time.sleep(delay_seconds)

    duration = time.time() - start_time
    logger.info("=" * 72)
    logger.info(f"NATIONWIDE BACKFILL RUN COMPLETED in {duration:.1f}s ({datetime.timedelta(seconds=int(duration))})")
    logger.info(f"Records loaded this session: {total_loaded_this_run:,}")
    total_archives_in_db = sum(len(s) for s in checkpoint.completed_map.values())
    logger.info(f"Total verified archives in database: {total_archives_in_db:,}/{target_total_rows:,}")
    logger.info("=" * 72)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="BHUMI Nationwide Historical Meteorological Backfill")
    parser.add_argument("--batch-size", type=int, default=10, help="Number of blocks per multi-coordinate API call (default: 10)")
    parser.add_argument("--delay", type=float, default=10.0, help="Seconds delay between API requests (default: 10.0)")
    parser.add_argument("--start-year", type=int, default=2014, help="Start year of historical archives (default: 2014)")
    parser.add_argument("--end-year", type=int, default=2025, help="End year of historical archives (default: 2025)")
    parser.add_argument("--season-year", type=int, default=None, help="Process a specific single season year (e.g. 2024)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of blocks to process per season (for testing)")
    parser.add_argument("--dry-run", action="store_true", help="Extract and pack without upserting to Supabase")
    parser.add_argument("--reset-checkpoint", action="store_true", help="Reset checkpoint and re-discover from Supabase")

    args = parser.parse_args()
    code = run_nationwide_backfill(
        batch_size=args.batch_size,
        delay_seconds=args.delay,
        start_year=args.start_year,
        end_year=args.end_year,
        target_year=args.season_year,
        limit=args.limit,
        dry_run=args.dry_run,
        reset_checkpoint=args.reset_checkpoint,
    )
    sys.exit(code)


if __name__ == "__main__":
    main()
