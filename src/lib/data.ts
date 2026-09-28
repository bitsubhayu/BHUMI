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
    seasonsList?: number[];
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
    seasonsList: [2024],
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
          seasonsList: coverage.seasons_list || readiness.archive_summary?.seasons || [2024],
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

export * from './geo';


