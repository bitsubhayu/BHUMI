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
import { getSupabaseServerClient } from './supabase/server.ts';
import type {
  BlockRow,
  LivePredictionRow,
  LiveWeatherBufferRow,
  TeleconnectionsHistoryRow,
} from './supabase/types.ts';

import {
  type ModelMetadata,
  FALLBACK_MODEL_METADATA,
  parseModelMetadata,
} from './metadata.ts';

export * from './metadata.ts';

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
      return parseModelMetadata(parsed);
    }
  } catch (err) {
    console.warn('[BHUMI Data] Could not read local metadata.json, using neutral fallback:', err);
  }

  return FALLBACK_MODEL_METADATA;
}


/**
 * Fetches all registered administrative blocks from public.blocks with robust pagination.
 */
export async function getBlocks(): Promise<BlockRow[]> {
  const supabase = getSupabaseServerClient(false);
  if (!supabase) {
    return [];
  }

  try {
    const allBlocks: BlockRow[] = [];
    const pageSize = 1000;
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from('blocks')
        .select('*')
        .order('state_name', { ascending: true })
        .order('district_name', { ascending: true })
        .order('block_name', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.warn('[BHUMI Data] Failed to query public.blocks:', error.message);
        if (offset === 0) return [];
        throw error;
      }

      if (!data || data.length === 0) {
        break;
      }

      allBlocks.push(...(data as BlockRow[]));
      if (data.length < pageSize) {
        break;
      }
      offset += data.length;
    }

    return allBlocks;
  } catch (err) {
    console.warn('[BHUMI Data] Exception querying blocks:', err);
    return [];
  }
}

/**
 * Fetches latest predictions from public.live_predictions for the current prediction cycle.
 */
export async function getLivePredictions(blockId?: string): Promise<LivePredictionRow[]> {
  const supabase = getSupabaseServerClient(false);
  if (!supabase) {
    return [];
  }

  try {
    // 1. Find the latest prediction_date to scope the query and prevent fetching all historical rows
    const { data: latestDateData } = await supabase
      .from('live_predictions')
      .select('prediction_date')
      .order('prediction_date', { ascending: false })
      .limit(1);

    const latestDate = (latestDateData as Array<{ prediction_date: string }> | null)?.[0]?.prediction_date;

    const allPredictions: LivePredictionRow[] = [];
    const pageSize = 1000;
    let offset = 0;

    while (true) {
      let query = supabase
        .from('live_predictions')
        .select('*')
        .order('prediction_date', { ascending: false })
        .order('lead_time_bucket', { ascending: true });

      if (latestDate) {
        query = query.eq('prediction_date', latestDate);
      }

      if (blockId) {
        query = query.eq('block_id', blockId);
      }

      const { data, error } = await query.range(offset, offset + pageSize - 1);
      if (error) {
        console.warn('[BHUMI Data] Failed to query public.live_predictions:', error.message);
        if (offset === 0) return [];
        throw error;
      }

      if (!data || data.length === 0) {
        break;
      }

      allPredictions.push(...(data as LivePredictionRow[]));
      if (data.length < pageSize) {
        break;
      }
      offset += data.length;
    }

    return allPredictions;
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

export * from './geo.ts';


