-- ==============================================================================
-- BHUMI — Full Database & PostGIS Schema
-- B-H-U-M-I: Block-level Hydro-meteorological Updates for Micro-climate Intelligence
-- SIH 2026 Problem Statement 26086 | MoES / NCMRWF
--
-- Storage Budget Target: 500 MB (Supabase Postgres + PostGIS)
-- Architecture Reference: TECH_STACK.md §2 & §3
--
-- ARCHITECTURAL DECISION ON PANCHAYATS:
-- Permanent panchayat-level historical/forecast records are explicitly NOT stored.
-- ~250,000 panchayats vs ~6,700 blocks would cause a 37x multiplier and exceed 500 MB.
-- Panchayat values are computed on demand at serve-time from parent block data + terrain features.
-- ==============================================================================

-- 1. Enable PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Administrative Blocks Table with Static Terrain Features
CREATE TABLE IF NOT EXISTS public.blocks (
    block_id VARCHAR(50) PRIMARY KEY, -- Local Government Directory (LGD) block code
    block_name VARCHAR(150) NOT NULL,
    district_name VARCHAR(150) NOT NULL,
    state_name VARCHAR(150) NOT NULL,
    centroid_lat DOUBLE PRECISION NOT NULL CHECK (centroid_lat BETWEEN -90.0 AND 90.0),
    centroid_lon DOUBLE PRECISION NOT NULL CHECK (centroid_lon BETWEEN -180.0 AND 180.0),
    elevation_m REAL, -- Mean terrain elevation in meters (used for BCSD lapse-rate downscaling)
    slope_deg REAL CHECK (slope_deg >= 0.0), -- Mean terrain slope in degrees
    distance_to_coast_km REAL CHECK (distance_to_coast_km >= 0.0),
    agro_climatic_zone VARCHAR(100), -- ICAR agro-climatic zone classification
    boundary_geom geometry(MultiPolygon, 4326), -- Simplified geometry for fast map rendering and point-in-polygon
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_blocks_boundary_geom ON public.blocks USING GIST (boundary_geom);
CREATE INDEX IF NOT EXISTS idx_blocks_centroid ON public.blocks (centroid_lat, centroid_lon);
CREATE INDEX IF NOT EXISTS idx_blocks_state_district ON public.blocks (state_name, district_name);
CREATE INDEX IF NOT EXISTS idx_blocks_name ON public.blocks (block_name);

-- 3. Compact Seasonal Archives (One row per block-season, 214 days array-packed)
CREATE TABLE IF NOT EXISTS public.seasonal_archives (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    block_id VARCHAR(50) NOT NULL REFERENCES public.blocks(block_id) ON DELETE CASCADE,
    season_year SMALLINT NOT NULL CHECK (season_year BETWEEN 1950 AND 2100),
    season_start_date DATE NOT NULL DEFAULT '2024-04-01',
    season_end_date DATE NOT NULL DEFAULT '2024-10-31',
    rainfall_x10 smallint[] NOT NULL, -- Scaled daily rainfall (mm * 10), 214 elements
    max_temp_x10 smallint[] NOT NULL, -- Scaled daily maximum temperature (°C * 10), 214 elements
    soil_moisture_idx smallint[] NOT NULL, -- Scaled root-zone soil wetness index, 214 elements
    weather_state_code smallint[] NOT NULL, -- State classification (0: Normal, 1: Onset, 2: Active, 3: Break, 4: Heavy), 214 elements
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_seasonal_archives_block_year UNIQUE (block_id, season_year),
    CONSTRAINT chk_rainfall_cardinality CHECK (cardinality(rainfall_x10) = 214),
    CONSTRAINT chk_max_temp_cardinality CHECK (cardinality(max_temp_x10) = 214),
    CONSTRAINT chk_soil_moisture_cardinality CHECK (cardinality(soil_moisture_idx) = 214),
    CONSTRAINT chk_weather_state_cardinality CHECK (cardinality(weather_state_code) = 214)
);

CREATE INDEX IF NOT EXISTS idx_seasonal_archives_year ON public.seasonal_archives (season_year);
CREATE INDEX IF NOT EXISTS idx_seasonal_archives_block_year ON public.seasonal_archives (block_id, season_year);

-- 4. Rolling 90-Day Live Weather Buffer
CREATE TABLE IF NOT EXISTS public.live_weather_buffer (
    block_id VARCHAR(50) NOT NULL REFERENCES public.blocks(block_id) ON DELETE CASCADE,
    observation_date DATE NOT NULL,
    rainfall_mm REAL NOT NULL CHECK (rainfall_mm >= 0.0),
    max_temp_c REAL,
    min_temp_c REAL,
    soil_moisture_idx REAL CHECK (soil_moisture_idx >= 0.0 AND soil_moisture_idx <= 100.0),
    data_source VARCHAR(50) NOT NULL, -- 'IMD_GRIDDED', 'ERA5T', 'GPM_IMERG', 'GFS'
    is_preliminary BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (block_id, observation_date)
);

CREATE INDEX IF NOT EXISTS idx_live_weather_buffer_date ON public.live_weather_buffer (observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_live_weather_buffer_source ON public.live_weather_buffer (data_source);

-- 5. Historical & Live Climate Teleconnections (ENSO / IOD / MJO)
CREATE TABLE IF NOT EXISTS public.teleconnections_history (
    observation_date DATE PRIMARY KEY,
    enso_oni REAL, -- Oceanic Niño Index (-3.0 to +3.0) from NOAA CPC
    iod_dmi REAL, -- Indian Ocean Dipole Mode Index from BOM Australia
    mjo_phase SMALLINT CHECK (mjo_phase BETWEEN 1 AND 8), -- Real-time Multivariate MJO phase (1 to 8)
    mjo_amplitude REAL CHECK (mjo_amplitude >= 0.0), -- MJO amplitude
    source_agency VARCHAR(50) NOT NULL, -- 'NOAA_CPC', 'BOM_AU'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_teleconnections_date ON public.teleconnections_history (observation_date DESC);

-- 6. Live Block Predictions and Driver Explainability (Queried by Frontend)
CREATE TABLE IF NOT EXISTS public.live_predictions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    block_id VARCHAR(50) NOT NULL REFERENCES public.blocks(block_id) ON DELETE CASCADE,
    prediction_date DATE NOT NULL,
    lead_time_bucket VARCHAR(10) NOT NULL CHECK (lead_time_bucket IN ('week_1', 'week_2', 'week_3', 'week_4')),
    onset_probability REAL NOT NULL CHECK (onset_probability BETWEEN 0.0 AND 100.0),
    break_probability REAL NOT NULL CHECK (break_probability BETWEEN 0.0 AND 100.0),
    heavy_spell_probability REAL NOT NULL CHECK (heavy_spell_probability BETWEEN 0.0 AND 100.0),
    calibrated_confidence REAL NOT NULL CHECK (calibrated_confidence BETWEEN 0.0 AND 100.0),
    primary_driver TEXT NOT NULL, -- Dominant physical driver, e.g. "IOD negative + MJO phase 3"
    secondary_driver TEXT, -- Secondary physical factor, e.g. "Soil moisture wetness deficit < 20%"
    teleconnection_analog_year SMALLINT CHECK (teleconnection_analog_year BETWEEN 1950 AND 2100),
    advisory_code VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_live_predictions_block_date_bucket UNIQUE (block_id, prediction_date, lead_time_bucket)
);

CREATE INDEX IF NOT EXISTS idx_live_predictions_lookup ON public.live_predictions (block_id, prediction_date DESC);
CREATE INDEX IF NOT EXISTS idx_live_predictions_bucket ON public.live_predictions (prediction_date DESC, lead_time_bucket);
CREATE INDEX IF NOT EXISTS idx_live_predictions_break_risk ON public.live_predictions (prediction_date DESC, break_probability DESC);
CREATE INDEX IF NOT EXISTS idx_live_predictions_onset_prob ON public.live_predictions (prediction_date DESC, onset_probability DESC);

-- 7. Agronomic Advisory Rules (ICAR / KVK Thresholds & Multilingual Cache)
CREATE TABLE IF NOT EXISTS public.advisory_rules (
    rule_code VARCHAR(50) PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('safe_to_sow', 'delay_sowing', 'prepare_irrigation', 'drainage_alert', 'monitor_conditions')),
    crop_category VARCHAR(50) NOT NULL DEFAULT 'kharif_general',
    trigger_condition TEXT NOT NULL,
    english_title TEXT NOT NULL,
    english_recommendation TEXT NOT NULL,
    suggested_measures TEXT[] NOT NULL DEFAULT '{}',
    icar_reference_code VARCHAR(50),
    localized_templates JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_advisory_rules_action ON public.advisory_rules (action_type, is_active);
CREATE INDEX IF NOT EXISTS idx_advisory_rules_crop ON public.advisory_rules (crop_category);

-- 8. Row Level Security Policies
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_weather_buffer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teleconnections_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisory_rules ENABLE ROW LEVEL SECURITY;

-- Public read-only policies
CREATE POLICY "Allow public read access on blocks" ON public.blocks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow service_role full access on blocks" ON public.blocks FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read access on seasonal_archives" ON public.seasonal_archives FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow service_role full access on seasonal_archives" ON public.seasonal_archives FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read access on live_weather_buffer" ON public.live_weather_buffer FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow service_role full access on live_weather_buffer" ON public.live_weather_buffer FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read access on teleconnections_history" ON public.teleconnections_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow service_role full access on teleconnections_history" ON public.teleconnections_history FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read access on live_predictions" ON public.live_predictions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow service_role full access on live_predictions" ON public.live_predictions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read access on advisory_rules" ON public.advisory_rules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow service_role full access on advisory_rules" ON public.advisory_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
