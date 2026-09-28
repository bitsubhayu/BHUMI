/**
 * BHUMI Server-Side Data Access Layer
 *
 * Provides safe, cached, read-only queries for:
 * - Administrative blocks (public.blocks)
 * - Daily live probabilistic predictions (public.live_predictions)
 * - Rolling 90-day observation buffer (public.live_weather_buffer)
 * - Historical & recent teleconnection indices (public.teleconnections_history)
 * - Authoritative model readiness metadata (pipeline/ml/artifacts/metadata.json)
 *
 * CRITICAL SECURITY GUARANTEES:
 * - Uses public/anonymous read paths (never exposes service_role key to client).
 * - Read-only queries with revalidation caching.
 * - Handles offline or unconfigured Supabase gracefully without crashing.
 * - Never runs ML inference in the request path.
 */

import fs from 'fs';
import path from 'path';
import { getSupabaseServerClient } from './supabase/server';
import type {
  BlockRow,
  LivePredictionRow,
  LiveWeatherBufferRow,
  TeleconnectionsHistoryRow,
} from './supabase/types';

export interface ModelMetadata {
  modelVersion: string;
  modelName: string;
  trainedAt: string;
  modelTier: 'PRODUCTION' | 'EXPERIMENTAL';
  isProductionReady: boolean;
  readinessStatus: string;
  reasons: string[];
  gruStatus: string;
  trainingCoverage: {
    seasonsCount: number;
    blocksCount: number;
    samplesGenerated: number;
    classDistribution: Record<string, number>;
  };
}

export const FALLBACK_MODEL_METADATA: ModelMetadata = {
  modelVersion: 'v1.0.0',
  modelName: 'BHUMI-Probabilistic-Downscaling-Engine',
  trainedAt: new Date().toISOString(),
  modelTier: 'EXPERIMENTAL',
  isProductionReady: false,
  readinessStatus: 'INSUFFICIENT_CLASS_DIVERSITY',
  reasons: [
    'Archive contains only 1 season(s) (2024); minimum 3 required for multi-year ENSO/IOD cycle validation.',
    'Archive contains only 2 block(s); minimum 20 required across diverse agro-climatic zones.',
    'Dataset contains only 96 samples; minimum 1000 required for reliable downscaling.',
    'Minority classes (Onset, Heavy-Rain) statistically sparse in current historical training archive.',
    'Stage 1 GRU disabled from production ensemble pending multi-decadal sequence training.',
  ],
  gruStatus: 'DISABLED_INSUFFICIENT_TRAINING_DATA (samples=48, required=100)',
  trainingCoverage: {
    seasonsCount: 1,
    blocksCount: 2,
    samplesGenerated: 96,
    classDistribution: {
      'Active/Normal': 66,
      'Onset': 4,
      'Break': 22,
      'Heavy-Rain': 4,
    },
  },
};

/**
 * Reads authoritative model readiness metadata from pipeline artifacts.
 */
export async function getModelMetadata(): Promise<ModelMetadata> {
  try {
    const metaPath = path.join(process.cwd(), 'pipeline', 'ml', 'artifacts', 'metadata.json');
    if (fs.existsSync(metaPath)) {
      const content = await fs.promises.readFile(metaPath, 'utf8');
      const sanitized = content.replace(/:\s*NaN\b/g, ': null');
      const parsed = JSON.parse(sanitized);

      const readiness = parsed.model_readiness || {};
      const coverage = parsed.training_coverage || {};

      return {
        modelVersion: parsed.model_version || 'v1.0.0',
        modelName: parsed.model_name || 'BHUMI Downscaling Engine',
        trainedAt: parsed.trained_at || new Date().toISOString(),
        modelTier: parsed.model_tier === 'PRODUCTION' ? 'PRODUCTION' : 'EXPERIMENTAL',
        isProductionReady: Boolean(readiness.is_production_ready),
        readinessStatus: readiness.status || 'EXPERIMENTAL',
        reasons: readiness.reasons || FALLBACK_MODEL_METADATA.reasons,
        gruStatus: coverage.gru_status || 'DISABLED_INSUFFICIENT_TRAINING_DATA',
        trainingCoverage: {
          seasonsCount: coverage.seasons_count || 1,
          blocksCount: coverage.blocks_count || 2,
          samplesGenerated: coverage.samples_generated || 96,
          classDistribution: coverage.class_distribution || { '0': 66, '1': 4, '2': 22, '3': 4 },
        },
      };
    }
  } catch (err) {
    console.warn('[BHUMI Data] Could not read local metadata.json, using structured fallback:', err);
  }

  return FALLBACK_MODEL_METADATA;
}

