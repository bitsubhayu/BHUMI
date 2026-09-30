/**
 * BHUMI Forecast Data Types
 * This is the UI-side data contract. The backend must conform to this interface.
 * See docs/UI_DATA_CONTRACT.md for full specification.
 */

import type { GeoJSON } from 'geojson';

export type Hazard = 'onset' | 'dry_spell' | 'heavy_rain';
export type LeadWeek = 1 | 2 | 3 | 4;
export type Locale =
  | 'en'
  | 'hi'
  | 'mr'
  | 'te'
  | 'ta'
  | 'bn'
  | 'gu'
  | 'kn'
  | 'pa'
  | 'or';
export type Band = 'low' | 'moderate' | 'high' | 'very_high';
export type Verdict =
  | 'sow_now'
  | 'wait'
  | 'prepare_irrigation'
  | 'protect_from_rain'
  | 'switch_crop';
export type Crop = 'rice' | 'maize' | 'cotton' | 'soybean' | 'groundnut' | 'pulses';

export interface Region {
  id: string;
  name: string;
  level: 'state' | 'district' | 'block' | 'panchayat';
  parentId: string | null;
  centroid: [lng: number, lat: number];
  bbox: [minLng: number, minLat: number, maxLng: number, maxLat: number];
}

export interface Driver {
  key: string;
  labelByLocale: Record<Locale, string>;
  effect: 'raises' | 'lowers';
  strength: number; // 0..1
}

export interface RegionRisk {
  regionId: string;
  probabilities: Record<Hazard, Record<LeadWeek, number>>; // integers 0..100
  reliability: 'low' | 'medium' | 'high';
  drivers: Record<Hazard, Driver[]>;
  isEstimate: boolean; // true for panchayat-level values
  isAvailable?: boolean; // false when data/predictions are insufficient
  dataStatus?: 'available' | 'insufficient_history';
}

export interface Advisory {
  regionId: string;
  crop: Crop;
  week: LeadWeek;
  verdict: Verdict;
  textByLocale: Record<Locale, string>;
}

export interface ForecastMeta {
  issuedAt: string; // ISO 8601
  validFrom: string; // ISO 8601 — start of "Days 1–7"
  nextUpdateAt: string;
  isProductionReady?: boolean;
  modelTier?: 'PRODUCTION' | 'EXPERIMENTAL';
  trainingCoverage?: {
    seasonsCount: number;
    blocksCount: number;
    samplesGenerated: number;
  };
}

export type RegionFeatureProperties = {
  id: string;
  name: string;
} & Record<string, number | string | boolean | null>;

export type RegionFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.Point,
  RegionFeatureProperties
>;

export interface ForecastRepository {
  getMeta(): Promise<ForecastMeta>;
  listRegions(parentId: string | null): Promise<Region[]>;
  searchRegions(query: string, limit?: number): Promise<Region[]>;
  getRegionsGeoJSON(
    parentId: string | null,
  ): Promise<GeoJSON.FeatureCollection<RegionFeature['geometry'], RegionFeatureProperties>>;
  getRisk(regionId: string): Promise<RegionRisk>;
  getAdvisory(regionId: string, crop: Crop, week: LeadWeek): Promise<Advisory>;
}

/** Map a probability (0..100) to a Band */
export function toBand(probability: number): Band {
  if (probability < 25) return 'low';
  if (probability < 50) return 'moderate';
  if (probability < 75) return 'high';
  return 'very_high';
}

/** Risk ramp colors per hazard, 5 stops low→high */
export const RISK_COLORS: Record<Hazard, string[]> = {
  onset: ['#E3F3EE', '#B7DFD2', '#7CC4B0', '#3FA38E', '#13755F'],
  dry_spell: ['#FBEBCB', '#F6CF8A', '#EDA84A', '#D9762B', '#B0451C'],
  heavy_rain: ['#E2ECFA', '#B5CDF1', '#7DA4E4', '#4A73CC', '#2B449E'],
};

/** Get color for a probability value on a hazard ramp */
export function riskColor(hazard: Hazard, probability: number): string {
  const colors = RISK_COLORS[hazard];
  const idx = Math.min(Math.floor(probability / 20), 4);
  return colors[idx];
}

/** GeoJSON property key for a hazard+week combination */
export function riskKey(hazard: Hazard, week: LeadWeek): string {
  return `${hazard}_w${week}`;
}

/** Verdict display metadata */
export const VERDICT_META: Record<
  Verdict,
  { color: string; bgColor: string; icon: string }
> = {
  sow_now: { color: '#13755F', bgColor: '#E3F3EE', icon: '🌱' },
  wait: { color: '#101413', bgColor: '#FBEBCB', icon: '⏱' },
  prepare_irrigation: { color: '#2B449E', bgColor: '#E2ECFA', icon: '💧' },
  protect_from_rain: { color: '#2B449E', bgColor: '#E2ECFA', icon: '🌂' },
  switch_crop: { color: '#5B6764', bgColor: '#F7F6F2', icon: '🔄' },
};
