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
import { type ModelMetadata, FALLBACK_MODEL_METADATA } from '../metadata.ts';

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

// Canonical mapping from legacy test identifiers to authentic LGD codes in Supabase
export const LEGACY_BLOCK_ID_MAP: Record<string, string> = {
  'IND_MH_PUN_001': '4515', // Haveli, Pune
  'IND_RJ_JOD_001': '726',  // Mandor, Jodhpur
  'IND_WB_KOL_003': '2726', // Barasat-I, North 24 Parganas
};

export function resolveBlockId(id: string): string {
  return LEGACY_BLOCK_ID_MAP[id] || id;
}

// In-memory cache with independent timestamps per dataset and in-flight promise deduplication
let cachedBlocks: BlockRow[] | null = null;
let cachedPredictions: LivePredictionRow[] | null = null;
let cachedRules: AdvisoryRuleRow[] | null = null;
let cachedMetadata: ModelMetadata | null = null;
const cachedBlockBoundaries = new Map<string, unknown>();

let blocksInFlight: Promise<BlockRow[]> | null = null;
let predictionsInFlight: Promise<LivePredictionRow[]> | null = null;
let rulesInFlight: Promise<AdvisoryRuleRow[]> | null = null;

let lastBlocksFetch = 0;
let lastPredictionsFetch = 0;
let lastRulesFetch = 0;
let lastMetaFetch = 0;

export const BLOCKS_CACHE_TTL_MS = 60_000; // 1 minute
export const PREDICTIONS_CACHE_TTL_MS = 60_000; // 1 minute
export const RULES_CACHE_TTL_MS = 60_000; // 1 minute intentional refresh policy
export const METADATA_CACHE_TTL_MS = 60_000; // 1 minute

export function clearSupabaseAdapterCache(): void {
  cachedBlocks = null;
  cachedPredictions = null;
  cachedRules = null;
  cachedMetadata = null;
  cachedBlockBoundaries.clear();
  blocksInFlight = null;
  predictionsInFlight = null;
  rulesInFlight = null;
  lastBlocksFetch = 0;
  lastPredictionsFetch = 0;
  lastRulesFetch = 0;
  lastMetaFetch = 0;
}

export function getCacheTimestamps() {
  return {
    lastBlocksFetch,
    lastPredictionsFetch,
    lastRulesFetch,
    lastMetaFetch,
  };
}

/**
 * Loads authoritative model readiness metadata exclusively via GET /api/readiness.
 * The server-side route reads pipeline/ml/artifacts/metadata.json via getModelMetadata().
 * Returns neutral fallback metadata on failure. Zero arbitrary or dynamic code execution.
 */
export async function fetchAuthoritativeMetadata(): Promise<ModelMetadata> {
  const now = Date.now();
  if (cachedMetadata && now - lastMetaFetch < METADATA_CACHE_TTL_MS) {
    return cachedMetadata;
  }

  try {
    if (typeof fetch === 'function') {
      const res = await fetch('/api/readiness');
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && json.metadata) {
          cachedMetadata = json.metadata as ModelMetadata;
          lastMetaFetch = now;
          return cachedMetadata;
        }
      }
    }
  } catch (err) {
    console.warn('[BHUMI Supabase Adapter] Could not fetch /api/readiness:', err);
  }

  return FALLBACK_MODEL_METADATA;
}

export async function fetchPostgrest<T>(path: string, pageSize = 1000): Promise<T[]> {
  const { supabaseUrl, supabaseAnonKey, isConfigured } = getPublicEnv();
  if (!isConfigured || !supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const cleanUrl = supabaseUrl.replace(/\/+$/, '');
  const allRows: T[] = [];
  let offset = 0;
  const isSinglePage = path.includes('limit=') || pageSize <= 1;

  while (true) {
    const rangeStart = offset;
    const rangeEnd = offset + pageSize - 1;
    const url = `${cleanUrl}/rest/v1/${path}`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          Accept: 'application/json',
          Range: `${rangeStart}-${rangeEnd}`,
          'Range-Unit': 'items',
          Prefer: 'count=exact',
        },
      });

      if (!res.ok && res.status !== 206) {
        if (offset === 0) {
          console.warn(`[BHUMI Supabase Adapter] Fetch failed for ${path}: status=${res.status} ${res.statusText}`);
          return [];
        }
        throw new Error(`Pagination failed for ${path} at offset ${offset}: HTTP ${res.status} ${res.statusText}`);
      }

      const rows = (await res.json()) as T[];
      if (!Array.isArray(rows) || rows.length === 0) {
        break;
      }

      allRows.push(...rows);

      // If single-page query or server returned full 200 OK without 206 Partial Content
      if (isSinglePage || res.status === 200) {
        break;
      }

      // Check Content-Range header (e.g., "0-999/6700")
      const contentRange = res.headers?.get
        ? res.headers.get('content-range') || res.headers.get('Content-Range')
        : null;
      if (contentRange) {
        const parts = contentRange.split('/');
        if (parts.length === 2 && parts[1] !== '*') {
          const totalCount = parseInt(parts[1], 10);
          if (!isNaN(totalCount) && allRows.length >= totalCount) {
            break;
          }
        }
      }

      if (rows.length < pageSize) {
        break;
      }

      offset += rows.length;
    } catch (err) {
      if (offset > 0) {
        console.error(`[BHUMI Supabase Adapter] Pagination error querying ${path}:`, err);
        throw err;
      }
      console.warn(`[BHUMI Supabase Adapter] Network error querying ${path}:`, err);
      return [];
    }
  }

  return allRows;
}

