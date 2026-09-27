-- Migration: 20260927000001_enable_postgis.sql
-- Description: Enable PostGIS extension for geospatial boundary indexing and spatial joins.

CREATE EXTENSION IF NOT EXISTS postgis;
