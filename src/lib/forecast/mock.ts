/**
 * BHUMI Mock Forecast Repository
 *
 * Produces deterministic, spatially-smooth mock data for UI development.
 * - Uses generic names ("Demo State", "Demo District A", "Block 07") — no real place names.
 * - All advisory strings are MOCK COPY: needs native-speaker review.
 * - All values are deterministic given the same seed.
 * - Neighbouring blocks have similar values (spatial smoothness).
 *
 * Active when NEXT_PUBLIC_USE_MOCK_DATA=true.
 */

import type {
  ForecastRepository,
  ForecastMeta,
  Region,
  RegionRisk,
  Advisory,
  Hazard,
  LeadWeek,
  Crop,
  RegionFeatureProperties,
  Driver,
  Locale,
  Verdict,
} from './types';
import type { GeoJSON } from 'geojson';

// ─── Deterministic seeded RNG ──────────────────────────────────────────────
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ─── Mock region tree ──────────────────────────────────────────────────────
const STATES = ['Demo State A', 'Demo State B', 'Demo State C'];
const DISTRICTS_PER_STATE = 3;
const BLOCKS_PER_DISTRICT = 6;

// Generate the full mock region tree once
type MockRegion = Region & { stateIdx: number; districtIdx: number; blockIdx?: number };

function buildMockRegions(): MockRegion[] {
  const regions: MockRegion[] = [];

  STATES.forEach((stateName, si) => {
    const stateId = `state-${si}`;
    const stateLng = 72 + si * 8; // spread across India's longitude band
    const stateLat = 22 + si * 3;

    regions.push({
      id: stateId,
      name: stateName,
      level: 'state',
      parentId: null,
      centroid: [stateLng, stateLat],
      bbox: [stateLng - 3, stateLat - 2, stateLng + 3, stateLat + 2],
      stateIdx: si,
      districtIdx: 0,
    });

    for (let di = 0; di < DISTRICTS_PER_STATE; di++) {
      const districtId = `district-${si}-${di}`;
      const districtName = `Demo District ${String.fromCharCode(65 + di)}`;
      const dLng = stateLng + (di - 1) * 2;
      const dLat = stateLat + (di - 1) * 1.5;

      regions.push({
        id: districtId,
        name: districtName,
        level: 'district',
        parentId: stateId,
        centroid: [dLng, dLat],
        bbox: [dLng - 0.8, dLat - 0.6, dLng + 0.8, dLat + 0.6],
        stateIdx: si,
        districtIdx: di,
      });

      for (let bi = 0; bi < BLOCKS_PER_DISTRICT; bi++) {
        const blockId = `block-${si}-${di}-${bi}`;
        const blockNum = si * DISTRICTS_PER_STATE * BLOCKS_PER_DISTRICT + di * BLOCKS_PER_DISTRICT + bi + 1;
        const blockName = `Block ${String(blockNum).padStart(2, '0')}`;
        const bLng = dLng + (bi % 3) * 0.5 - 0.5;
        const bLat = dLat + Math.floor(bi / 3) * 0.5 - 0.25;

        regions.push({
          id: blockId,
          name: blockName,
          level: 'block',
          parentId: districtId,
          centroid: [bLng, bLat],
          bbox: [bLng - 0.2, bLat - 0.15, bLng + 0.2, bLat + 0.15],
          stateIdx: si,
          districtIdx: di,
          blockIdx: bi,
        });
      }
    }
  });

  return regions;
}

const MOCK_REGIONS = buildMockRegions();


// ─── Spatial probability generator ────────────────────────────────────────
function mockProbability(regionId: string, hazard: Hazard, week: LeadWeek): number {
  const seed = hashString(`${regionId}-${hazard}-w${week}`);
  const rng = seededRng(seed);
  // Spatially smooth: similar seeds → similar values, week 1 more certain
  const base = Math.round(rng() * 100);
  // Week certainty decay: weeks further out are less extreme (closer to 50)
  const decay = (week - 1) * 0.1;
  const smoothed = Math.round(base * (1 - decay) + 50 * decay);
  return Math.min(100, Math.max(0, smoothed));
}

function mockDrivers(regionId: string, hazard: Hazard): Driver[] {
  const keys = ['enso_phase', 'mjo_phase', 'iod_index', 'sst_anomaly', 'soil_moisture'];
  const labels: Record<string, Record<Locale, string>> = {
    enso_phase: {
      en: 'Ocean temperature pattern (ENSO)',
      hi: 'समुद्री तापमान पैटर्न (ENSO)',
      bn: 'সমুদ্রের তাপমাত্রার ধরন (ENSO)',
    },
    mjo_phase: {
      en: 'Tropical wind pattern (MJO)',
      hi: 'उष्णकटिबंधीय वायु पैटर्न (MJO)',
      bn: 'গ্রীষ্মমণ্ডলীয় বায়ু ধরন (MJO)',
    },
    iod_index: {
      en: 'Indian Ocean warmth (IOD)',
      hi: 'हिंद महासागर की गर्मी (IOD)',
      bn: 'ভারত মহাসাগরের উষ্ণতা (IOD)',
    },
    sst_anomaly: {
      en: 'Sea surface temperature',
      hi: 'समुद्र सतह तापमान',
      bn: 'সমুদ্র পৃষ্ঠের তাপমাত্রা',
    },
    soil_moisture: {
      en: 'Soil moisture',
      hi: 'मिट्टी की नमी',
      bn: 'মাটির আর্দ্রতা',
    },
  };

  const seed = hashString(`${regionId}-${hazard}-drivers`);
  const rng = seededRng(seed);
  return keys.slice(0, 4).map((key) => ({
    key,
    labelByLocale: labels[key],
    effect: rng() > 0.5 ? 'raises' : 'lowers',
    strength: Math.round(rng() * 80 + 20) / 100,
  }));
}

