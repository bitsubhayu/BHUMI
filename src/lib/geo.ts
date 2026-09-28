/**
 * BHUMI Geospatial & Block Boundary Serialization Utilities
 *
 * Implements safe GeoJSON serialization for MapLibre GL:
 * - Uses authentic PostGIS geometry (Polygon / MultiPolygon) from public.blocks.boundary_geom
 *   when present as a GeoJSON object or stringified JSON GeoJSON.
 * - Format Scope: Specifically consumes GeoJSON objects or JSON-encoded GeoJSON strings.
 *   This implementation does NOT parse raw WKT or EWKT strings.
 * - Fallback: If boundary_geom is missing, null, non-GeoJSON, or invalid, falls back to an
 *   authentic Point geometry at the block centroid coordinates [centroid_lon, centroid_lat].
 * - Administrative Boundary Integrity: Strictly avoids inventing synthetic administrative polygons or bounding boxes.
 */

import type { BlockRow, LivePredictionRow } from './supabase/types';

export interface BlockMapFeatureProperties {
  block_id: string;
  block_name: string;
  district_name: string;
  state_name: string;
  elevation_m: number | null;
  slope_deg: number | null;
  distance_to_coast_km: number | null;
  agro_climatic_zone: string | null;
  // Dynamic weekly probabilities
  week_1_break: number | null;
  week_1_onset: number | null;
  week_1_heavy: number | null;
  week_2_break: number | null;
  week_2_onset: number | null;
  week_2_heavy: number | null;
  week_3_break: number | null;
  week_3_onset: number | null;
  week_3_heavy: number | null;
  week_4_break: number | null;
  week_4_onset: number | null;
  week_4_heavy: number | null;
  confidence: number | null;
  primary_driver: string | null;
  analog_year: number | null;
  is_experimental: boolean;
  representation: 'boundary_polygon' | 'centroid_fallback';
  is_centroid_fallback: boolean;
}

export type BlockGeometryResult = {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.Point;
  representation: 'boundary_polygon' | 'centroid_fallback';
  isCentroidFallback: boolean;
};

/**
 * Safely parses and serializes PostGIS boundary geometry if available.
 * Accepts GeoJSON Polygon or MultiPolygon objects or stringified JSON GeoJSON.
 * Does not parse raw WKT/EWKT strings; unparseable or missing geometries
 * fall back to a clearly labeled Point geometry at the block centroid coordinates
 * without inventing synthetic polygons.
 */
export function resolveBlockGeometry(block: BlockRow): BlockGeometryResult {
  const rawGeom = block.boundary_geom;

  if (rawGeom) {
    let geomObj: unknown = rawGeom;
    if (typeof rawGeom === 'string' && rawGeom.trim().startsWith('{')) {
      try {
        geomObj = JSON.parse(rawGeom);
      } catch {
        geomObj = null;
      }
    }

    if (
      geomObj &&
      typeof geomObj === 'object' &&
      'type' in geomObj &&
      'coordinates' in geomObj &&
      Array.isArray((geomObj as { coordinates: unknown }).coordinates)
    ) {
      const gType = (geomObj as { type: string }).type;
      if (gType === 'Polygon' || gType === 'MultiPolygon') {
        return {
          geometry: geomObj as GeoJSON.Polygon | GeoJSON.MultiPolygon,
          representation: 'boundary_polygon',
          isCentroidFallback: false,
        };
      }
    }
  }

  // Authoritative fallback: Point representation at centroid coordinates
  return {
    geometry: {
      type: 'Point',
      coordinates: [block.centroid_lon, block.centroid_lat],
    },
    representation: 'centroid_fallback',
    isCentroidFallback: true,
  };
}

/**
 * Transforms blocks and their latest predictions into a GeoJSON FeatureCollection
 * for high-performance rendering in MapLibre GL.
 */
export function buildBlockGeoJSON(
  blocks: BlockRow[],
  predictions: LivePredictionRow[]
): GeoJSON.FeatureCollection<GeoJSON.Geometry, BlockMapFeatureProperties> {
  const predByBlockAndLead: Record<string, Record<string, LivePredictionRow>> = {};

  for (const p of predictions) {
    if (!predByBlockAndLead[p.block_id]) {
      predByBlockAndLead[p.block_id] = {};
    }
    // Only store if not already set for that lead bucket
    if (!predByBlockAndLead[p.block_id][p.lead_time_bucket]) {
      predByBlockAndLead[p.block_id][p.lead_time_bucket] = p;
    }
  }

  const features: GeoJSON.Feature<GeoJSON.Geometry, BlockMapFeatureProperties>[] = [];

  for (const block of blocks) {
    const bId = block.block_id;
    const leads = predByBlockAndLead[bId] || {};
    const w1 = leads.week_1;
    const w2 = leads.week_2;
    const w3 = leads.week_3;
    const w4 = leads.week_4;

    const { geometry, representation, isCentroidFallback } = resolveBlockGeometry(block);

    const properties: BlockMapFeatureProperties = {
      block_id: block.block_id,
      block_name: block.block_name,
      district_name: block.district_name,
      state_name: block.state_name,
      elevation_m: block.elevation_m,
      slope_deg: block.slope_deg,
      distance_to_coast_km: block.distance_to_coast_km,
      agro_climatic_zone: block.agro_climatic_zone,
      week_1_break: w1?.break_probability ?? null,
      week_1_onset: w1?.onset_probability ?? null,
      week_1_heavy: w1?.heavy_spell_probability ?? null,
      week_2_break: w2?.break_probability ?? null,
      week_2_onset: w2?.onset_probability ?? null,
      week_2_heavy: w2?.heavy_spell_probability ?? null,
      week_3_break: w3?.break_probability ?? null,
      week_3_onset: w3?.onset_probability ?? null,
      week_3_heavy: w3?.heavy_spell_probability ?? null,
      week_4_break: w4?.break_probability ?? null,
      week_4_onset: w4?.onset_probability ?? null,
      week_4_heavy: w4?.heavy_spell_probability ?? null,
      confidence: w1?.calibrated_confidence ?? null,
      primary_driver: w1?.primary_driver ?? null,
      analog_year: w1?.teleconnection_analog_year ?? null,
      is_experimental: Boolean(w1?.primary_driver?.includes('[EXPERIMENTAL]')),
      representation,
      is_centroid_fallback: isCentroidFallback,
    };

    features.push({
      type: 'Feature',
      geometry,
      properties,
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