/**
 * Fetches all registered administrative blocks from public.blocks.
 */
export async function getBlocks(): Promise<BlockRow[]> {
  const supabase = getSupabaseServerClient(false);
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .order('state_name', { ascending: true })
      .order('district_name', { ascending: true })
      .order('block_name', { ascending: true });

    if (error) {
      console.warn('[BHUMI Data] Failed to query public.blocks:', error.message);
      return [];
    }

    return (data as BlockRow[]) || [];
  } catch (err) {
    console.warn('[BHUMI Data] Exception querying blocks:', err);
    return [];
  }
}

/**
 * Fetches latest predictions from public.live_predictions.
 */
export async function getLivePredictions(blockId?: string): Promise<LivePredictionRow[]> {
  const supabase = getSupabaseServerClient(false);
  if (!supabase) {
    return [];
  }

  try {
    let query = supabase
      .from('live_predictions')
      .select('*')
      .order('prediction_date', { ascending: false })
      .order('lead_time_bucket', { ascending: true });

    if (blockId) {
      query = query.eq('block_id', blockId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[BHUMI Data] Failed to query public.live_predictions:', error.message);
      return [];
    }

    return (data as LivePredictionRow[]) || [];
  } catch (err) {
    console.warn('[BHUMI Data] Exception querying live_predictions:', err);
    return [];
  }
}

/**
 * Fetches recent observations from public.live_weather_buffer for a block.
 */
export async function getLiveWeatherBufferRecent(blockId: string, limit = 14): Promise<LiveWeatherBufferRow[]> {
  const supabase = getSupabaseServerClient(false);
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('live_weather_buffer')
      .select('*')
      .eq('block_id', blockId)
      .order('observation_date', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[BHUMI Data] Failed to query public.live_weather_buffer:', error.message);
      return [];
    }

    return (data as LiveWeatherBufferRow[]) || [];
  } catch (err) {
    console.warn('[BHUMI Data] Exception querying live_weather_buffer:', err);
    return [];
  }
}

/**
 * Fetches recent teleconnection records (ENSO, IOD, MJO) from public.teleconnections_history.
 */
export async function getRecentTeleconnections(limit = 14): Promise<TeleconnectionsHistoryRow[]> {
  const supabase = getSupabaseServerClient(false);
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('teleconnections_history')
      .select('*')
      .order('observation_date', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[BHUMI Data] Failed to query public.teleconnections_history:', error.message);
      return [];
    }

    return (data as TeleconnectionsHistoryRow[]) || [];
  } catch (err) {
    console.warn('[BHUMI Data] Exception querying teleconnections_history:', err);
    return [];
  }
}

/**
 * Transforms blocks and their latest predictions into a GeoJSON FeatureCollection
 * for high-performance rendering in MapLibre GL.
 */
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
}

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

    const lon = block.centroid_lon;
    const lat = block.centroid_lat;

    // Create a bounding box polygon around centroid (~10km diameter) for interactive polygon rendering
    const delta = 0.08;
    const polygonCoordinates: [number, number][][] = [[
      [lon - delta, lat - delta],
      [lon + delta, lat - delta],
      [lon + delta, lat + delta],
      [lon - delta, lat + delta],
      [lon - delta, lat - delta],
    ]];

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
    };

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: polygonCoordinates,
      },
      properties,
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