async function getCachedBlocks(): Promise<BlockRow[]> {
  const now = Date.now();
  if (cachedBlocks && now - lastBlocksFetch < BLOCKS_CACHE_TTL_MS) {
    return cachedBlocks;
  }
  if (blocksInFlight) {
    return blocksInFlight;
  }

  blocksInFlight = (async () => {
    try {
      const rows = await fetchPostgrest<BlockRow>(
        'blocks?select=block_id,block_name,district_name,state_name,centroid_lat,centroid_lon,elevation_m,slope_deg,distance_to_coast_km,agro_climatic_zone&order=state_name.asc,district_name.asc,block_name.asc'
      );
      if (rows.length > 0) {
        cachedBlocks = rows;
        lastBlocksFetch = Date.now();
      }
      return cachedBlocks ?? [];
    } finally {
      blocksInFlight = null;
    }
  })();

  return blocksInFlight;
}

async function getCachedPredictions(): Promise<LivePredictionRow[]> {
  const now = Date.now();
  if (cachedPredictions && now - lastPredictionsFetch < PREDICTIONS_CACHE_TTL_MS) {
    return cachedPredictions;
  }
  if (predictionsInFlight) {
    return predictionsInFlight;
  }

  predictionsInFlight = (async () => {
    try {
      // To protect browser memory and network performance, find the latest prediction_date first
      const latestDateRows = await fetchPostgrest<{ prediction_date: string }>(
        'live_predictions?select=prediction_date&order=prediction_date.desc&limit=1'
      );

      let queryPath = 'live_predictions?select=*&order=prediction_date.desc,lead_time_bucket.asc';
      if (latestDateRows.length > 0 && latestDateRows[0].prediction_date) {
        const latestDate = latestDateRows[0].prediction_date;
        queryPath = `live_predictions?select=*&prediction_date=eq.${latestDate}&order=lead_time_bucket.asc,block_id.asc`;
      }

      const rows = await fetchPostgrest<LivePredictionRow>(queryPath);
      if (rows.length > 0) {
        cachedPredictions = rows;
        lastPredictionsFetch = Date.now();
      }
      return cachedPredictions ?? [];
    } finally {
      predictionsInFlight = null;
    }
  })();

  return predictionsInFlight;
}

