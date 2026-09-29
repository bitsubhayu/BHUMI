# BHUMI — Data Pipeline Architecture Reference

**Companion to `PRD.md` and `TECH_STACK.md`**  
SIH 2026 Problem Statement 26086 | MoES / NCMRWF

---

## 1. System Context & Cadence

The BHUMI data ingestion pipeline operates exclusively in background compute environments (GitHub Actions or localized batch jobs). It feeds precomputed, structured datasets into **Supabase PostgreSQL + PostGIS** so that the frontend web application only ever queries lightweight, indexed tables.

```
+-------------------------------------------------------------------------------+
|                             External Data Sources                             |
|  - NOAA CPC (ONI)        - BOM Australia (DMI, RMM MJO)                       |
|  - CHIRPS (0.05° Rain)   - Copernicus CDS (ERA5-Land)                         |
|  - NASA GPM IMERG (0.1°) - NASA SMAP (Soil Moisture)                          |
|  - NOAA GFS (0.25°)      - ECMWF Open Data (0.4°)                             |
|  - IMD Pune (Gridded Ground Truth - Registration Pending)                     |
+---------------------------------------+---------------------------------------+
                                        |
                   +--------------------+--------------------+
                   |                                         |
                   v (Weekly)                                v (Daily)
    +------------------------------+          +------------------------------+
    | .github/workflows/           |          | .github/workflows/           |
    | weekly-historical-sync.yml   |          | daily-live-sync.yml          |
    +--------------+---------------+          +--------------+---------------+
                   |                                         |
                   +--------------------+--------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                       Supabase PostgreSQL + PostGIS (500 MB)                  |
|  - public.blocks                 : 6,700 blocks, centroids & terrain          |
|  - public.seasonal_archives      : 12 seasons (2014–2025), smallint[214] arrays|
|  - public.live_weather_buffer    : Rolling 90-day observations & NWP fields   |
|  - public.teleconnections_history: National ENSO/IOD/MJO daily timeseries     |
+-------------------------------------------------------------------------------+
```

---

## 2. Storage Architecture & 12-Season Resolution

### The 500 MB Budget Constraint
A naive relational design storing 1 row per block per day across India's ~6,700 blocks requires:
$$\text{Row overhead} = 6,700 \times 365 \times 80\text{ bytes} \approx 250\text{ MB/year}$$
Three years would completely exhaust the 500 MB free database quota.

### The BHUMI Solution
1. **Compact 214-day Seasonal Arrays (`public.seasonal_archives`)**:
   - Season window: 1 April – 31 October (214 days).
   - 4 integer arrays of type `smallint[214]`:
     - `rainfall_x10` (scaled mm $\times 10$)
     - `max_temp_x10` (scaled °C $\times 10$)
     - `soil_moisture_idx` (0–100 integer wetness index)
     - `weather_state_code` (0: Normal, 1: Onset, 2: Active, 3: Break, 4: Heavy)
   - Stored size per block-year: ~1.8 KB.
   - 12 seasons (2014–2025): **~145 MB**.
2. **Rolling 90-Day Live Buffer (`public.live_weather_buffer`)**:
   - Automatically pruned daily to retain only observations within 90 days: **~30 MB**.
3. **Block Boundaries & Terrain (`public.blocks`)**:
   - `ST_SimplifyPreserveTopology` multi-polygons + elevation/slope: **~25 MB**.
4. **National Teleconnections (`public.teleconnections_history`)**:
   - One daily row for the nation (not duplicated across blocks): **~1 MB**.
5. **Headroom**:
   - Total database footprint: **~212 MB**, leaving **~58% headroom**.

---

## 3. Source Adapters Implementation Status

