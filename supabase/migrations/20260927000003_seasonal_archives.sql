-- Migration: 20260927000003_seasonal_archives.sql
-- Description: Compact historical archive using array-packed season rows (TECH_STACK.md §3).
-- Avoids the naive daily-row trap (250 MB/yr) by packing 214 days (1 Apr - 31 Oct) into smallint[] arrays.
-- Consumes ~1.8 KB per block-year (~12 MB/year nationwide), leaving 55% headroom in 500 MB budget.

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
