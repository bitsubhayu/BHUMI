# BHUMI — Database & PostGIS Architecture

> **Storage Target**: < 215 MB / 500 MB (Supabase Postgres + PostGIS)  
> **Reference Architecture**: `TECH_STACK.md` §2 & §3 | `PRD.md` §2 & §3  
> **Problem Statement**: SIH 2026 PS 26086 (MoES / NCMRWF)

---

## 1. Design Overview & Storage Strategy

The database architecture is designed specifically to solve the tension between **nationwide coverage (~6,700 blocks)** and the **500 MB free-tier storage constraint** on Supabase.

### 1.1 The Storage Math
- **Naive approach**: 6,700 blocks × 365 days × 80 bytes/row ≈ **250 MB per year**. A 12-year historical record would consume **~3 GB** (6× above the budget limit).
- **BHUMI approach**: **One row per block per season**, packing 214 days (1 Apr – 31 Oct) into compact scaled integer arrays (`smallint[214]`).
  - Per block-season row size: **~1.8 KB**
  - Nationwide one season: 6,700 blocks × 1.8 KB ≈ **12 MB/year**
  - 12 seasons of history (2014–2025): **~145 MB**
  - **Headroom**: ~55% buffer for live forecast buffers, geometry, and indexes.

### 1.2 Architectural Decision on Panchayats
- **Permanent panchayat-level historical/forecast records are explicitly NOT stored.**
- India contains ~250,000 panchayats. Storing panchayats directly would create a **37× multiplier**, immediately exhausting the 500 MB database quota.
- **Serve-time BCSD downscaling**: All static terrain attributes (elevation, slope, coastal distance) are stored at the **block level** in `public.blocks`. When a user drills down to a panchayat, the local risk is computed on-demand via standard topographic lapse-rate equations (`computePanchayatRisk(blockRisk, elevationDelta, slopeFactor)`).
- This satisfies the problem statement's requirement for village/panchayat scale intelligence without storing any unnecessary panchayat tables.

---

## 2. Table-by-Table Reference

### 2.1 `public.blocks`
- **Purpose**: Master registry of all ~6,700 administrative blocks in India. Stores static terrain features and simplified boundaries.
- **Primary Key**: `block_id` (Local Government Directory / LGD code)
- **Key Columns**:
  - `block_name`, `district_name`, `state_name`
  - `centroid_lat`, `centroid_lon`: Geographic center coordinates
  - `elevation_m`: Mean elevation in meters (baseline for BCSD downscaling)
  - `slope_deg`: Mean slope in degrees
  - `distance_to_coast_km`: Distance to coastline (for marine moisture gradient)
  - `agro_climatic_zone`: ICAR agro-climatic zone classification
  - `boundary_geom`: `geometry(MultiPolygon, 4326)` simplified with `ST_SimplifyPreserveTopology`
- **Indexes**:
  - GIST spatial index on `boundary_geom`
  - B-tree on `(state_name, district_name)`, `block_name`, `(centroid_lat, centroid_lon)`

### 2.2 `public.seasonal_archives`
- **Purpose**: Compact historical archive of past monsoon seasons (2014–2025) used for analog matching, backtesting, and calibration.
- **Primary Key**: `id` (BIGINT IDENTITY)
- **Foreign Key**: `block_id` → `blocks(block_id)` ON DELETE CASCADE
- **Unique Constraint**: `(block_id, season_year)`
- **Array Columns (214 elements each)**:
  - `rainfall_x10`: `smallint[214]` (mm × 10)
  - `max_temp_x10`: `smallint[214]` (°C × 10)
  - `soil_moisture_idx`: `smallint[214]` (scaled index)
  - `weather_state_code`: `smallint[214]` (0: Normal, 1: Onset, 2: Active, 3: Break, 4: Heavy)
- **Check Constraints**: `cardinality(...) = 214` enforced on all arrays.