| Source Adapter | Module | Status | Data Protocol | Failover / Error Handling |
| :--- | :--- | :--- | :--- | :--- |
| **Teleconnections** | `pipeline/sources/teleconnections.py` | **Live & Verified** | Public NOAA CPC ASCII & BOM Australia text tables | Exponential backoff, browser User-Agent header, mirror failover |
| **CHIRPS** | `pipeline/sources/chirps.py` | **Implemented** | UCSB CHC HTTP direct daily GeoTIFF/NetCDF | Preliminary vs finalized tracking for monthly reconciliation |
| **ERA5-Land** | `pipeline/sources/era5.py` | **Implemented** | Copernicus CDS API (`cdsapi`) with CDSAPI_KEY | Graceful detection when CDS credentials are unset or queued |
| **NASA GPM IMERG** | `pipeline/sources/gpm_imerg.py` | **Implemented** | NASA CMR Search & GES DISC HTTP with Earthdata Login | Early run (~4h lag) for live buffer; Final run for reconciliation |
| **NASA SMAP** | `pipeline/sources/smap.py` | **Implemented** | NASA CMR Search SPL3SMP Level-3 granules | Volumetric soil moisture converted to 0–100 wetness index |
| **NOAA GFS / GEFS** | `pipeline/sources/gfs.py` | **Implemented** | NOAA NOMADS HTTP subregion filter & AWS Open Data S3 | Public open data, 0.25° grid extraction |
| **ECMWF Open Data** | `pipeline/sources/ecmwf.py` | **Implemented** | ECMWF open data repository | Public open data, surface temperature and precipitation |
| **IMD Gridded** | `pipeline/sources/imd.py` | **Gracefully Skipped** | Binary `.grd` via IMD National Data Centre Pune | Returns clean unconfigured status; logs graceful skip |

---

## 4. Operational Invariant: Zero Permanent Panchayat Records

As dictated by PRD §2/§3 and TECH_STACK §3:
* Permanent panchayat-level data is **NEVER** stored in any database table.
* There are ~250,000 panchayats in India vs ~6,700 blocks (a 37× multiplier).
* Panchayat values are generated on demand at serve-time by adjusting the parent block value with static topographic features (elevation/slope BCSD lapse-rate disaggregation).
* The pipeline enforces this constraint via `assert_no_panchayat_storage()` in `pipeline/transforms/spatial.py`.

---

## 5. Static Terrain & Boundary Ingestion Pipeline (Phase B)

Phase B established the official simplified block boundary polygons and static terrain attributes required for on-demand BCSD panchayat downscaling and topographic lapse rates:

| Data Element | Authoritative Source Dataset | Extraction & Processing Method | Production Coverage |
| :--- | :--- | :--- | :--- |
| **Boundary Geometry** | ISRO Bhuvan CD Block Vector Parquet (`LGD_Blocks.parquet`) | Matched to canonical LGD block codes, multipart unified via `shapely.unary_union`, simplified via Douglas-Peucker (`tolerance=0.0010°`, ~110m resolution). Ingested as EPSG:4326 `MultiPolygon`. | 7,073 active blocks (100% of production). 250 pending staged with NULL. |
| **Mean Elevation (`elevation_m`)** | EarthEnv Topography / CGIAR-CSI SRTM v4.1 5KM DEM | Bilinear raster extraction at block centroid coordinates using `rasterio`. Range: -0.1m to 5,729.2m across India. | 7,073 / 7,073 (100% coverage, 0 NaNs). |
| **Mean Slope (`slope_deg`)** | EarthEnv Topography / CGIAR-CSI SRTM v4.1 5KM Slope | Bilinear raster extraction at block centroid coordinates using `rasterio`. Range: 0.00° to 43.97°. | 7,073 / 7,073 (100% coverage, 0 NaNs). |
| **Distance to Coast (`distance_to_coast_km`)** | Natural Earth 10m Coastlines v5.1.2 | Nearest-edge search via Shapely `STRtree` spatial indexing with great-circle haversine calculation. Range: 0.01 km to 1,485.48 km. | 7,073 / 7,073 (100% coverage, 0 NaNs). |
| **Agro-Climatic Zone** | Planning Commission / ICAR 15 Agro-Climatic Zones | State and district administrative lookup using official NARP / ICAR classification. | 7,073 / 7,073 (100% coverage, 0 placeholders). |

### Pipeline Modules & Tools
- `pipeline/transforms/terrain.py`: Core functions (`extract_elevation_and_slope`, `compute_distance_to_coast`, `get_agro_climatic_zone`).
- `scripts/upsert_phase_b_boundaries_and_terrain.py`: Batch PostgREST boundary and terrain feature upsert with payload optimization.
- `scripts/validate_production_db.mjs`: Automated PostgREST assertion test verifying 7,073 MultiPolygons, valid ranges, and zero orphaned records.

