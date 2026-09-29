"""Safe, idempotent loader for BHUMI Phase A authoritative India-wide block master data.

Features:
- Fail-closed guardrails: verifies source count, spatial match count, and bounding box.
- Batch chunking (500 records per chunk) via authenticated PostgREST endpoint.
- Reconciles existing 4 sample records to canonical LGD codes (4515, 726, 2726).
- Validates production count equals staging count (staging_valid_blocks == Supabase_blocks).
"""

import os
import sys
import time
import requests
import pandas as pd
from pipeline.utils.config import get_pipeline_config
from pipeline.utils.logger import get_logger

logger = get_logger("bhumi.phase_a_loader")

def main():
    print("=== BHUMI PHASE A: AUTHORITATIVE BLOCK UPSERT ===")
    cfg = get_pipeline_config()
    
    if not cfg.has_supabase:
        print("ERROR: Supabase credentials not found in environment!")
        sys.exit(1)
        
    staging_csv = os.path.join("data", "phase_a_block_master.csv")
    if not os.path.exists(staging_csv):
        print(f"ERROR: Staging file {staging_csv} not found! Run build_phase_a_staging.py first.")
        sys.exit(1)
        
    print(f"Reading staging dataset from {staging_csv}...")
    staging_df = pd.read_csv(staging_csv)
    total_discovered = len(staging_df)
    print(f"Total blocks discovered in staging: {total_discovered}")
    
    # Fail-closed guardrail 1: Discovered blocks must be >= 6,800
    if total_discovered < 6800:
        print(f"FAIL-CLOSED: Expected >= 6,800 blocks, but found {total_discovered}. Aborting.")
        sys.exit(1)
        
    # Filter to valid spatially matched records
    valid_df = staging_df[staging_df["spatial_match_status"] == "MATCHED_AUTHORITATIVE_BOUNDARY"].copy()
    valid_count = len(valid_df)
    print(f"Total valid blocks with authoritative spatial match: {valid_count}")
    
    # Fail-closed guardrail 2: Valid blocks must be >= 6,500
    if valid_count < 6500:
        print(f"FAIL-CLOSED: Expected >= 6,500 valid blocks, but found {valid_count}. Aborting.")
        sys.exit(1)
        
    # Validation checks
    assert valid_df["block_id"].nunique() == valid_count, "Duplicate block_id detected in valid set!"
    assert valid_df["block_name"].isna().sum() == 0, "Missing block_name detected!"
    assert valid_df["district_name"].isna().sum() == 0, "Missing district_name detected!"
    assert valid_df["state_name"].isna().sum() == 0, "Missing state_name detected!"
    assert valid_df["centroid_lat"].isna().sum() == 0, "Missing centroid_lat detected!"
    assert valid_df["centroid_lon"].isna().sum() == 0, "Missing centroid_lon detected!"
    
    # Coordinate bounds check
    invalid_coords = valid_df[
        (valid_df["centroid_lat"] < 6.0) | (valid_df["centroid_lat"] > 38.5) |
        (valid_df["centroid_lon"] < 68.0) | (valid_df["centroid_lon"] > 97.5)
    ]
    if len(invalid_coords) > 0:
        print(f"FAIL-CLOSED: Found {len(invalid_coords)} records with coordinates outside India bounds! Aborting.")
        sys.exit(1)
        
    print("All fail-closed guardrails passed successfully!")
    
    # Prepare payload records
    records_to_upsert = []
    for _, row in valid_df.iterrows():
        records_to_upsert.append({
            "block_id": str(row["block_id"]),
            "block_name": str(row["block_name"]),
            "district_name": str(row["district_name"]),
            "state_name": str(row["state_name"]),
            "centroid_lat": float(row["centroid_lat"]),
            "centroid_lon": float(row["centroid_lon"]),
            "elevation_m": None,
            "slope_deg": None,
            "distance_to_coast_km": None,
            "agro_climatic_zone": None,
            "boundary_geom": None
        })

    # Execute chunked upsert
    endpoint = f"{cfg.supabase_url.rstrip('/')}/rest/v1/blocks?on_conflict=block_id"
    headers = {
        "apikey": cfg.supabase_service_role_key,
        "Authorization": f"Bearer {cfg.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"
    }
    
    chunk_size = 500
    total_chunks = (len(records_to_upsert) + chunk_size - 1) // chunk_size
    print(f"Starting batch upsert of {len(records_to_upsert)} records in {total_chunks} chunks...")
    
    total_loaded = 0
    for idx in range(0, len(records_to_upsert), chunk_size):
        chunk = records_to_upsert[idx : idx + chunk_size]
        chunk_num = (idx // chunk_size) + 1
        
        for attempt in range(1, 4):
            try:
                resp = requests.post(endpoint, headers=headers, json=chunk, timeout=30)
                if resp.status_code in (200, 201, 204):
                    total_loaded += len(chunk)
                    print(f"Chunk {chunk_num}/{total_chunks} ({len(chunk)} records) loaded. Total: {total_loaded}/{len(records_to_upsert)}", end="\r")
                    break
                else:
                    raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")
            except Exception as e:
                if attempt == 3:
                    print(f"\nERROR: Chunk {chunk_num} failed after 3 attempts: {e}")
                    sys.exit(1)
                time.sleep(2 * attempt)
                
    print(f"\nUpsert complete! Successfully loaded {total_loaded} records.")

    # Reconcile existing legacy sample records
    print("\n--- RECONCILING EXISTING 4 SAMPLE RECORDS ---")
    auth_headers = {
        "apikey": cfg.supabase_service_role_key,
        "Authorization": f"Bearer {cfg.supabase_service_role_key}",
        "Content-Type": "application/json"
    }

    # 1. Clean up duplicate Jodhpur predictions/buffer for IND_RJ_JOD_002
    requests.delete(f"{cfg.supabase_url}/rest/v1/live_predictions?block_id=eq.IND_RJ_JOD_002", headers=auth_headers)
    requests.delete(f"{cfg.supabase_url}/rest/v1/live_weather_buffer?block_id=eq.IND_RJ_JOD_002", headers=auth_headers)
    
    # 2. Update referencing tables to canonical LGD codes
    legacy_map = {
        "IND_MH_PUN_001": "4515", # Haveli, Pune
        "IND_RJ_JOD_001": "726",  # Mandor, Jodhpur
        "IND_WB_KOL_003": "2726"  # Barasat-I, North 24 Parganas
    }
    
    for old_id, new_id in legacy_map.items():
        print(f"Migrating foreign keys from legacy '{old_id}' -> canonical LGD '{new_id}'...")
        requests.patch(
            f"{cfg.supabase_url}/rest/v1/live_predictions?block_id=eq.{old_id}",
            headers=auth_headers,
            json={"block_id": new_id}
        )
        requests.patch(
            f"{cfg.supabase_url}/rest/v1/live_weather_buffer?block_id=eq.{old_id}",
            headers=auth_headers,
            json={"block_id": new_id}
        )
        requests.patch(
            f"{cfg.supabase_url}/rest/v1/seasonal_archives?block_id=eq.{old_id}",
            headers=auth_headers,
            json={"block_id": new_id}
        )

    # 3. Delete the 4 legacy records from public.blocks
    print("Deleting legacy custom IDs from public.blocks...")
    legacy_ids = ["IND_MH_PUN_001", "IND_RJ_JOD_001", "IND_RJ_JOD_002", "IND_WB_KOL_003"]
    for lid in legacy_ids:
        requests.delete(f"{cfg.supabase_url}/rest/v1/blocks?block_id=eq.{lid}", headers=auth_headers)
        
    print("Legacy reconciliation complete.")

    # 4. Independent PostgREST Validation
    print("\n--- INDEPENDENT POSTGREST VALIDATION ---")
    query_headers = {
        "apikey": cfg.supabase_service_role_key,
        "Authorization": f"Bearer {cfg.supabase_service_role_key}",
        "Range-Unit": "items",
        "Prefer": "count=exact"
    }
    
    # Use Content-Range to get exact total count
    count_resp = requests.get(
        f"{cfg.supabase_url}/rest/v1/blocks?select=block_id&limit=1",
        headers=query_headers
    )
    content_range = count_resp.headers.get("content-range", "")
    total_supabase_blocks = int(content_range.split("/")[1]) if "/" in content_range else -1
    
    print(f"Supabase public.blocks row count: {total_supabase_blocks}")
    print(f"Staging valid blocks count:      {valid_count}")
    
    if total_supabase_blocks != valid_count:
        print(f"ERROR: Count mismatch! staging_valid_blocks ({valid_count}) != Supabase_blocks ({total_supabase_blocks})")
        sys.exit(1)
        
    print("MATCH VERIFIED: staging_valid_blocks == Supabase_blocks!")

if __name__ == "__main__":
    main()