// ─── Mock hex grid GeoJSON ─────────────────────────────────────────────────
function blockPolygon(
  blockId: string,
  centroid: [number, number],
): GeoJSON.Feature<GeoJSON.Polygon, RegionFeatureProperties> {
  const [lng, lat] = centroid;
  const dx = 0.18;
  const dy = 0.13;
  const coordinates = [[
    [lng - dx, lat - dy],
    [lng + dx, lat - dy],
    [lng + dx, lat + dy],
    [lng - dx, lat + dy],
    [lng - dx, lat - dy],
  ]];

  const props: RegionFeatureProperties = { id: blockId, name: '' };
  const hazards: Hazard[] = ['onset', 'dry_spell', 'heavy_rain'];
  const weeks: LeadWeek[] = [1, 2, 3, 4];
  hazards.forEach((h) => {
    weeks.forEach((w) => {
      props[`${h}_w${w}`] = mockProbability(blockId, h, w);
    });
  });

  return { type: 'Feature', geometry: { type: 'Polygon', coordinates }, properties: props };
}

// ─── In-memory cache ───────────────────────────────────────────────────────
const cache = new Map<string, unknown>();

function cached<T>(key: string, fn: () => T): T {
  if (cache.has(key)) return cache.get(key) as T;
  const v = fn();
  cache.set(key, v);
  return v;
}

// ─── Mock implementation ───────────────────────────────────────────────────
export const mockRepository: ForecastRepository = {
  async getMeta(): Promise<ForecastMeta> {
    const now = new Date();
    const validFrom = new Date(now);
    validFrom.setHours(0, 0, 0, 0);
    const nextUpdate = new Date(validFrom);
    nextUpdate.setDate(nextUpdate.getDate() + 1);
    nextUpdate.setHours(6, 0, 0, 0);
    return {
      issuedAt: now.toISOString(),
      validFrom: validFrom.toISOString(),
      nextUpdateAt: nextUpdate.toISOString(),
    };
  },

  async listRegions(parentId: string | null): Promise<Region[]> {
    return cached(`list-${parentId}`, () =>
      MOCK_REGIONS.filter((r) => r.parentId === parentId),
    );
  },

  async searchRegions(query: string, limit = 10): Promise<Region[]> {
    const q = query.toLowerCase();
    return MOCK_REGIONS
      .filter((r) => r.name.toLowerCase().includes(q))
      .slice(0, limit);
  },

  async getRegionsGeoJSON(parentId: string | null) {
    return cached(`geojson-${parentId}`, () => {
      const blocks = MOCK_REGIONS.filter(
        (r) => r.level === 'block' && (parentId === null || r.parentId === parentId),
      );
      const features = blocks.map((b) => {
        const f = blockPolygon(b.id, b.centroid);
        f.properties.name = b.name;
        return f;
      });
      return {
        type: 'FeatureCollection' as const,
        features,
      };
    });
  },

  async getRisk(regionId: string): Promise<RegionRisk> {
    return cached(`risk-${regionId}`, () => {
      const hazards: Hazard[] = ['onset', 'dry_spell', 'heavy_rain'];
      const weeks: LeadWeek[] = [1, 2, 3, 4];
      const probabilities = {} as RegionRisk['probabilities'];
      const drivers = {} as RegionRisk['drivers'];
      hazards.forEach((h) => {
        probabilities[h] = {} as Record<LeadWeek, number>;
        weeks.forEach((w) => {
          probabilities[h][w] = mockProbability(regionId, h, w);
        });
        drivers[h] = mockDrivers(regionId, h);
      });
      const seed = hashString(regionId);
      const rng = seededRng(seed);
      const reliabilities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
      return {
        regionId,
        probabilities,
        reliability: reliabilities[Math.floor(rng() * 3)],
        drivers,
        isEstimate: false,
      };
    });
  },

  async getAdvisory(regionId: string, crop: Crop, week: LeadWeek): Promise<Advisory> {
    const key = `advisory-${regionId}-${crop}-${week}`;
    return cached(key, () => {
      const seed = hashString(`${regionId}-${crop}-${week}`);
      const rng = seededRng(seed);
      const verdicts: Verdict[] = [
        'sow_now', 'wait', 'prepare_irrigation', 'protect_from_rain', 'switch_crop',
      ];
      const verdict = verdicts[Math.floor(rng() * verdicts.length)];

      // MOCK COPY: needs native-speaker review
      const textByLocale: Record<string, string> = {
        en: `Demo advisory for ${crop}: conditions are ${verdict.replace(/_/g, ' ')} for week ${week}. Monitor local conditions before making final decisions.`,
        hi: `${crop} के लिए डेमो सलाह: सप्ताह ${week} के लिए स्थिति ${verdict.replace(/_/g, ' ')} है। अंतिम निर्णय लेने से पहले स्थानीय परिस्थितियों की जांच करें।`,
        bn: `${crop}-এর জন্য ডেমো পরামর্শ: সপ্তাহ ${week}-এর জন্য পরিস্থিতি ${verdict.replace(/_/g, ' ')}। চূড়ান্ত সিদ্ধান্ত নেওয়ার আগে স্থানীয় পরিস্থিতি পর্যবেক্ষণ করুন।`,
      };
      return {
        regionId,
        crop,
        week,
        verdict,
        textByLocale: textByLocale as Record<Locale, string>,
      };
    });
  },
};