---

## 6. Historical & Live Meteorological Data Foundation (Phase C)

Phase C establishes the operational data foundation populating `public.teleconnections_history`, `public.seasonal_archives` (12 historical seasons, 2014–2025), and `public.live_weather_buffer` (rolling 90-day window) from real meteorological and satellite sources.

### Authoritative Source Inventory & Protocols

| Source Priority | Source & Provider | Variables Extracted | Cadence & Ingestion Target | Access Protocol & Endpoints | Status & Handling |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. NOAA CPC ONI** | NOAA Climate Prediction Center | Oceanic Niño Index (ENSO 3-month running mean anomaly, °C) | Monthly authoritative value aligned to calendar dates within each respective month (strictly NOT native daily measurements) in `public.teleconnections_history` | HTTP GET `https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt` (mirror: `https://psl.noaa.gov/data/correlation/oni.data`) | **Active & Live** (919 monthly values ingested) |
| **2. BOM DMI** | Australian Bureau of Meteorology / NOAA PSL | Dipole Mode Index (IOD monthly sea surface temperature gradient, °C) | Monthly authoritative value aligned to calendar dates within each respective month (strictly NOT native daily measurements) in `public.teleconnections_history` | HTTP GET `https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data` | **Active & Live** (1,877 monthly values ingested) |
| **3. BOM RMM MJO** | Australian Bureau of Meteorology | Wheeler-Hendon RMM1, RMM2, Phase (1–8), Amplitude ($\ge 0$) | Genuinely daily observations in `public.teleconnections_history` | HTTP GET `http://www.bom.gov.au/climate/mjo/graphics/rmm.74toRealtime.txt` | **Active & Live** (17,876 daily values ingested) |
| **4. CHIRPS** | UCSB Climate Hazards Center | High-resolution precipitation (0.05° grid, mm/day) | Daily, 214-day seasonal window & monthly reconciliation pass | HTTP GET GeoTIFF `https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/tifs/p05/` | **Active & Live** (0.05° GeoTIFFs decoded) |
| **5. ERA5 / ERA5-Land** | Copernicus Climate Change Service (ECMWF) | 2m max temp, total precipitation, volumetric soil moisture | 214-day seasonal series (2014–2025) & reanalysis reconciliation | Copernicus CDS API (`cdsapi` process `reanalysis-era5-land`) with documented ECMWF archive fallback | **Active & Live** (genuine seasonal archives ingested) |
| **6. NASA GPM IMERG** | NASA GES DISC / PMM | Early run precipitation (~4h lag for live buffer), Final run for reconciliation | Daily in `public.live_weather_buffer` | HTTPS with Earthdata Login via GES DISC cumulus protected endpoints | **Fail-Closed Verified** (requires user EULA authorization at `urs.earthdata.nasa.gov`) |
| **7. NASA SMAP** | NASA NSIDC DAAC | Soil moisture ($m^3/m^3$) converted to 0–100 wetness index | Daily in `public.live_weather_buffer` | HTTPS with Earthdata Login via NSIDC DAAC `SPL3SMP` Level-3 HDF5 granules | **Active & Live** (Authentic HDF5 downloaded & decoded) |
| **8. NOAA GFS / GEFS** | NOAA NCEP NOMADS | 2m max/min temperature, accumulated precipitation (APCP, mm) | Daily NWP operational forecast in `public.live_weather_buffer` | HTTP subregion GRIB2 filter (`https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl`) | **Active & Live** (0.25° GRIB2 subregion decoded) |
| **9. ECMWF Open Data** | ECMWF | 2m max/min temperature, surface precipitation | Daily NWP operational forecast in `public.live_weather_buffer` | Python client `ecmwf-opendata` / HTTPS Open Data index with Open-Meteo IFS mirror fallback | **Active & Live** (IFS 0.25° forecast extracted) |
| **10. IMD Gridded** | IMD NDC Pune | Ground-truth 0.25° rainfall & 0.5° temperature | Offline ground-truth validation | Binary `.grd` format requiring institutional registration with IMD Pune | **Gracefully Skipped** (clean `skipped_unconfigured` metadata; fail-closed) |

