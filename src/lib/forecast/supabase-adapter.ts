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
import { AUTHORITATIVE_MODEL_METADATA } from '../metadata.ts';

// In-memory cache
let cachedBlocks: BlockRow[] | null = null;
let cachedPredictions: LivePredictionRow[] | null = null;
let cachedRules: AdvisoryRuleRow[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

export function clearSupabaseAdapterCache(): void {
  cachedBlocks = null;
  cachedPredictions = null;
  cachedRules = null;
  lastFetchTime = 0;
}

// Authoritative model metadata
const authorMeta = AUTHORITATIVE_MODEL_METADATA;

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
      labelByLocale: {
        en: raw,
        hi: raw,
        bn: raw,
      },
      effect: prob >= 50 ? 'raises' : 'lowers',
      strength: Math.min(1, Math.max(0.2, (pred.calibrated_confidence || 75) / 100)),
    });
  }

  if (pred.secondary_driver) {
    const rawSec = pred.secondary_driver;
    drivers.push({
      key: 'secondary_driver',
      labelByLocale: {
        en: rawSec,
        hi: rawSec,
        bn: rawSec,
      },
      effect: prob >= 40 ? 'raises' : 'lowers',
      strength: 0.65,
    });
  }

  if (pred.teleconnection_analog_year) {
    const yr = pred.teleconnection_analog_year;
    drivers.push({
      key: 'analog_year',
      labelByLocale: {
        en: `Historical analog match to ${yr} monsoon pattern`,
        hi: `${yr} मानसून पैटर्न से ऐतिहासिक अनुरूपता`,
        bn: `${yr} মৌসুমী বায়ু ধরনের ঐতিহাসিক অনুরূপতা`,
      },
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

    let targetBlocks = blocks;
    if (parentId) {
      if (matchesState(parentId, parentId)) {
        const filtered = blocks.filter((b) => matchesState(parentId, b.state_name));
        if (filtered.length > 0) targetBlocks = filtered;
      }
      const distFiltered = blocks.filter((b) =>
        matchesDistrict(parentId, b.state_name, b.district_name)
      );
      if (distFiltered.length > 0) targetBlocks = distFiltered;
    }

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

    const targetBucket: LeadTimeBucket = `week_${week}`;
    const blockPreds = predictions.filter((p) => p.block_id === regionId);
    const pred =
      blockPreds.find((p) => p.lead_time_bucket === targetBucket) ??
      blockPreds[0];

    const locales: Locale[] = ['en', 'hi', 'bn'];
    const textByLocale: Record<Locale, string> = {
      en: 'No verified advisory rule is available for this forecast.',
      hi: 'इस पूर्वानुमान के लिए कोई सत्यापित सलाह उपलब्ध नहीं है।',
      bn: 'এই পূর্বাভাসের জন্য কোনও যাচাইকৃত পরামর্শ উপলব্ধ নেই।',
    };

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

      for (const loc of locales) {
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
