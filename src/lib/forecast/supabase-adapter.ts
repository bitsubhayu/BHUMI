/**
 * BHUMI Supabase Forecast Repository Adapter
 *
 * Implements the ForecastRepository interface against the real Supabase backend.
 * Uses public anonymous PostgREST access — zero service_role key exposure.
 */

import type {
  ForecastRepository,
  ForecastMeta,
  Region,
  RegionRisk,
  Advisory,
  Crop,
  LeadWeek,
  Hazard,
  Driver,
  Locale,
  Verdict,
  RegionFeatureProperties,
  RegionFeature,
} from './types';
import type { GeoJSON } from 'geojson';
import type {
  BlockRow,
  LivePredictionRow,
  AdvisoryRuleRow,
  LeadTimeBucket,
  AgronomicActionType,
} from '../supabase/types.ts';
import { getPublicEnv } from '../env.ts';
import { resolveBlockGeometry } from '../geo.ts';
import { evaluateAdvisoryRule, normalizeCropType } from '../advisory/engine.ts';
import { VERIFIED_ADVISORY_RULES } from '../advisory/rules.ts';
import { type ModelMetadata, FALLBACK_MODEL_METADATA, parseModelMetadata } from '../metadata.ts';

export const ALL_STEP6_LOCALES: Locale[] = [
  'en',
  'hi',
  'mr',
  'te',
  'ta',
  'bn',
  'gu',
  'kn',
  'pa',
  'or',
];

// In-memory cache
let cachedBlocks: BlockRow[] | null = null;
let cachedPredictions: LivePredictionRow[] | null = null;
let cachedRules: AdvisoryRuleRow[] | null = null;
let cachedMetadata: ModelMetadata | null = null;
let lastFetchTime = 0;
let lastMetaFetch = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

export function clearSupabaseAdapterCache(): void {
  cachedBlocks = null;
  cachedPredictions = null;
  cachedRules = null;
  cachedMetadata = null;
  lastFetchTime = 0;
  lastMetaFetch = 0;
}

/**
 * Loads authoritative model readiness metadata.
 * - Browser: fetches from existing server endpoint /api/readiness (never reads filesystem directly).
 * - Server/Node: reads pipeline/ml/artifacts/metadata.json via dynamic import (keeps fs server-only).
 * - Preserves legitimate zero values, reasons, and never invents fallback counts.
 */
export async function fetchAuthoritativeMetadata(): Promise<ModelMetadata> {
  const now = Date.now();
  if (cachedMetadata && now - lastMetaFetch < CACHE_TTL_MS) {
    return cachedMetadata;
  }

  // 1. Browser environment: use existing server data path (/api/readiness)
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/readiness');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.metadata) {
          cachedMetadata = json.metadata as ModelMetadata;
          lastMetaFetch = now;
          return cachedMetadata;
        }
      }
    } catch (err) {
      console.warn('[BHUMI Supabase Adapter] Could not fetch /api/readiness in browser:', err);
    }
  } else {
    // 2. Server-side or Node test environment: read pipeline/ml/artifacts/metadata.json
    try {
      const importDynamic = new Function('moduleName', 'return import(moduleName)');
      const fs = (await importDynamic('node:fs')) as typeof import('node:fs');
      const path = (await importDynamic('node:path')) as typeof import('node:path');
      const metaPath = path.join(process.cwd(), 'pipeline', 'ml', 'artifacts', 'metadata.json');
      if (fs.existsSync(metaPath)) {
        const content = await fs.promises.readFile(metaPath, 'utf8');
        const sanitized = content.replace(/:\s*NaN\b/g, ': null');
        const parsed = JSON.parse(sanitized);
        cachedMetadata = parseModelMetadata(parsed);
        lastMetaFetch = now;
        return cachedMetadata;
      }
    } catch {
      // In environment where fs is unavailable
    }
  }

  return FALLBACK_MODEL_METADATA;
}