### Transformation & Packing Design

1. **Seasonal Array Packing (`pack_seasonal_archive`)**:
   - Fixed 214-day window: **1 April to 31 October** inclusive (identical duration across leap and non-leap years).
   - Cardinality constraint: Arrays must contain **exactly 214 elements**.
   - Storage scaling:
     - `rainfall_x10`: $mm \times 10$, smallint range `[0, 32767]`.
     - `max_temp_x10`: $^\circ C \times 10$, smallint range `[-500, 700]`.
     - `soil_moisture_idx`: Scaled integer wetness index `[0, 100]`.
     - `weather_state_code`: IMD operational monsoon state `[0: Normal, 1: Onset, 2: Active, 3: Break, 4: Heavy]`.
   - Deterministic unpacking: `unpack_seasonal_archive` preserves 0.1 precision.

2. **Rolling Live Weather Buffer (`pack_live_buffer_record`)**:
   - Stores up to 90 days of daily observations per block.
   - Provenance attribution tags: `NWP_FORECAST_GFS_ECMWF_CONSENSUS`, `GFS_ECMWF_REAL_CONSENSUS`, `NOAA_GFS_REAL`, `ECMWF_OPEN_DATA_DIRECT`, `CHIRPS_FINAL_RECONCILED`, `ECMWF_ERA5_REANALYSIS_ARCHIVE_FALLBACK`.
   - Clear distinction between NWP Forecast vs Direct Observation:
     * Numerical Weather Prediction (NWP) forecasts are marked `is_preliminary: true` with provenance `NWP_FORECAST_*`.
     * Direct satellite (SMAP, GPM) and reanalysis (ERA5) measurements are marked `is_preliminary: false`.
   - Automatic pruning: `prune_live_buffer_older_than(days=90)` removes records older than 90 days daily.

3. **Dedicated Nationwide Historical Backfill (`scripts/run_nationwide_historical_backfill.py`)**:
   - Target: 84,876 block-season archive rows (12 seasons: 2014–2025 across all 7,073 production blocks).
   - Operational Safety:
     * Checkpointed & resumable execution via `data/backfill_checkpoint.json`.
     * Startup reconciliation against `public.seasonal_archives` to prevent duplicate or missing records.
     * Partial-failure skip logging via `data/backfill_skipped_blocks.log` (any unavailable source data is skipped and logged; zero synthetic fabrication).
     * Bounded concurrency: multi-coordinate batches (10 blocks per batch) with 10.0s delay to respect upstream rate limits.
     * Dual endpoint routing: `historical-forecast-api.open-meteo.com/v1/forecast` (2016–2025) and `archive-api.open-meteo.com/v1/archive` (2014–2015).
     * Incremental upserts: every batch is immediately committed to Supabase.
   - Incremental Weekly Sync: `pipeline/jobs/weekly_sync.py` remains dedicated for ongoing weekly incremental reconciliation.

4. **Fail-Closed & Anti-Fabrication Principles**:
   - **Zero Synthetic Fallbacks**: When an official source fails or is unconfigured, the pipeline logs the failure and skips the record rather than fabricating numbers.
   - **Multi-Model Consensus**: When multiple NWP sources (GFS, ECMWF) are available, consensus mean is stored with explicit composite provenance tags.
   - **7,073 Production Restriction**: Weather records are strictly restricted to the 7,073 authoritative production blocks. The 250 pending blocks remain completely excluded.

5. **Verified Database Coverage Status**:
   - `historical_block_coverage`: 16/7,073 (with 6 representative blocks having 100% 12-season completeness).
   - `historical_block_season_rows`: 82 rows.
   - `season_year coverage`: [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] (12 seasons).
   - `live_weather_block_coverage`: 4,951/7,073 blocks (70.0% nationwide production coverage).
   - `live_weather_buffer rows`: 10,076 rows (all $\le 90$ days old, verified physically valid).
   - `teleconnection_date_coverage`: 4,595 dates (4,595 rows, 100% unique dates covering 2014-01-01 to 2026-07-31).


