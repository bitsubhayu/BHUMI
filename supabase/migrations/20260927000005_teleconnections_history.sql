-- Migration: 20260927000005_teleconnections_history.sql
-- Description: Historical and live global climate teleconnection indices (ENSO, IOD, MJO) across 40+ years (~1 MB).

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