### 2.3 `public.live_weather_buffer`
- **Purpose**: Rolling 90-day buffer holding recent preliminary observations (GPM IMERG, ERA5T, IMD) used as live feature inputs for daily inference.
- **Primary Key**: `(block_id, observation_date)`
- **Key Columns**: `rainfall_mm`, `max_temp_c`, `min_temp_c`, `soil_moisture_idx`, `data_source`, `is_preliminary`
- **Estimated Footprint**: ~30 MB (short-lived rolling window).

### 2.4 `public.teleconnections_history`
- **Purpose**: 40+ years of daily/monthly macro-climate index trajectories (ENSO ONI, IOD DMI, MJO Phase & Amplitude).
- **Primary Key**: `observation_date`
- **Key Columns**: `enso_oni`, `iod_dmi`, `mjo_phase` (1–8), `mjo_amplitude`, `source_agency`
- **Estimated Footprint**: < 1 MB (single national series).

### 2.5 `public.live_predictions`
- **Purpose**: Precomputed block-level probabilistic forecasts and explainability drivers. Read directly by the Next.js frontend; written daily by the background GitHub Actions inference job.
- **Primary Key**: `id` (BIGINT IDENTITY)
- **Foreign Key**: `block_id` → `blocks(block_id)` ON DELETE CASCADE
- **Unique Constraint**: `(block_id, prediction_date, lead_time_bucket)`
- **Key Columns**:
  - `lead_time_bucket`: `'week_1' | 'week_2' | 'week_3' | 'week_4'`
  - `onset_probability`, `break_probability`, `heavy_spell_probability` (0–100%)
  - `calibrated_confidence` (Platt calibrated percentage)
  - `primary_driver`: Dominant physical teleconnection driver (e.g. *"IOD negative + MJO phase 3"*)
  - `secondary_driver`: Secondary physical contributor
  - `teleconnection_analog_year`: Historical analog year identified by the model
  - `advisory_code`: Linked ICAR rule code

### 2.6 `public.advisory_rules`
- **Purpose**: Agronomic rule thresholds and multilingual recommendation templates.
- **Primary Key**: `rule_code`
- **Key Columns**:
  - `action_type`: `'safe_to_sow' | 'delay_sowing' | 'prepare_irrigation' | 'drainage_alert' | 'monitor_conditions'`
  - `trigger_condition`: Logical condition definition
  - `english_title`, `english_recommendation`, `suggested_measures`
  - `localized_templates`: JSONB object holding pre-translated regional language templates (Bhashini API cache)
  - `icar_reference_code`: ICAR/KVK reference tag

---

## 3. Row Level Security (RLS) Policy Architecture

All 6 tables have Row Level Security enabled.

- **Browser / Client (`anon`, `authenticated`)**:
  - `SELECT` permitted on all tables.
  - Zero write access.
- **Ingestion / Model Pipelines (`service_role`)**:
  - `ALL` (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) permitted using server-side service credentials.
  - Never exposed to browser or client code.

---

## 4. Migration Files Directory

Migrations are structured sequentially in [`supabase/migrations/`](file:///c:/Users/subha/OneDrive/Documents/Antigravity_Workspace/BHUMI/supabase/migrations):

1. `20260927000001_enable_postgis.sql` — PostGIS extension initialization
2. `20260927000002_core_blocks_and_terrain.sql` — Block boundaries & static terrain features
3. `20260927000003_seasonal_archives.sql` — Array-packed compact season rows
4. `20260927000004_live_weather_buffer.sql` — 90-day rolling observation buffer
5. `20260927000005_teleconnections_history.sql` — ENSO, IOD, MJO index timeseries
6. `20260927000006_live_predictions_and_explainability.sql` — Probabilities & physical drivers
7. `20260927000007_advisory_rules.sql` — ICAR/KVK rule triggers & multilingual templates
8. `20260927000008_row_level_security.sql` — RLS activation and access policies

A single concatenated script for one-click execution in the Supabase Dashboard SQL Editor is also maintained at [`supabase/schema.sql`](file:///c:/Users/subha/OneDrive/Documents/Antigravity_Workspace/BHUMI/supabase/schema.sql).