async function getCachedRules(): Promise<AdvisoryRuleRow[]> {
  const now = Date.now();
  if (cachedRules && cachedRules.length > 0 && now - lastRulesFetch < RULES_CACHE_TTL_MS) {
    return cachedRules;
  }
  if (rulesInFlight) {
    return rulesInFlight;
  }

  rulesInFlight = (async () => {
    try {
      const rows = await fetchPostgrest<AdvisoryRuleRow>(
        'advisory_rules?select=*&is_active=eq.true&order=crop_category.asc,rule_code.asc'
      );
      if (rows.length > 0) {
        cachedRules = rows;
        lastRulesFetch = Date.now();
        return cachedRules;
      }
      return VERIFIED_ADVISORY_RULES;
    } finally {
      rulesInFlight = null;
    }
  })();

  return rulesInFlight;
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
        const boundary_geom = cachedBlockBoundaries.get(b.block_id) ?? b.boundary_geom;
        const effectiveBlock: BlockRow = boundary_geom !== undefined
          ? { ...b, boundary_geom }
          : b;
        const { geometry } = resolveBlockGeometry(effectiveBlock);
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
      const boundary_geom = cachedBlockBoundaries.get(b.block_id) ?? b.boundary_geom;
      const effectiveBlock: BlockRow = boundary_geom !== undefined
        ? { ...b, boundary_geom }
        : b;
      const { geometry } = resolveBlockGeometry(effectiveBlock);
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
    const resolvedQ = resolveBlockId(q).toLowerCase();
    const matches: { region: Region; score: number }[] = [];
    for (const r of allRegions) {
      const idLower = r.id.toLowerCase();
      const nameLower = r.name.toLowerCase();

      if (idLower === q || idLower === resolvedQ) {
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
        const hasPreds = countPred > 0;

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
            is_data_available: hasPreds,
            data_status: hasPreds ? 'available' : 'insufficient_history',
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
        const resolvedParentId = resolveBlockId(parentId);
        const blockMatch = blocks.filter((b) => b.block_id === parentId || b.block_id === resolvedParentId);
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

    // Load authentic PostGIS boundaries for target blocks on demand if not yet cached
    const missingGeomBlocks = targetBlocks.filter(
      (b) => !b.boundary_geom && !cachedBlockBoundaries.has(b.block_id)
    );

    if (missingGeomBlocks.length > 0) {
      const firstS = missingGeomBlocks[0].state_name;
      const firstD = missingGeomBlocks[0].district_name;
      const sameDist = missingGeomBlocks.every(
        (b) => b.district_name === firstD && b.state_name === firstS
      );

      try {
        if (sameDist) {
          const boundaryRows = await fetchPostgrest<{ block_id: string; boundary_geom: unknown }>(
            `blocks?select=block_id,boundary_geom&state_name=eq.${encodeURIComponent(firstS)}&district_name=eq.${encodeURIComponent(firstD)}`
          );
          for (const r of boundaryRows) {
            if (r.boundary_geom) {
              cachedBlockBoundaries.set(r.block_id, r.boundary_geom);
            }
          }
        } else {
          const sameState = missingGeomBlocks.every((b) => b.state_name === firstS);
          if (sameState && missingGeomBlocks.length <= 400) {
            const boundaryRows = await fetchPostgrest<{ block_id: string; boundary_geom: unknown }>(
              `blocks?select=block_id,boundary_geom&state_name=eq.${encodeURIComponent(firstS)}`
            );
            for (const r of boundaryRows) {
              if (r.boundary_geom) {
                cachedBlockBoundaries.set(r.block_id, r.boundary_geom);
              }
            }
          } else {
            // Batch by chunks of 50 IDs
            for (let i = 0; i < missingGeomBlocks.length; i += 50) {
              const chunk = missingGeomBlocks.slice(i, i + 50);
              const idList = chunk.map((b) => b.block_id).join(',');
              const boundaryRows = await fetchPostgrest<{ block_id: string; boundary_geom: unknown }>(
                `blocks?select=block_id,boundary_geom&block_id=in.(${idList})`
              );
              for (const r of boundaryRows) {
                if (r.boundary_geom) {
                  cachedBlockBoundaries.set(r.block_id, r.boundary_geom);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[BHUMI Supabase Adapter] Failed to fetch boundaries for target blocks:', err);
      }
    }

    const features: RegionFeature[] = [];

    for (const block of targetBlocks) {
      const boundary_geom = cachedBlockBoundaries.get(block.block_id) ?? block.boundary_geom;
      const effectiveBlock: BlockRow = boundary_geom !== undefined
        ? { ...block, boundary_geom }
        : block;
      const bPreds = predMap.get(block.block_id);
      const w1 = bPreds?.get('week_1');
      const w2 = bPreds?.get('week_2');
      const w3 = bPreds?.get('week_3');
      const w4 = bPreds?.get('week_4');
      const hasPreds = Boolean(w1);

      const { geometry, representation, isCentroidFallback } = resolveBlockGeometry(effectiveBlock);

      const props: RegionFeatureProperties = {
        id: block.block_id,
        name: block.block_name,
        district: block.district_name,
        state: block.state_name,
        level: 'block',
        is_data_available: hasPreds,
        data_status: hasPreds ? 'available' : 'insufficient_history',
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
    const resolvedId = resolveBlockId(regionId);
    const blockPreds = predictions.filter((p) => p.block_id === regionId || p.block_id === resolvedId);

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
        isAvailable: false,
        dataStatus: 'insufficient_history',
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
    const resolvedId = resolveBlockId(regionId);
    const blockPreds = predictions.filter((p) => p.block_id === regionId || p.block_id === resolvedId);
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