async function fetchPostgrest<T>(path: string): Promise<T[]> {
  const { supabaseUrl, supabaseAnonKey, isConfigured } = getPublicEnv();
  if (!isConfigured || !supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const cleanUrl = supabaseUrl.replace(/\/+$/, '');
  const url = `${cleanUrl}/rest/v1/${path}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`[BHUMI Supabase Adapter] Fetch failed for ${path}: ${res.statusText}`);
      return [];
    }

    return (await res.json()) as T[];
  } catch (err) {
    console.warn(`[BHUMI Supabase Adapter] Network error querying ${path}:`, err);
    return [];
  }
}

async function getCachedBlocks(): Promise<BlockRow[]> {
  const now = Date.now();
  if (cachedBlocks && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedBlocks;
  }
  const rows = await fetchPostgrest<BlockRow>(
    'blocks?select=*&order=state_name.asc,district_name.asc,block_name.asc'
  );
  if (rows.length > 0) {
    cachedBlocks = rows;
    lastFetchTime = now;
  }
  return cachedBlocks ?? [];
}

async function getCachedPredictions(): Promise<LivePredictionRow[]> {
  const now = Date.now();
  if (cachedPredictions && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedPredictions;
  }
  const rows = await fetchPostgrest<LivePredictionRow>(
    'live_predictions?select=*&order=prediction_date.desc,lead_time_bucket.asc'
  );
  if (rows.length > 0) {
    cachedPredictions = rows;
  }
  return cachedPredictions ?? [];
}

async function getCachedRules(): Promise<AdvisoryRuleRow[]> {
  if (cachedRules && cachedRules.length > 0) {
    return cachedRules;
  }
  const rows = await fetchPostgrest<AdvisoryRuleRow>(
    'advisory_rules?select=*&is_active=eq.true&order=crop_category.asc,rule_code.asc'
  );
  if (rows.length > 0) {
    cachedRules = rows;
    return cachedRules;
  }
  return VERIFIED_ADVISORY_RULES;
}

export function computeGeometryBbox(
  geom: GeoJSON.Geometry,
  centroid: [number, number]
): [number, number, number, number] {
  if (geom.type === 'Polygon') {
    const coords = (geom as GeoJSON.Polygon).coordinates[0] || [];
    if (coords.length > 0) {
      let minLng = coords[0][0], maxLng = coords[0][0];
      let minLat = coords[0][1], maxLat = coords[0][1];
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      return [minLng, minLat, maxLng, maxLat];
    }
  } else if (geom.type === 'MultiPolygon') {
    const polys = (geom as GeoJSON.MultiPolygon).coordinates;
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (const poly of polys) {
      const ring = poly[0] || [];
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    if (Number.isFinite(minLng)) {
      return [minLng, minLat, maxLng, maxLat];
    }
  }

  // Fallback bbox around centroid
  const [lng, lat] = centroid;
  return [lng - 0.1, lat - 0.08, lng + 0.1, lat + 0.08];
}

function matchesState(parentId: string, stateName: string): boolean {
  const norm = parentId.trim().toLowerCase();
  const sNorm = stateName.trim().toLowerCase();
  return (
    norm === sNorm ||
    norm === `state:${sNorm}` ||
    norm === `state-${sNorm}`
  );
}

function matchesDistrict(parentId: string, stateName: string, districtName: string): boolean {
  const norm = parentId.trim().toLowerCase();
  const dNorm = districtName.trim().toLowerCase();
  const sNorm = stateName.trim().toLowerCase();
  return (
    norm === dNorm ||
    norm === `district:${sNorm}:${dNorm}` ||
    norm === `district-${sNorm}-${dNorm}` ||
    norm === `${sNorm}:${dNorm}` ||
    norm === `${sNorm}-${dNorm}`
  );
}

function actionToVerdict(action: AgronomicActionType | null | undefined): Verdict {
  switch (action) {
    case 'safe_to_sow':
      return 'sow_now';
    case 'delay_sowing':
      return 'wait';
    case 'prepare_irrigation':
      return 'prepare_irrigation';
    case 'drainage_alert':
      return 'protect_from_rain';
    case 'monitor_conditions':
    default:
      return 'wait';
  }
}

function buildDriverLocaleMap(
  enText: string,
  localized: Partial<Record<Locale, string>> = {}
): Record<Locale, string> {
  const result: Partial<Record<Locale, string>> = {};
  for (const loc of ALL_STEP6_LOCALES) {
    result[loc] = localized[loc] || enText;
  }
  return result as Record<Locale, string>;
}

function buildDriversForHazard(
  pred: LivePredictionRow | undefined,
  hazard: Hazard
): Driver[] {
  if (!pred) return [];
  const drivers: Driver[] = [];

  const prob =
    hazard === 'onset'
      ? pred.onset_probability
      : hazard === 'dry_spell'
        ? pred.break_probability
        : pred.heavy_spell_probability;

  if (pred.primary_driver) {
    const raw = pred.primary_driver;
    drivers.push({
      key: 'primary_driver',
      labelByLocale: buildDriverLocaleMap(raw),
      effect: prob >= 50 ? 'raises' : 'lowers',
      strength: Math.min(1, Math.max(0.2, (pred.calibrated_confidence || 75) / 100)),
    });
  }

  if (pred.secondary_driver) {
    const rawSec = pred.secondary_driver;
    drivers.push({
      key: 'secondary_driver',
      labelByLocale: buildDriverLocaleMap(rawSec),
      effect: prob >= 40 ? 'raises' : 'lowers',
      strength: 0.65,
    });
  }

  if (pred.teleconnection_analog_year) {
    const yr = pred.teleconnection_analog_year;
    drivers.push({
      key: 'analog_year',
      labelByLocale: buildDriverLocaleMap(
        `Historical analog match to ${yr} monsoon pattern`,
        {
          hi: `${yr} मानसून पैटर्न से ऐतिहासिक अनुरूपता`,
          bn: `${yr} মৌসুমী বায়ু ধরনের ঐতিহাসিক অনুরূপता`,
          mr: `${yr} मान्सून पॅटर्नशी ऐतिहासिक साम्य`,
          te: `${yr} రుతుపవన నమూనాకు చారిత్రక సారూప్యత`,
          ta: `${yr} பருவமழை அமைப்புடன் வரலாற்று ஒப்புமை`,
          gu: `${yr} ચોમાસાની પેટર્ન સાથે ઐતિહાસિક સમાનતા`,
          kn: `${yr} ಮುಂಗಾರು ಮಾದರಿಗೆ ಐತಿಹಾಸಿಕ ಹೋಲಿಕೆ`,
          pa: `${yr} ਮੌਨਸੂਨ ਪੈਟਰਨ ਨਾਲ ਇਤਿਹਾਸਕ ਸਮਾਨਤਾ`,
          or: `${yr} ମୌସୁମୀ ପ୍ୟାଟର୍ଣ୍ଣ ସହିତ ଐତିହାସିକ ସମାନତା`,
        }
      ),
      effect: 'raises',
      strength: 0.5,
    });
  }

  return drivers;
}

export const supabaseRepository: ForecastRepository = {
  async getMeta(): Promise<ForecastMeta> {
    const preds = await getCachedPredictions();
    const latestPred = preds[0];
    const authorMeta = await fetchAuthoritativeMetadata();

    const now = new Date();
    let validFromStr = now.toISOString();
    let issuedAtStr = now.toISOString();

    if (latestPred?.prediction_date) {
      const predDate = new Date(latestPred.prediction_date);
      predDate.setHours(0, 0, 0, 0);
      validFromStr = predDate.toISOString();
    }

    if (latestPred?.created_at) {
      issuedAtStr = new Date(latestPred.created_at).toISOString();
    } else if (authorMeta.trainedAt) {
      issuedAtStr = new Date(authorMeta.trainedAt).toISOString();
    }

    const nextUpdate = new Date(validFromStr);
    nextUpdate.setDate(nextUpdate.getDate() + 1);
    nextUpdate.setHours(6, 0, 0, 0);

    return {
      issuedAt: issuedAtStr,
      validFrom: validFromStr,
      nextUpdateAt: nextUpdate.toISOString(),
      isProductionReady: authorMeta.isProductionReady,
      modelTier: authorMeta.modelTier,
      trainingCoverage: {
        seasonsCount: authorMeta.trainingCoverage.seasonsCount,
        blocksCount: authorMeta.trainingCoverage.blocksCount,
        samplesGenerated: authorMeta.trainingCoverage.samplesGenerated,
      },
    };
  },

  async listRegions(parentId: string | null): Promise<Region[]> {
    const blocks = await getCachedBlocks();
    if (blocks.length === 0) return [];

    // Root level: Return distinct States
    if (!parentId) {
      const stateMap = new Map<string, { lons: number[]; lats: number[] }>();
      for (const b of blocks) {
        if (!stateMap.has(b.state_name)) {
          stateMap.set(b.state_name, { lons: [], lats: [] });
        }
        const entry = stateMap.get(b.state_name)!;
        entry.lons.push(b.centroid_lon);
        entry.lats.push(b.centroid_lat);
      }

      const states: Region[] = [];
      for (const [stateName, coords] of stateMap.entries()) {
        const avgLon = coords.lons.reduce((a, c) => a + c, 0) / coords.lons.length;
        const avgLat = coords.lats.reduce((a, c) => a + c, 0) / coords.lats.length;
        const minLng = Math.min(...coords.lons) - 0.5;
        const maxLng = Math.max(...coords.lons) + 0.5;
        const minLat = Math.min(...coords.lats) - 0.5;
        const maxLat = Math.max(...coords.lats) + 0.5;

        states.push({
          id: stateName,
          name: stateName,
          level: 'state',
          parentId: null,
          centroid: [avgLon, avgLat],
          bbox: [minLng, minLat, maxLng, maxLat],
        });
      }

      return states.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Check if parentId matches a State -> return Districts in that State
    const matchingStateBlocks = blocks.filter((b) => matchesState(parentId, b.state_name));
    if (matchingStateBlocks.length > 0) {
      const distMap = new Map<string, { stateName: string; lons: number[]; lats: number[] }>();
      for (const b of matchingStateBlocks) {
        if (!distMap.has(b.district_name)) {
          distMap.set(b.district_name, { stateName: b.state_name, lons: [], lats: [] });
        }
        const entry = distMap.get(b.district_name)!;
        entry.lons.push(b.centroid_lon);
        entry.lats.push(b.centroid_lat);
      }

      const districts: Region[] = [];
      for (const [distName, data] of distMap.entries()) {
        const avgLon = data.lons.reduce((a, c) => a + c, 0) / data.lons.length;
        const avgLat = data.lats.reduce((a, c) => a + c, 0) / data.lats.length;
        const minLng = Math.min(...data.lons) - 0.2;
        const maxLng = Math.max(...data.lons) + 0.2;
        const minLat = Math.min(...data.lats) - 0.2;
        const maxLat = Math.max(...data.lats) + 0.2;

        districts.push({
          id: `district:${data.stateName}:${distName}`,
          name: distName,
          level: 'district',
          parentId: data.stateName,
          centroid: [avgLon, avgLat],
          bbox: [minLng, minLat, maxLng, maxLat],
        });
      }

      return districts.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Check if parentId matches a District -> return Blocks in that District
    const matchingDistBlocks = blocks.filter((b) =>
      matchesDistrict(parentId, b.state_name, b.district_name)
    );
    if (matchingDistBlocks.length > 0) {
      return matchingDistBlocks.map((b): Region => {
        const { geometry } = resolveBlockGeometry(b);
        const centroid: [number, number] = [b.centroid_lon, b.centroid_lat];
        const bbox = computeGeometryBbox(geometry, centroid);
        return {
          id: b.block_id,
          name: b.block_name,
          level: 'block',
          parentId: `district:${b.state_name}:${b.district_name}`,
          centroid,
          bbox,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
    }

    return [];
  },

  async searchRegions(query: string, limit = 10): Promise<Region[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const blocks = await getCachedBlocks();
    const allRegions: Region[] = [];

    // Distinct states
    const stateNames = Array.from(new Set(blocks.map((b) => b.state_name)));
    for (const sName of stateNames) {
      const sBlocks = blocks.filter((b) => b.state_name === sName);
      const avgLon = sBlocks.reduce((a, c) => a + c.centroid_lon, 0) / sBlocks.length;
      const avgLat = sBlocks.reduce((a, c) => a + c.centroid_lat, 0) / sBlocks.length;
      allRegions.push({
        id: sName,
        name: sName,
        level: 'state',
        parentId: null,
        centroid: [avgLon, avgLat],
        bbox: [avgLon - 1, avgLat - 1, avgLon + 1, avgLat + 1],
      });
    }

    // Distinct districts
    const distKeys = Array.from(new Set(blocks.map((b) => `${b.state_name}:::${b.district_name}`)));
    for (const dk of distKeys) {
      const [sName, dName] = dk.split(':::');
      const dBlocks = blocks.filter((b) => b.state_name === sName && b.district_name === dName);
      const avgLon = dBlocks.reduce((a, c) => a + c.centroid_lon, 0) / dBlocks.length;
      const avgLat = dBlocks.reduce((a, c) => a + c.centroid_lat, 0) / dBlocks.length;
      allRegions.push({
        id: `district:${sName}:${dName}`,
        name: dName,
        level: 'district',
        parentId: sName,
        centroid: [avgLon, avgLat],
        bbox: [avgLon - 0.3, avgLat - 0.3, avgLon + 0.3, avgLat + 0.3],
      });
    }

    // All blocks
    for (const b of blocks) {
      const { geometry } = resolveBlockGeometry(b);
      const centroid: [number, number] = [b.centroid_lon, b.centroid_lat];
      allRegions.push({
        id: b.block_id,
        name: b.block_name,
        level: 'block',
        parentId: `district:${b.state_name}:${b.district_name}`,
        centroid,
        bbox: computeGeometryBbox(geometry, centroid),
      });
    }

    // Matching score: exact id match (3) > exact name match (2) > includes (1)
    const matches: { region: Region; score: number }[] = [];
    for (const r of allRegions) {
      const idLower = r.id.toLowerCase();
      const nameLower = r.name.toLowerCase();

      if (idLower === q) {
        matches.push({ region: r, score: 3 });
      } else if (nameLower === q) {
        matches.push({ region: r, score: 2 });
      } else if (idLower.includes(q) || nameLower.includes(q)) {
        matches.push({ region: r, score: 1 });
      }
    }

    matches.sort((a, b) => b.score - a.score || a.region.name.localeCompare(b.region.name));
    return matches.slice(0, limit).map((m) => m.region);
  },

  async getRegionsGeoJSON(
    parentId: string | null
  ): Promise<GeoJSON.FeatureCollection<RegionFeature['geometry'], RegionFeatureProperties>> {
    const blocks = await getCachedBlocks();
    const predictions = await getCachedPredictions();

    // Organize predictions by block_id and lead_time_bucket
    const predMap = new Map<string, Map<LeadTimeBucket, LivePredictionRow>>();
    for (const p of predictions) {
      if (!predMap.has(p.block_id)) {
        predMap.set(p.block_id, new Map());
      }
      const bMap = predMap.get(p.block_id)!;
      if (!bMap.has(p.lead_time_bucket)) {
        bMap.set(p.lead_time_bucket, p);
      }
    }

    // 1. National / Root View (parentId === null):
    // Do NOT load all ~6,700 block geometries on initial page load.
    // Return higher-level summaries at district level derivable from existing blocks table without fabricating geometry.
    if (!parentId) {
      const distMap = new Map<string, BlockRow[]>();
      for (const b of blocks) {
        const key = `district:${b.state_name}:${b.district_name}`;
        if (!distMap.has(key)) {
          distMap.set(key, []);
        }
        distMap.get(key)!.push(b);
      }

      const features: RegionFeature[] = [];
      for (const [distId, dBlocks] of distMap.entries()) {
        const first = dBlocks[0];
        const avgLon = dBlocks.reduce((sum, b) => sum + b.centroid_lon, 0) / dBlocks.length;
        const avgLat = dBlocks.reduce((sum, b) => sum + b.centroid_lat, 0) / dBlocks.length;

        // Aggregate actual predictions across blocks in this district
        let sumOnsetW1 = 0, sumOnsetW2 = 0, sumOnsetW3 = 0, sumOnsetW4 = 0;
        let sumDryW1 = 0, sumDryW2 = 0, sumDryW3 = 0, sumDryW4 = 0;
        let sumHeavyW1 = 0, sumHeavyW2 = 0, sumHeavyW3 = 0, sumHeavyW4 = 0;
        let sumConf = 0;
        let countPred = 0;
        let isExp = false;
        let primaryDriver: string | null = null;
        let analogYear: number | null = null;

        for (const b of dBlocks) {
          const bPreds = predMap.get(b.block_id);
          const w1 = bPreds?.get('week_1');
          const w2 = bPreds?.get('week_2');
          const w3 = bPreds?.get('week_3');
          const w4 = bPreds?.get('week_4');

          if (w1) {
            sumOnsetW1 += w1.onset_probability;
            sumDryW1 += w1.break_probability;
            sumHeavyW1 += w1.heavy_spell_probability;
            sumConf += w1.calibrated_confidence;
            countPred++;
            if (!primaryDriver && w1.primary_driver) primaryDriver = w1.primary_driver;
            if (!analogYear && w1.teleconnection_analog_year) analogYear = w1.teleconnection_analog_year;
            if (
              w1.primary_driver?.includes('[EXPERIMENTAL]') ||
              w1.advisory_code?.startsWith('exp_')
            ) {
              isExp = true;
            }
          }
          if (w2) {
            sumOnsetW2 += w2.onset_probability;
            sumDryW2 += w2.break_probability;
            sumHeavyW2 += w2.heavy_spell_probability;
          }
          if (w3) {
            sumOnsetW3 += w3.onset_probability;
            sumDryW3 += w3.break_probability;
            sumHeavyW3 += w3.heavy_spell_probability;
          }
          if (w4) {
            sumOnsetW4 += w4.onset_probability;
            sumDryW4 += w4.break_probability;
            sumHeavyW4 += w4.heavy_spell_probability;
          }
        }

        const denom = countPred > 0 ? countPred : 1;

        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [avgLon, avgLat],
          },
          properties: {
            id: distId,
            name: first.district_name,
            district: first.district_name,
            state: first.state_name,
            level: 'district',
            block_count: dBlocks.length,
            onset_w1: countPred > 0 ? Math.round(sumOnsetW1 / denom) : 0,
            onset_w2: countPred > 0 ? Math.round(sumOnsetW2 / denom) : 0,
            onset_w3: countPred > 0 ? Math.round(sumOnsetW3 / denom) : 0,
            onset_w4: countPred > 0 ? Math.round(sumOnsetW4 / denom) : 0,
            dry_spell_w1: countPred > 0 ? Math.round(sumDryW1 / denom) : 0,
            dry_spell_w2: countPred > 0 ? Math.round(sumDryW2 / denom) : 0,
            dry_spell_w3: countPred > 0 ? Math.round(sumDryW3 / denom) : 0,
            dry_spell_w4: countPred > 0 ? Math.round(sumDryW4 / denom) : 0,
            heavy_rain_w1: countPred > 0 ? Math.round(sumHeavyW1 / denom) : 0,
            heavy_rain_w2: countPred > 0 ? Math.round(sumHeavyW2 / denom) : 0,
            heavy_rain_w3: countPred > 0 ? Math.round(sumHeavyW3 / denom) : 0,
            heavy_rain_w4: countPred > 0 ? Math.round(sumHeavyW4 / denom) : 0,
            confidence: countPred > 0 ? Math.round(sumConf / denom) : null,
            primary_driver: primaryDriver,
            analog_year: analogYear,
            is_experimental: isExp,
            representation: 'centroid',
            is_centroid_fallback: true,
          },
        });
      }

      return {
        type: 'FeatureCollection',
        features,
      };
    }

    // 2. Specific Region Selected (district, state, or block)
    let targetBlocks: BlockRow[] = [];
    const distFiltered = blocks.filter((b) =>
      matchesDistrict(parentId, b.state_name, b.district_name)
    );
    if (distFiltered.length > 0) {
      targetBlocks = distFiltered;
    } else {
      const stateFiltered = blocks.filter((b) => matchesState(parentId, b.state_name));
      if (stateFiltered.length > 0) {
        targetBlocks = stateFiltered;
      } else {
        const blockMatch = blocks.filter((b) => b.block_id === parentId);
        if (blockMatch.length > 0) {
          const bMatch = blockMatch[0];
          targetBlocks = blocks.filter(
            (b) => b.state_name === bMatch.state_name && b.district_name === bMatch.district_name
          );
        } else {
          targetBlocks = [];
        }
      }
    }

    const features: RegionFeature[] = [];

    for (const block of targetBlocks) {
      const bPreds = predMap.get(block.block_id);
      const w1 = bPreds?.get('week_1');
      const w2 = bPreds?.get('week_2');
      const w3 = bPreds?.get('week_3');
      const w4 = bPreds?.get('week_4');

      const { geometry, representation, isCentroidFallback } = resolveBlockGeometry(block);

      const props: RegionFeatureProperties = {
        id: block.block_id,
        name: block.block_name,
        district: block.district_name,
        state: block.state_name,
        level: 'block',
        elevation_m: block.elevation_m,
        slope_deg: block.slope_deg,
        distance_to_coast_km: block.distance_to_coast_km,
        agro_climatic_zone: block.agro_climatic_zone,
        onset_w1: Math.round(w1?.onset_probability ?? 0),
        onset_w2: Math.round(w2?.onset_probability ?? 0),
        onset_w3: Math.round(w3?.onset_probability ?? 0),
        onset_w4: Math.round(w4?.onset_probability ?? 0),
        dry_spell_w1: Math.round(w1?.break_probability ?? 0),
        dry_spell_w2: Math.round(w2?.break_probability ?? 0),
        dry_spell_w3: Math.round(w3?.break_probability ?? 0),
        dry_spell_w4: Math.round(w4?.break_probability ?? 0),
        heavy_rain_w1: Math.round(w1?.heavy_spell_probability ?? 0),
        heavy_rain_w2: Math.round(w2?.heavy_spell_probability ?? 0),
        heavy_rain_w3: Math.round(w3?.heavy_spell_probability ?? 0),
        heavy_rain_w4: Math.round(w4?.heavy_spell_probability ?? 0),
        confidence: w1?.calibrated_confidence ?? null,
        primary_driver: w1?.primary_driver ?? null,
        analog_year: w1?.teleconnection_analog_year ?? null,
        is_experimental: Boolean(
          w1?.primary_driver?.includes('[EXPERIMENTAL]') ||
            w1?.advisory_code?.startsWith('exp_')
        ),
        representation,
        is_centroid_fallback: isCentroidFallback,
      };

      features.push({
        type: 'Feature',
        geometry,
        properties: props,
      });
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  },

  async getRisk(regionId: string): Promise<RegionRisk> {
    const predictions = await getCachedPredictions();
    const blockPreds = predictions.filter((p) => p.block_id === regionId);

    // Missing prediction state: safe no-data fallback
    if (blockPreds.length === 0) {
      return {
        regionId,
        probabilities: {
          onset: { 1: 0, 2: 0, 3: 0, 4: 0 },
          dry_spell: { 1: 0, 2: 0, 3: 0, 4: 0 },
          heavy_rain: { 1: 0, 2: 0, 3: 0, 4: 0 },
        },
        reliability: 'low',
        drivers: {
          onset: [],
          dry_spell: [],
          heavy_rain: [],
        },
        isEstimate: false,
      };
    }

    const w1 = blockPreds.find((p) => p.lead_time_bucket === 'week_1');
    const w2 = blockPreds.find((p) => p.lead_time_bucket === 'week_2');
    const w3 = blockPreds.find((p) => p.lead_time_bucket === 'week_3');
    const w4 = blockPreds.find((p) => p.lead_time_bucket === 'week_4');

    const conf = w1?.calibrated_confidence ?? 0;
    const reliability: 'low' | 'medium' | 'high' =
      conf >= 70 ? 'high' : conf >= 40 ? 'medium' : 'low';

    return {
      regionId,
      probabilities: {
        onset: {
          1: Math.round(w1?.onset_probability ?? 0),
          2: Math.round(w2?.onset_probability ?? 0),
          3: Math.round(w3?.onset_probability ?? 0),
          4: Math.round(w4?.onset_probability ?? 0),
        },
        dry_spell: {
          1: Math.round(w1?.break_probability ?? 0),
          2: Math.round(w2?.break_probability ?? 0),
          3: Math.round(w3?.break_probability ?? 0),
          4: Math.round(w4?.break_probability ?? 0),
        },
        heavy_rain: {
          1: Math.round(w1?.heavy_spell_probability ?? 0),
          2: Math.round(w2?.heavy_spell_probability ?? 0),
          3: Math.round(w3?.heavy_spell_probability ?? 0),
          4: Math.round(w4?.heavy_spell_probability ?? 0),
        },
      },
      reliability,
      drivers: {
        onset: buildDriversForHazard(w1, 'onset'),
        dry_spell: buildDriversForHazard(w1, 'dry_spell'),
        heavy_rain: buildDriversForHazard(w1, 'heavy_rain'),
      },
      isEstimate: false,
    };
  },

  async getAdvisory(regionId: string, crop: Crop, week: LeadWeek): Promise<Advisory> {
    const predictions = await getCachedPredictions();
    const rules = await getCachedRules();
    const authorMeta = await fetchAuthoritativeMetadata();

    const targetBucket: LeadTimeBucket = `week_${week}`;
    const blockPreds = predictions.filter((p) => p.block_id === regionId);
    const pred =
      blockPreds.find((p) => p.lead_time_bucket === targetBucket) ??
      blockPreds[0];

    const defaultUnavailableTexts: Record<Locale, string> = {
      en: 'No verified advisory rule is available for this forecast.',
      hi: 'इस पूर्वानुमान के लिए कोई सत्यापित सलाह उपलब्ध नहीं है।',
      mr: 'या अंदाजासाठी कोणताही पडताळलेला सल्ला उपलब्ध नाही.',
      te: 'ఈ సూచన కోసం ధృవీకరించబడిన సలహా ఏదీ అందుబాటులో లేదు.',
      ta: 'இந்த முன்னறிவிப்புக்கு சரிபார்க்கப்பட்ட ஆலோசனை எதுவும் கிடைக்கவில்லை.',
      bn: 'এই পূর্বাভাসের জন্য কোনও যাচাইকৃত পরামর্শ উপলব্ধ নেই।',
      gu: 'આ આગાહી માટે કોઈ ચકાસાયેલ સલાહ ઉપલબ્ધ નથી.',
      kn: 'ಈ ಮುನ್ಸೂಚನೆಗೆ ಯಾವುದೇ ಪರಿಶೀಲಿಸಿದ ಸಲಹೆ ಲಭ್ಯವಿಲ್ಲ.',
      pa: 'ਇਸ ਭਵਿੱਖਬਾਣੀ ਲਈ ਕੋਈ ਪ੍ਰਮਾਣਿਤ ਸਲਾਹ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।',
      or: 'ଏହି ପୂର୍ବାନୁମାନ ପାଇଁ କୌଣସି ଯାଞ୍ଚ ହୋଇଥିବା ପରାମର୍ଶ ଉପଲବ୍ଧ ନାହିଁ |',
    };

    const textByLocale: Record<Locale, string> = { ...defaultUnavailableTexts };

    let verdict: Verdict = 'wait';

    if (pred) {
      const evalEn = evaluateAdvisoryRule(pred, {
        rules,
        cropCategory: normalizeCropType(crop),
        isModelProductionReady: authorMeta.isProductionReady,
        langCode: 'en',
      });

      verdict = actionToVerdict(evalEn.actionType);
      textByLocale.en = evalEn.recommendation;

      for (const loc of ALL_STEP6_LOCALES) {
        if (loc === 'en') continue;
        const ev = evaluateAdvisoryRule(pred, {
          rules,
          cropCategory: normalizeCropType(crop),
          isModelProductionReady: authorMeta.isProductionReady,
          langCode: loc,
        });
        textByLocale[loc] = ev.recommendation;
      }
    }

    return {
      regionId,
      crop,
      week,
      verdict,
      textByLocale,
    };
  },
};
