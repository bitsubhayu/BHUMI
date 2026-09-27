# BHUMI — Block-level Hydro-meteorological Updates for Micro-climate Intelligence

> **SIH 2026 Problem Statement 26086**: Hyperlocal Monsoon Onset & Break Prediction System (Block/Village Scale)  
> **Organization**: Ministry of Earth Sciences (MoES) / National Centre for Medium Range Weather Forecasting (NCMRWF)  
> **Repository**: [github.com/bitsubhayu/BHUMI](https://github.com/bitsubhayu/BHUMI)

---

## 1. What is BHUMI?

Macro-scale monsoon forecasts often miss what decides Kharif crop survival: whether a **specific block** experiences a false onset, an extended dry break, or a revival window worth re-sowing for.

**BHUMI** translates global climate teleconnections (ENSO, IOD, MJO) into a block- and panchayat-level probability of:
1. **Monsoon Onset Window**
2. **Prolonged Dry Breaks**
3. **Heavy-Rain Spells**

over four weekly lead-time buckets (Week 1–4). These probabilities drive plain-language, ICAR/KVK-seeded agronomic recommendations delivered in regional languages.

---

## 2. Technical Architecture Overview

BHUMI is designed under strict operational constraints: **Vercel Free Tier**, **Supabase 500 MB budget**, and **₹0 recurring operational cost**.

### Core Architecture Principle:
> **"Vercel Serves, GitHub Actions Computes."**  
> Nothing expensive or computationally heavy runs in the user HTTP request path. Daily satellite ingestion, downscaling ML models, and calibrated probability calculations occur once daily (06:00 IST) on a free GitHub Actions runner and populate a compact Supabase table. The Next.js frontend only ever executes fast, read-only queries against precomputed rows.

### Compact Storage Architecture (500 MB Budget Enforced):
- Avoids the naive daily row-per-block trap (which consumes ~250 MB/year).
- Employs **one row per block per season** with compact scaled integer arrays (`smallint[214]` covering 1 Apr – 31 Oct), consuming only **~12 MB/year** for all ~6,700 blocks in India.
- 12 seasons of history (2014–2025) take ~145 MB, leaving **~55% headroom** for geometries and live buffers.
- **Panchayat-level data is never stored historically**: it is computed on-demand via static terrain adjustments (elevation/slope downscaling).

```
┌────────────────────────────────┐
│ Free Data Sources              │
│ (IMD, ERA5, CHIRPS, GPM, NOAA) │
└───────────────┬────────────────┘
                │ Scheduled Daily & Weekly Jobs
                ▼
┌────────────────────────────────┐
│ GitHub Actions Runner (Python) │
│ - Analog Ensemble (ENSO/IOD)   │
│ - LightGBM/XGBoost Downscale   │
│ - Platt Calibration Layer      │
└───────────────┬────────────────┘
                │ Writes Precomputed Probabilities
                ▼
┌────────────────────────────────┐
│ Supabase (Postgres + PostGIS)  │
│ - Compact Season Archives      │
│ - 90-Day Rolling Live Buffer   │
│ - Simplified Block Geometries  │
└───────────────┬────────────────┘
                │ Fast Read-Only Queries (<100ms)
                ▼
┌────────────────────────────────┐
│ Next.js 16 (App Router/Vercel) │
│ - MapLibre GL JS + OSM / CARTO │
│ - shadcn/ui + Tailwind CSS     │
│ - Bhashini Multilingual UI     │
└────────────────────────────────┘
```

---

## 3. What is Implemented in Step 1

Step 1 establishes the **complete, production-ready frontend foundation and architectural scaffolding**:

- [x] **Next.js 16 (App Router) + TypeScript 5 (Strict Mode)** initialized.
- [x] **Tailwind CSS v4 + shadcn/ui** design system configured with custom responsive components.
- [x] **Core Frontend Dependencies**:
  - `maplibre-gl` & `@types/geojson` installed for vector/raster geospatial rendering.
  - `@supabase/supabase-js` installed with full TypeScript schema types.
  - `motion` installed for hardware-accelerated animations.
  - `lucide-react` for iconography.
- [x] **Environment Variable Management**:
  - `.env.example` created with variable names only (no credentials/fake secrets).
  - `src/lib/env.ts` provides safe, graceful handling of missing environment variables.
- [x] **Supabase Client Architecture**:
  - Browser (`src/lib/supabase/client.ts`) and Server (`src/lib/supabase/server.ts`) clients.
  - Graceful fallback: handles missing database credentials during local development without crashing.
  - Storage types (`src/lib/supabase/types.ts`) matching `TECH_STACK.md` §3.
- [x] **Domain Types & Configuration**:
  - Meteorological domain types (`src/types/weather.ts`)
  - Calibrated risk and explainability types (`src/types/risk.ts`)
  - Agronomic advisory types (`src/types/advisory.ts`)
  - Administrative hierarchy & GeoJSON types (`src/types/geo.ts`)
  - Regional language configuration (`src/config/languages.ts`)
- [x] **Application Shell**:
  - `Navbar`: Official branding, navigation links, and regional language selector.
  - `SystemStatusBanner`: Real-time detection of environment configuration mode.
  - `OverviewStats`: Nationwide coverage, lead-time horizon, storage budget cards.
  - `MapContainerPlaceholder`: Interactive MapLibre GL JS visualizer shell with lead-time tabs (Week 1–4), risk layer toggles, and block search.
  - `RiskLegend`: Accessible 5-tier calibrated probability scale.
  - `ExplainabilityPreview`: Dominant physical teleconnection drivers breakdown.
  - `AdvisoryShell`: ICAR/KVK threshold rule cards with Bhashini multilingual framework.
  - `ArchitectureOverview`: In-depth breakdown of the ₹0 serverless architecture.
  - `Footer`: Official MoES / NCMRWF context and governance attributions.

- [x] **Step 2 (Database & PostGIS Foundation)**:
  - PostGIS extension configuration (`20260927000001_enable_postgis.sql`).
  - Core administrative blocks with terrain features (`20260927000002_core_blocks_and_terrain.sql`).
  - Compact seasonal archive schema with 214-day scaled integer arrays (`20260927000003_seasonal_archives.sql`).
  - 90-day rolling observation buffer (`20260927000004_live_weather_buffer.sql`).
  - 40+ years ENSO/IOD/MJO teleconnections history (`20260927000005_teleconnections_history.sql`).
  - Precomputed weekly block risk predictions and physical drivers (`20260927000006_live_predictions_and_explainability.sql`).
  - ICAR/KVK agronomic advisory rules and multilingual templates (`20260927000007_advisory_rules.sql`).
  - Row Level Security (RLS) policies across all tables (`20260927000008_row_level_security.sql`).
  - Combined schema for direct SQL editor execution (`supabase/schema.sql`).
  - Full TypeScript types for Supabase clients (`src/lib/supabase/types.ts`).
  - Automated remote verification script (`npm run db:verify`).
  - Panchayat architectural decision enforced: permanent panchayat records are explicitly NOT stored; downscaling is computed on demand at serve time.

---

## 4. What Remains for Later Steps

The following modules are **explicitly reserved for subsequent phases** per `PRD.md` and `TECH_STACK.md`:

- **Phase 1 / Step 3 (Data Pipeline & Ingestion Scripts)**:
  - IMD gridded data ingestion scripts (`imddata`)
  - ERA5 / ERA5-Land Copernicus CDS API scripts
  - CHIRPS and NASA GPM IMERG automated downloaders
  - NOAA ONI, BOM DMI, BOM RMM index parsers
- **Phase 2 / Step 3 (Downscaling ML & Calibration)**:
  - Analog ensemble model implementation
  - LightGBM / XGBoost downscaling pipeline
  - Platt / Isotonic calibration layer
  - Historical backtesting against IMD onset/break records
- **Phase 3 / Step 4 (Interactive Map & Live Data Integration)**:
  - MapLibre GL JS live polygon and tile rendering
  - On-demand Panchayat BCSD terrain downscaling endpoint
  - Supabase live prediction queries
- **Phase 4 / Step 5 (Advisory Engine & Multilingual Delivery)**:
  - Dynamic ICAR/KVK rule execution
  - Bhashini API integration for real-time translation of advisory templates
- **Phase 5 / Step 6 (Automation & Pipeline Scheduling)**:
  - GitHub Actions cron workflows (`06:00 IST` daily live inference and weekly archive sync)
  - Future scope: WhatsApp pull-bot gateway (customer-initiated messaging)

---

## 5. Environment Variables

All configuration is controlled via environment variables. See [`.env.example`](./.env.example) for the full list of required variable names.

Copy the template to initialize your local development environment:

```bash
cp .env.example .env.local
```

### Key Variable Groups:
| Variable Name | Environment | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client & Server | Supabase project URL for PostgREST & PostGIS queries |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client & Server | Supabase public anonymous API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server Only | Secret service-role key for backend operations |
| `BHASHINI_API_KEY` | Server Only | Bhashini developer API key for regional translations |
| `BHASHINI_USER_ID` | Server Only | Bhashini user identifier |
| `BHASHINI_PIPELINE_ID` | Server Only | Bhashini translation pipeline ID |
| `CDSAPI_URL` & `CDSAPI_KEY` | Actions Only | Copernicus Climate Data Store credentials (ERA5) |
| `EARTHDATA_USERNAME` & `_PASSWORD` | Actions Only | NASA Earthdata credentials (GPM IMERG, SMAP) |

> **Note**: The application starts and runs locally even if these variables are blank, automatically entering **Local Foundation Mode**.

---

## 6. How to Install and Run Locally

### Prerequisites:
- **Node.js**: `v20+` (Tested on Node `v24.15.0`)
- **npm**: `v10+`

### Installation:
```bash
# Navigate to the project root
cd Antigravity_Workspace/BHUMI

# Install dependencies
npm install
```

### Running Locally (Development Server):
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Typecheck & Linting:
```bash
# Run ESLint
npm run lint

# Run Next.js production build & typecheck
npm run build
```

### Production Preview:
```bash
npm run start
```

### Python Data Pipeline:
```bash
# Install pipeline dependencies
pip install -r pipeline/requirements.txt

# Run pipeline integrity and validation tests
python -m unittest discover tests

# Run daily live sync in dry-run mode
python -m pipeline.jobs.daily_sync --dry-run --days 7

# Run weekly historical sync in dry-run mode
python -m pipeline.jobs.weekly_sync --dry-run --sample-only
```

---

## 7. Folder Structure

```
BHUMI/
├── .github/
│   └── workflows/
│       ├── daily-live-sync.yml      # Daily live buffer & teleconnections (06:00 IST)
│       └── weekly-historical-sync.yml # Weekly historical sync & reconciliation
├── docs/
│   ├── PRD.md                       # Product Requirements Document
│   ├── TECH_STACK.md                # Technical Architecture Document
│   ├── DATABASE_ARCHITECTURE.md     # PostGIS & 500 MB compact schema reference
│   └── DATA_PIPELINE.md             # Meteorological ingestion & source adapters
├── pipeline/                        # Python Data Ingestion Engine
│   ├── jobs/                        # Orchestrator scripts (daily_sync, weekly_sync)
│   ├── loaders/                     # Idempotent Supabase PostgREST batch loader
│   ├── sources/                     # Source adapters (NOAA, BOM, CHIRPS, ERA5, GPM, SMAP, GFS, ECMWF, IMD)
│   ├── transforms/                  # Geospatial mapping, weather state, 214-day array packing
│   ├── utils/                       # Configuration, structured logger, validation
│   ├── requirements.txt             # Pipeline Python dependencies
│   └── README.md                    # Pipeline documentation
├── tests/                           # Pipeline & schema test suite (unittest)
├── src/
│   ├── app/
│   │   ├── favicon.ico
│   │   ├── globals.css              # Tailwind CSS v4 & theme variables
│   │   ├── layout.tsx               # Root layout & BHUMI metadata
│   │   └── page.tsx                 # Application shell dashboard
│   ├── components/                  # UI, Map, Advisory, and Dashboard components
│   ├── config/                      # Site metadata & regional languages
│   ├── lib/                         # Utilities, env validator, Supabase client
│   └── types/                       # Domain TypeScript models
├── supabase/
│   ├── migrations/                  # Sequential SQL migration files
│   └── schema.sql                   # Consolidated PostgreSQL + PostGIS schema
├── scripts/
│   └── verify_remote.mjs            # Remote Supabase verification script
├── .env.example                     # Variable names template
├── package.json                     # Project manifest & scripts
└── README.md                        # Documentation
```

---

## 8. License

Developed under Smart India Hackathon (SIH 2026) for the Ministry of Earth Sciences (MoES) / NCMRWF. All rights reserved.
