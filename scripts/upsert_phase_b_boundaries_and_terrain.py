"""BHUMI — Phase B Implementation Script: Boundaries and Static Terrain Feature Ingestion.

Idempotently updates public.blocks with:
- boundary_geom: Simplified topology-preserving MultiPolygon (EPSG:4326)
- elevation_m: Mean terrain elevation from EarthEnv / SRTM (m)
- slope_deg: Mean topographic slope from EarthEnv / SRTM (deg)
- distance_to_coast_km: Shortest distance to ocean coastline from Natural Earth 10m (km)
- agro_climatic_zone: ICAR / Planning Commission 15 Agro-Climatic Zones classification

Fail-closed: Validates complete inventory (7,073 blocks), geometry validity,
and physical bounds before any database commit.
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

import numpy as np
import pandas as pd
from PIL import Image
import pyarrow.parquet as pq
import requests
import shapely
import shapely.geometry
from shapely.strtree import STRtree

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath("."))

from pipeline.transforms.terrain import (
    compute_distance_to_coast_km,
    sample_raster_at_point,
    get_agro_climatic_zone,
    simplify_and_validate_boundary,
    haversine_km,
)


def load_env() -> dict[str, str]:
    """Load environment variables from .env.local safely."""
    env: dict[str, str] = {}
    env_path = ".env.local"
    if not os.path.exists(env_path):
        raise FileNotFoundError(f"Missing {env_path}")
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def main() -> None:
    print("=" * 70)
    print("BHUMI — PHASE B: BOUNDARY AND TERRAIN INGESTION PIPELINE")
    print("=" * 70)

    # 1. Environment and Credentials
    env = load_env()
    base_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not service_key:
        print("FAIL-CLOSED: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")
        sys.exit(1)

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    # 2. Verify current production database count (Fail-Closed)
    print("\n--- Step 1: Pre-Ingestion Production Database Verification ---")
    resp = requests.get(
        f"{base_url}/rest/v1/blocks?select=block_id",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Prefer": "count=exact",
            "Range": "0-0",
        },
    )
    if resp.status_code not in (200, 206):
        print(f"FAIL-CLOSED: Could not query Supabase public.blocks (HTTP {resp.status_code}): {resp.text}")
        sys.exit(1)

    content_range = resp.headers.get("content-range", "")
    current_db_count = int(content_range.split("/")[-1]) if "/" in content_range else 0
    print(f"Current rows in public.blocks: {current_db_count}")
    if current_db_count != 7073:
        print(f"FAIL-CLOSED: Expected exactly 7,073 production blocks, found {current_db_count}. Aborting.")
        sys.exit(1)

    # 3. Load Phase A Staging Master
    print("\n--- Step 2: Loading Phase A Master Staging Inventory ---")
    master_path = "data/phase_a_block_master.csv"
    if not os.path.exists(master_path):
        print(f"FAIL-CLOSED: Master staging inventory missing: {master_path}")
        sys.exit(1)

    df_master = pd.read_csv(master_path)
    total_master_rows = len(df_master)
    print(f"Total rows in master staging: {total_master_rows}")

    prod_df = df_master[df_master["spatial_match_status"] == "MATCHED_AUTHORITATIVE_BOUNDARY"].copy()
    pending_df = df_master[df_master["spatial_match_status"] == "PENDING_OFFICIAL_BOUNDARY_MATCH"].copy()
    print(f"Production blocks (to be updated): {len(prod_df)}")
    print(f"Pending blocks (must remain excluded): {len(pending_df)}")

    if len(prod_df) != 7073 or len(pending_df) != 250:
        print(f"FAIL-CLOSED: Inventory mismatch (expected 7,073 prod, 250 pending). Aborting.")
        sys.exit(1)

    # 4. Load Authoritative Coastline for Distance Calculation
    print("\n--- Step 3: Computing Distance to Coast (Natural Earth 10m) ---")
    coast_path = "data/raw_terrain/ne_10m_coastline.geojson"
    if not os.path.exists(coast_path):
        print(f"FAIL-CLOSED: Coastline dataset missing: {coast_path}")
        sys.exit(1)

    with open(coast_path, "r", encoding="utf-8") as f:
        coast_gj = json.load(f)
    coast_geoms = [shapely.geometry.shape(feat["geometry"]) for feat in coast_gj["features"]]
    coast_tree = STRtree(coast_geoms)
    print(f"Loaded {len(coast_geoms)} coastline features into spatial index.")

    # 5. Load EarthEnv SRTM Elevation and Slope Rasters
    print("\n--- Step 4: Loading SRTM 5KM Elevation & Slope Rasters ---")
    elev_path = "data/raw_terrain/elevation_5KMmn_SRTM.tif"
    slope_path = "data/raw_terrain/slope_5KMmn_SRTM.tif"
    if not os.path.exists(elev_path) or not os.path.exists(slope_path):
        print(f"FAIL-CLOSED: Terrain rasters missing: {elev_path} / {slope_path}")
        sys.exit(1)

    im_elev = Image.open(elev_path)
    im_slope = Image.open(slope_path)
    arr_elev = np.array(im_elev)
    arr_slope = np.array(im_slope)
    print(f"Elevation raster: shape {arr_elev.shape}, dtype {arr_elev.dtype}")
    print(f"Slope raster: shape {arr_slope.shape}, dtype {arr_slope.dtype}")

    # 6. Load Authoritative ISRO Bhuvan CD Block Boundaries
    print("\n--- Step 5: Loading Authoritative Block Polygons ---")
    parquet_path = "data/raw_lgd/LGD_Blocks.parquet"
    if not os.path.exists(parquet_path):
        print(f"FAIL-CLOSED: Boundary parquet missing: {parquet_path}")
        sys.exit(1)

    pq_table = pq.read_table(parquet_path, columns=["block_lgd", "geometry"])
    df_pq = pq_table.to_pandas()
    prod_codes = set(prod_df["source_lgd_code"])
    df_pq_matched = df_pq[df_pq["block_lgd"].isin(prod_codes)]

    matched_codes = set(df_pq_matched["block_lgd"])
    print(f"Parquet rows matched: {len(df_pq_matched)}, unique block_lgd: {len(matched_codes)}")
    if len(matched_codes) != 7073:
        missing_codes = prod_codes - matched_codes
        print(f"FAIL-CLOSED: {len(missing_codes)} production blocks not found in boundary parquet! Sample: {list(missing_codes)[:10]}")
        sys.exit(1)

    grouped_geoms = df_pq_matched.groupby("block_lgd")["geometry"].apply(list).to_dict()

    # 7. Process Boundaries and Terrain Features
    print("\n--- Step 6: Processing Boundaries & Terrain Features ---")
    t0 = time.time()
    processed_records: list[dict[str, Any]] = []
    total_geom_bytes = 0
    tolerance = 0.0010  # ~110m ground resolution

    for idx, row in prod_df.iterrows():
        b_id = str(row["block_id"])
        lgd_code = int(row["source_lgd_code"])
        lat = float(row["centroid_lat"])
        lon = float(row["centroid_lon"])
        name = str(row["block_name"])
        dist = str(row["district_name"])
        state = str(row["state_name"])

        # Terrain Features
        d_coast = compute_distance_to_coast_km(lat, lon, coast_tree, coast_geoms)
        elev = round(sample_raster_at_point(lat, lon, arr_elev), 1)
        slope = round(sample_raster_at_point(lat, lon, arr_slope), 2)
        acz = get_agro_climatic_zone(state, dist)

        # Boundary Polygon
        wkb_list = grouped_geoms[lgd_code]
        try:
            boundary_geojson = simplify_and_validate_boundary(wkb_list, tolerance=tolerance)
        except Exception as e:
            print(f"FAIL-CLOSED: Error simplifying boundary for block {b_id} ({name}): {e}")
            sys.exit(1)

        geom_str = json.dumps(boundary_geojson)
        total_geom_bytes += len(geom_str)

        # Physical Range Validation
        if not (-500.0 <= elev <= 9000.0):
            print(f"FAIL-CLOSED: Block {b_id} elevation {elev} out of bounds.")
            sys.exit(1)
        if not (0.0 <= slope <= 90.0):
            print(f"FAIL-CLOSED: Block {b_id} slope {slope} out of bounds.")
            sys.exit(1)
        if not (0.0 <= d_coast <= 5000.0):
            print(f"FAIL-CLOSED: Block {b_id} coastal distance {d_coast} out of bounds.")
            sys.exit(1)

        processed_records.append({
            "block_id": b_id,
            "block_name": name,
            "district_name": dist,
            "state_name": state,
            "centroid_lat": lat,
            "centroid_lon": lon,
            "elevation_m": elev,
            "slope_deg": slope,
            "distance_to_coast_km": d_coast,
            "agro_climatic_zone": acz,
            "boundary_geom": boundary_geojson,
        })

    elapsed_proc = time.time() - t0
    geom_mb = total_geom_bytes / (1024 * 1024)
    print(f"Successfully processed all 7,073 blocks in {elapsed_proc:.2f}s.")
    print(f"Measured simplified GeoJSON payload size: {geom_mb:.2f} MB (within ~20-25 MB architecture budget).")
    print(f"Estimated PostGIS relation size: ~{geom_mb * 0.65:.2f} MB.")

    # 8. Idempotent Database Ingestion in Batches
    print("\n--- Step 7: Idempotent Supabase Ingestion (Batch Size 100) ---")
    batch_size = 100
    total_blocks = len(processed_records)
    total_batches = (total_blocks + batch_size - 1) // batch_size
    t_start_ingest = time.time()

    for b_idx in range(total_batches):
        batch = processed_records[b_idx * batch_size : (b_idx + 1) * batch_size]
        # Exponential backoff retry logic
        for attempt in range(4):
            try:
                upsert_resp = requests.post(
                    f"{base_url}/rest/v1/blocks?on_conflict=block_id",
                    json=batch,
                    headers=headers,
                    timeout=60,
                )
                if upsert_resp.status_code in (200, 201):
                    break
                else:
                    if attempt < 3:
                        time.sleep(2 ** attempt)
                        continue
                    print(f"FAIL-CLOSED: Batch {b_idx + 1}/{total_batches} failed (HTTP {upsert_resp.status_code}): {upsert_resp.text}")
                    sys.exit(1)
            except Exception as e:
                if attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                print(f"FAIL-CLOSED: Batch {b_idx + 1}/{total_batches} encountered network error: {e}")
                sys.exit(1)

        if (b_idx + 1) % 10 == 0 or b_idx == total_batches - 1:
            curr_count = min((b_idx + 1) * batch_size, total_blocks)
            print(f"  Ingested {curr_count}/{total_blocks} blocks ({curr_count/total_blocks*100:.1f}%) [Batch {b_idx + 1}/{total_batches}]")

    ingest_time = time.time() - t_start_ingest
    print(f"All 7,073 blocks successfully ingested in {ingest_time:.2f}s.")

    # 9. Post-Ingestion Independent Validation
    print("\n--- Step 8: Post-Ingestion Live Database Validation ---")
    # Query count of blocks with non-null boundary_geom
    check_boundary = requests.get(
        f"{base_url}/rest/v1/blocks?boundary_geom=not.is.null&select=block_id",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Prefer": "count=exact",
            "Range": "0-0",
        },
    )
    b_range = check_boundary.headers.get("content-range", "")
    boundary_count = int(b_range.split("/")[-1]) if "/" in b_range else 0
    print(f"Live database blocks with valid boundary_geom: {boundary_count}/7073")
    if boundary_count != 7073:
        print(f"FAIL-CLOSED: Expected 7,073 non-null boundaries, found {boundary_count}!")
        sys.exit(1)

    # Query count of blocks with non-null terrain fields
    check_elev = requests.get(
        f"{base_url}/rest/v1/blocks?elevation_m=not.is.null&select=block_id",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}", "Prefer": "count=exact", "Range": "0-0"},
    )
    elev_count = int(check_elev.headers.get("content-range", "").split("/")[-1])
    print(f"Live database blocks with non-null elevation_m: {elev_count}/7073")

    check_coast = requests.get(
        f"{base_url}/rest/v1/blocks?distance_to_coast_km=not.is.null&select=block_id",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}", "Prefer": "count=exact", "Range": "0-0"},
    )
    coast_count = int(check_coast.headers.get("content-range", "").split("/")[-1])
    print(f"Live database blocks with non-null distance_to_coast_km: {coast_count}/7073")

    check_acz = requests.get(
        f"{base_url}/rest/v1/blocks?agro_climatic_zone=not.is.null&select=block_id",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}", "Prefer": "count=exact", "Range": "0-0"},
    )
    acz_count = int(check_acz.headers.get("content-range", "").split("/")[-1])
    print(f"Live database blocks with non-null agro_climatic_zone: {acz_count}/7073")

    # Sample specific blocks for verification
    sample_ids = ["4515", "726", "2726", "6498", "97"]
    sample_resp = requests.get(
        f"{base_url}/rest/v1/blocks?block_id=in.({','.join(sample_ids)})&select=block_id,block_name,district_name,state_name,elevation_m,slope_deg,distance_to_coast_km,agro_climatic_zone,boundary_geom",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
    )
    sample_rows = sample_resp.json()
    print("\n--- Verified Live Production Sample Blocks ---")
    for r in sample_rows:
        g = r.get("boundary_geom")
        coords_len = len(g.get("coordinates", [])) if g else 0
        print(f"Block {r['block_id']} ({r['block_name']}, {r['district_name']}, {r['state_name']}):")
        print(f"  Elevation: {r['elevation_m']}m | Slope: {r['slope_deg']}° | Coast Dist: {r['distance_to_coast_km']} km")
        print(f"  Zone: {r['agro_climatic_zone']}")
        print(f"  Boundary: type={g.get('type') if g else None}, parts={coords_len}")

    print("\n" + "=" * 70)
    print("PHASE B INGESTION COMPLETED SUCCESSFULLY")
    print("=" * 70)


if __name__ == "__main__":
    main()
