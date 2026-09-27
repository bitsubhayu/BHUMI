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
