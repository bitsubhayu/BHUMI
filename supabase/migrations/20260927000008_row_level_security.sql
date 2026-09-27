-- Migration: 20260927000008_row_level_security.sql
-- Description: Row Level Security (RLS) enforcement.
-- Public/client connections get read-only access where appropriate.
-- Ingestion/write operations require privileged service_role credentials.
-- Never exposes service_role credentials to the client.

-- Enable Row Level Security on all tables
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_weather_buffer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teleconnections_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisory_rules ENABLE ROW LEVEL SECURITY;

-- 1. BLOCKS: Public read-only; Service role full access
CREATE POLICY "Allow public read access on blocks"
    ON public.blocks FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service_role full access on blocks"
    ON public.blocks FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. SEASONAL ARCHIVES: Public read-only (for historical charts & calibration displays)
CREATE POLICY "Allow public read access on seasonal_archives"
    ON public.seasonal_archives FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service_role full access on seasonal_archives"
    ON public.seasonal_archives FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3. LIVE WEATHER BUFFER: Public read-only
CREATE POLICY "Allow public read access on live_weather_buffer"
    ON public.live_weather_buffer FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service_role full access on live_weather_buffer"
    ON public.live_weather_buffer FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 4. TELECONNECTIONS HISTORY: Public read-only
CREATE POLICY "Allow public read access on teleconnections_history"
    ON public.teleconnections_history FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service_role full access on teleconnections_history"
    ON public.teleconnections_history FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. LIVE PREDICTIONS: Public read-only (Frontend primary read target)
CREATE POLICY "Allow public read access on live_predictions"
    ON public.live_predictions FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service_role full access on live_predictions"
    ON public.live_predictions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 6. ADVISORY RULES: Public read-only
CREATE POLICY "Allow public read access on advisory_rules"
    ON public.advisory_rules FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow service_role full access on advisory_rules"
    ON public.advisory_rules FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
