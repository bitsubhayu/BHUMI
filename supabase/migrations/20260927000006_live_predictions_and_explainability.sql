-- Migration: 20260927000006_live_predictions_and_explainability.sql
-- Description: Precomputed block-level probabilistic forecasts and explainability drivers.
-- Read-only table queried by the Next.js frontend; written daily by GitHub Actions inference job.

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
