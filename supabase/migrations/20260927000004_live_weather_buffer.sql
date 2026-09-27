-- Migration: 20260927000004_live_weather_buffer.sql
-- Description: Rolling 90-day live weather buffer for short-term daily observations and model feature feeding (~30 MB).

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
