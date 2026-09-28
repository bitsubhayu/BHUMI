"""Data readiness audit for BHUMI forecasting engine.

Queries Supabase to inspect actual historical data coverage, blocks,
seasonal arrays, missing rates, and teleconnections history.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import requests

# Add repo root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.utils.config import get_pipeline_config


def run_audit() -> dict[str, Any]:
    config = get_pipeline_config()
    if not config.has_supabase:
        print("[ERROR] Supabase not configured in environment or .env.local")
        return {"error": "Supabase not configured"}

    headers = {
        "apikey": config.supabase_service_role_key,
        "Authorization": f"Bearer {config.supabase_service_role_key}",
        "Range": "0-9999",
    }
    base_url = config.supabase_url.rstrip("/")

    audit_results: dict[str, Any] = {}

    # 1. Blocks
    print("--- 1. Auditing Blocks ---")
    resp = requests.get(f"{base_url}/rest/v1/blocks?select=block_id,block_name,district_name,state_name,centroid_lat,centroid_lon,elevation_m,slope_deg,distance_to_coast_km", headers=headers)
    if resp.status_code == 200:
        blocks = resp.json()
        audit_results["blocks_count"] = len(blocks)
        audit_results["sample_blocks"] = [b["block_id"] for b in blocks[:5]]
        print(f"Total blocks in public.blocks: {len(blocks)}")
        for b in blocks[:5]:
            print(f"  - {b['block_id']}: {b.get('block_name')}, {b.get('district_name')}, {b.get('state_name')} (lat={b.get('centroid_lat')}, lon={b.get('centroid_lon')})")
    else:
        print(f"Failed to query blocks: HTTP {resp.status_code} - {resp.text[:100]}")
        audit_results["blocks_count"] = 0

    # 2. Seasonal Archives
    print("\n--- 2. Auditing Seasonal Archives ---")
    resp = requests.get(f"{base_url}/rest/v1/seasonal_archives?select=id,block_id,season_year,rainfall_x10,max_temp_x10,soil_moisture_idx,weather_state_code", headers=headers)
    if resp.status_code == 200:
        archives = resp.json()
        audit_results["seasonal_archives_count"] = len(archives)
        seasons = sorted(list({a["season_year"] for a in archives}))
        archived_blocks = sorted(list({a["block_id"] for a in archives}))
        audit_results["seasons_available"] = seasons
        audit_results["archived_blocks_count"] = len(archived_blocks)
        audit_results["archived_blocks"] = archived_blocks

        print(f"Total rows in public.seasonal_archives: {len(archives)}")
        print(f"Distinct seasons available: {seasons}")
        print(f"Distinct blocks with seasonal archives: {len(archived_blocks)} ({archived_blocks[:5]})")

        # Check array lengths and missingness
        valid_214 = 0
        null_counts = {"rainfall": 0, "max_temp": 0, "soil_moisture": 0, "weather_state": 0}
        for a in archives:
            rf = a.get("rainfall_x10") or []
            mt = a.get("max_temp_x10") or []
            sm = a.get("soil_moisture_idx") or []
            ws = a.get("weather_state_code") or []

            if len(rf) == 214 and len(mt) == 214 and len(sm) == 214 and len(ws) == 214:
                valid_214 += 1
            if not rf:
                null_counts["rainfall"] += 1
            if not mt:
                null_counts["max_temp"] += 1
            if not sm:
                null_counts["soil_moisture"] += 1
            if not ws:
                null_counts["weather_state"] += 1

        audit_results["complete_214_day_rows"] = valid_214
        audit_results["array_completeness_pct"] = (valid_214 / len(archives) * 100.0) if archives else 0.0
        audit_results["null_counts"] = null_counts
        print(f"Complete 214-day array rows: {valid_214}/{len(archives)} ({audit_results['array_completeness_pct']:.1f}%)")
        print(f"Null counts: {null_counts}")
    else:
        print(f"Failed to query seasonal_archives: HTTP {resp.status_code} - {resp.text[:100]}")
        audit_results["seasonal_archives_count"] = 0

    # 3. Teleconnections History
    print("\n--- 3. Auditing Teleconnections History ---")
    resp = requests.get(f"{base_url}/rest/v1/teleconnections_history?select=observation_date,enso_oni,iod_dmi,mjo_phase,mjo_amplitude,source_agency&order=observation_date.asc", headers=headers)
    if resp.status_code == 200:
        telecons = resp.json()
        audit_results["teleconnections_count"] = len(telecons)
        if telecons:
            min_date = telecons[0]["observation_date"]
            max_date = telecons[-1]["observation_date"]
            audit_results["telecon_min_date"] = min_date
            audit_results["telecon_max_date"] = max_date
            print(f"Total teleconnection records: {len(telecons)}")
            print(f"Date range: {min_date} to {max_date}")

            null_oni = sum(1 for t in telecons if t.get("enso_oni") is None)
            null_iod = sum(1 for t in telecons if t.get("iod_dmi") is None)
            null_mjo_p = sum(1 for t in telecons if t.get("mjo_phase") is None)
            null_mjo_a = sum(1 for t in telecons if t.get("mjo_amplitude") is None)
            print(f"Missingness - ONI: {null_oni}, IOD: {null_iod}, MJO Phase: {null_mjo_p}, MJO Amp: {null_mjo_a}")
            audit_results["telecon_missingness"] = {
                "null_oni": null_oni,
                "null_iod": null_iod,
                "null_mjo_phase": null_mjo_p,
                "null_mjo_amp": null_mjo_a,
            }
        else:
            print("No records in teleconnections_history")
    else:
        print(f"Failed to query teleconnections_history: HTTP {resp.status_code} - {resp.text[:100]}")
        audit_results["teleconnections_count"] = 0

    # 4. Live Weather Buffer
    print("\n--- 4. Auditing Live Weather Buffer ---")
    resp = requests.get(f"{base_url}/rest/v1/live_weather_buffer?select=block_id,observation_date,rainfall_mm,max_temp_c,min_temp_c,soil_moisture_idx,data_source&order=observation_date.desc&limit=100", headers=headers)
    if resp.status_code == 200:
        live_buf = resp.json()
        audit_results["live_buffer_sample_count"] = len(live_buf)
        print(f"Live buffer sample rows: {len(live_buf)}")
        if live_buf:
            sources = set(r.get("data_source") for r in live_buf)
            print(f"Data sources in live buffer: {sources}")
            print(f"Latest observation date: {live_buf[0]['observation_date']}")
    else:
        print(f"Failed to query live_weather_buffer: HTTP {resp.status_code}")

    # 5. Live Predictions
    print("\n--- 5. Auditing Live Predictions ---")
    resp = requests.get(f"{base_url}/rest/v1/live_predictions?select=id,block_id,prediction_date,lead_time_bucket&limit=20", headers=headers)
    if resp.status_code == 200:
        preds = resp.json()
        audit_results["existing_predictions_count"] = len(preds)
        print(f"Existing live_predictions rows: {len(preds)}")
    else:
        print(f"Failed to query live_predictions: HTTP {resp.status_code}")

    return audit_results


if __name__ == "__main__":
    results = run_audit()
    with open("data_readiness_audit.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("\nAudit saved to data_readiness_audit.json")
