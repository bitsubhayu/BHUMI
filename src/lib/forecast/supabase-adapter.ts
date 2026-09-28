/**
 * BHUMI Supabase Forecast Repository Adapter — stub
 *
 * Wire this up once the pipeline tables exist and NEXT_PUBLIC_USE_MOCK_DATA=false.
 * Uses plain fetch to Supabase PostgREST (smaller than the SDK in the browser bundle).
 * Read-only: only the anon key is ever used here.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */

import type {
  ForecastRepository,
  ForecastMeta,
  Region,
  RegionRisk,
  Advisory,
  Crop,
  LeadWeek,
  RegionFeatureProperties,
} from './types';
import type { GeoJSON } from 'geojson';

export const supabaseRepository: ForecastRepository = {
  getMeta(): Promise<ForecastMeta> {
    throw new Error('Not implemented: wire after pipeline tables exist');
  },
  listRegions(_parentId: string | null): Promise<Region[]> {
    throw new Error('Not implemented: wire after pipeline tables exist');
  },
  searchRegions(_query: string, _limit?: number): Promise<Region[]> {
    throw new Error('Not implemented: wire after pipeline tables exist');
  },
  getRegionsGeoJSON(
    _parentId: string | null,
  ): Promise<GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, RegionFeatureProperties>> {
    throw new Error('Not implemented: wire after pipeline tables exist');
  },
  getRisk(_regionId: string): Promise<RegionRisk> {
    throw new Error('Not implemented: wire after pipeline tables exist');
  },
  getAdvisory(_regionId: string, _crop: Crop, _week: LeadWeek): Promise<Advisory> {
    throw new Error('Not implemented: wire after pipeline tables exist');
  },
};
