-- Migration: 20260927000002_core_blocks_and_terrain.sql
-- Description: Core administrative block boundaries and static terrain features (TECH_STACK.md §3).
--
-- ARCHITECTURAL DECISION:
-- Panchayat-level data is NEVER stored permanently (~250,000 panchayats vs ~6,700 blocks would
-- multiply rows by 37x and exceed the 500 MB limit). Instead, panchayat values are computed
-- on-demand at serve-time from the parent block values + static terrain features (elevation, slope).

-- Table: blocks
-- Master table for all ~6,700 administrative blocks in India.
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

-- Spatial and B-tree indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_blocks_boundary_geom ON public.blocks USING GIST (boundary_geom);
CREATE INDEX IF NOT EXISTS idx_blocks_centroid ON public.blocks (centroid_lat, centroid_lon);
CREATE INDEX IF NOT EXISTS idx_blocks_state_district ON public.blocks (state_name, district_name);
CREATE INDEX IF NOT EXISTS idx_blocks_name ON public.blocks (block_name);
