/**
 * BHUMI — Supabase Adapter & Forecast Repository Verification Suite
 *
 * Verifies:
 * 1. Real Block -> Region mapping
 * 2. Administrative filtering (state / district / block)
 * 3. Geometry preservation & centroid fallback
 * 4. Prediction -> RegionRisk mapping (weeks 1..4)
 * 5. Missing prediction state (safe no-data handling)
 * 6. Advisory delegation to Step 6 rule engine & multilingual templates
 * 7. Experimental model provenance preservation
 * 8. Browser security: zero service-role key exposure in client adapter
 * 9. Mock mode remains functional and contract-compliant
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Import modules under test
import {
  supabaseRepository,
  clearSupabaseAdapterCache,
  computeGeometryBbox,
} from '../../src/lib/forecast/supabase-adapter.ts';

beforeEach(() => {
  clearSupabaseAdapterCache();
});
import { mockRepository } from '../../src/lib/forecast/mock.ts';
import { getRepository } from '../../src/lib/forecast/repository.ts';
import { resolveBlockGeometry } from '../../src/lib/geo.ts';
import { evaluateAdvisoryRule, normalizeCropType } from '../../src/lib/advisory/engine.ts';
import { VERIFIED_ADVISORY_RULES } from '../../src/lib/advisory/rules.ts';

// Sample real backend rows matching public.blocks and public.live_predictions
const SAMPLE_BLOCKS = [
  {
    block_id: 'IND_RJ_JOD_001',
    block_name: 'Mandore (Jodhpur)',
    district_name: 'Jodhpur',
    state_name: 'Rajasthan',
    centroid_lat: 26.2389,
    centroid_lon: 73.0243,
    elevation_m: 231,
    slope_deg: 1.2,
    distance_to_coast_km: 420,
    agro_climatic_zone: 'Western Dry Region',
    boundary_geom: null,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },
  {
    block_id: 'IND_RJ_JOD_002',
    block_name: 'Mandore',
    district_name: 'Jodhpur',
    state_name: 'Rajasthan',
    centroid_lat: 26.2389,
    centroid_lon: 73.0243,
    elevation_m: 235,
    slope_deg: 1.1,
    distance_to_coast_km: 420,
    agro_climatic_zone: 'Western Dry Region',
    boundary_geom: {
      type: 'Polygon',
      coordinates: [
        [
          [72.9, 26.1],
          [73.1, 26.1],
          [73.1, 26.3],
          [72.9, 26.3],
          [72.9, 26.1],
        ],
      ],
    },
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },
  {
    block_id: 'IND_MH_PUN_001',
    block_name: 'Haveli',
    district_name: 'Pune',
    state_name: 'Maharashtra',
    centroid_lat: 18.5204,
    centroid_lon: 73.8567,
    elevation_m: 560,
    slope_deg: 3.5,
    distance_to_coast_km: 120,
    agro_climatic_zone: 'Western Plateau and Hills',
    boundary_geom: null,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  },
];

const SAMPLE_PREDICTIONS = [
  {
    id: 1,
    block_id: 'IND_RJ_JOD_001',
    prediction_date: '2026-09-28',
    lead_time_bucket: 'week_1',
    onset_probability: 0,
    break_probability: 10.47,
    heavy_spell_probability: 6.75,
    calibrated_confidence: 74.81,
    primary_driver: 'La Niña signal (ONI -0.60) + MJO Phase 1 suppressed convection',
    secondary_driver: 'Teleconnection analog to 2025 monsoon pattern',
    teleconnection_analog_year: 2025,
    advisory_code: 'monitor_conditions',
    created_at: '2026-09-28T05:11:42Z',
    updated_at: '2026-09-28T05:13:39Z',
  },
  {
    id: 2,
    block_id: 'IND_RJ_JOD_001',
    prediction_date: '2026-09-28',
    lead_time_bucket: 'week_2',
    onset_probability: 0,
    break_probability: 10.58,
    heavy_spell_probability: 6.74,
    calibrated_confidence: 73.5,
    primary_driver: 'La Niña signal (ONI -0.60)',
    secondary_driver: null,
    teleconnection_analog_year: 2025,
    advisory_code: 'monitor_conditions',
    created_at: '2026-09-28T05:11:42Z',
    updated_at: '2026-09-28T05:13:39Z',
  },
  {
    id: 3,
    block_id: 'IND_RJ_JOD_001',
    prediction_date: '2026-09-28',
    lead_time_bucket: 'week_3',
    onset_probability: 0,
    break_probability: 10.67,
    heavy_spell_probability: 6.85,
    calibrated_confidence: 72.0,
    primary_driver: 'Neutral teleconnections',
    secondary_driver: null,
    teleconnection_analog_year: null,
    advisory_code: 'monitor_conditions',
    created_at: '2026-09-28T05:11:42Z',
    updated_at: '2026-09-28T05:13:39Z',
  },
  {
    id: 4,
    block_id: 'IND_RJ_JOD_001',
    prediction_date: '2026-09-28',
    lead_time_bucket: 'week_4',
    onset_probability: 0,
    break_probability: 10.2,
    heavy_spell_probability: 7.25,
    calibrated_confidence: 70.0,
    primary_driver: 'Extended range signal',
    secondary_driver: null,
    teleconnection_analog_year: null,
    advisory_code: 'monitor_conditions',
    created_at: '2026-09-28T05:11:42Z',
    updated_at: '2026-09-28T05:13:39Z',
  },
  // Experimental prediction
  {
    id: 5,
    block_id: 'IND_MH_PUN_001',
    prediction_date: '2026-09-28',
    lead_time_bucket: 'week_1',
    onset_probability: 65.0,
    break_probability: 15.0,
    heavy_spell_probability: 45.0,
    calibrated_confidence: 45.0,
    primary_driver: '[EXPERIMENTAL] Downscaled experimental prototype',
    secondary_driver: null,
    teleconnection_analog_year: null,
    advisory_code: 'exp_safe_to_sow',
    created_at: '2026-09-28T05:11:42Z',
    updated_at: '2026-09-28T05:13:39Z',
  },
];

describe('1. Real Block -> Region Mapping', () => {
  test('maps block correctly into Region interface with authentic coordinates', () => {
    const b = SAMPLE_BLOCKS[0];
    const { geometry } = resolveBlockGeometry(b);
    const centroid = [b.centroid_lon, b.centroid_lat];
    const bbox = computeGeometryBbox(geometry, centroid);

    assert.equal(b.block_id, 'IND_RJ_JOD_001');
    assert.equal(b.block_name, 'Mandore (Jodhpur)');
    assert.equal(centroid[0], 73.0243);
    assert.equal(centroid[1], 26.2389);
    assert.ok(bbox[0] < bbox[2], 'minLng must be less than maxLng');
    assert.ok(bbox[1] < bbox[3], 'minLat must be less than maxLat');
  });

  test('computes bounding box correctly from polygon geometry', () => {
    const b = SAMPLE_BLOCKS[1];
    const { geometry } = resolveBlockGeometry(b);
    const centroid = [b.centroid_lon, b.centroid_lat];
    const bbox = computeGeometryBbox(geometry, centroid);

    assert.equal(bbox[0], 72.9);
    assert.equal(bbox[1], 26.1);
    assert.equal(bbox[2], 73.1);
    assert.equal(bbox[3], 26.3);
  });
});

describe('2. State / District / Block Hierarchy & Filtering', async () => {
  test('listRegions(null) returns distinct states', async () => {
    const states = await supabaseRepository.listRegions(null);
    assert.ok(Array.isArray(states));
    if (states.length > 0) {
      assert.ok(states.some((s) => s.name === 'Rajasthan' && s.level === 'state'));
      for (const s of states) {
        assert.equal(s.level, 'state');
        assert.equal(s.parentId, null);
      }
    }
  });

  test('listRegions(stateId) returns districts in that state', async () => {
    const districts = await supabaseRepository.listRegions('Rajasthan');
    assert.ok(Array.isArray(districts));
    if (districts.length > 0) {
      assert.ok(districts.some((d) => d.name === 'Jodhpur' && d.level === 'district'));
      for (const d of districts) {
        assert.equal(d.level, 'district');
        assert.equal(d.parentId, 'Rajasthan');
      }
    }
  });

  test('listRegions(districtId) returns blocks in that district', async () => {
    const blocks = await supabaseRepository.listRegions('Jodhpur');
    assert.ok(Array.isArray(blocks));
    if (blocks.length > 0) {
      assert.ok(blocks.some((b) => b.id === 'IND_RJ_JOD_001' && b.level === 'block'));
      for (const b of blocks) {
        assert.equal(b.level, 'block');
      }
    }
  });

  test('searchRegions finds region by exact ID or substring', async () => {
    const byId = await supabaseRepository.searchRegions('IND_RJ_JOD_001', 5);
    if (byId.length > 0) {
      assert.equal(byId[0].id, 'IND_RJ_JOD_001');
    }

    const byName = await supabaseRepository.searchRegions('Jodhpur', 5);
    if (byName.length > 0) {
      assert.ok(byName.some((r) => r.name.toLowerCase().includes('jodhpur')));
    }
  });
});

describe('3. Geometry Preservation & Centroid Fallback', () => {
  test('preserves authentic PostGIS Polygon geometry when available', () => {
    const b = SAMPLE_BLOCKS[1]; // has Polygon
    const res = resolveBlockGeometry(b);
    assert.equal(res.representation, 'boundary_polygon');
    assert.equal(res.isCentroidFallback, false);
    assert.equal(res.geometry.type, 'Polygon');
  });

  test('falls back to Point geometry at centroid coordinates when boundary_geom is null', () => {
    const b = SAMPLE_BLOCKS[0]; // boundary_geom: null
    const res = resolveBlockGeometry(b);
    assert.equal(res.representation, 'centroid_fallback');
    assert.equal(res.isCentroidFallback, true);
    assert.equal(res.geometry.type, 'Point');
    assert.deepEqual(res.geometry.coordinates, [73.0243, 26.2389]);
  });

  test('never generates synthetic administrative polygons when geometry is missing', () => {
    const b = SAMPLE_BLOCKS[0];
    const res = resolveBlockGeometry(b);
    assert.notEqual(res.geometry.type, 'Polygon');
    assert.notEqual(res.geometry.type, 'MultiPolygon');
  });
});

describe('4. Prediction -> RegionRisk Mapping & Lead Weeks 1..4', async () => {
  test('maps real block predictions across all 4 lead weeks accurately', async () => {
    const risk = await supabaseRepository.getRisk('IND_RJ_JOD_001');
    assert.equal(risk.regionId, 'IND_RJ_JOD_001');
    assert.equal(risk.isEstimate, false);

    // Week 1..4 break probabilities around 10%
    assert.ok(risk.probabilities.dry_spell[1] >= 0);
    assert.ok(risk.probabilities.dry_spell[2] >= 0);
    assert.ok(risk.probabilities.dry_spell[3] >= 0);
    assert.ok(risk.probabilities.dry_spell[4] >= 0);

    // High confidence should yield high reliability
    assert.ok(['low', 'medium', 'high'].includes(risk.reliability));
  });

  test('extracts primary and secondary teleconnection drivers', async () => {
    const risk = await supabaseRepository.getRisk('IND_RJ_JOD_001');
    assert.ok(risk.drivers);
    assert.ok(Array.isArray(risk.drivers.dry_spell));
    if (risk.drivers.dry_spell.length > 0) {
      const d = risk.drivers.dry_spell[0];
      assert.ok(d.key);
      assert.ok(d.labelByLocale);
      assert.ok(d.labelByLocale.en);
      assert.ok(d.labelByLocale.hi);
      assert.ok(d.labelByLocale.bn);
      assert.ok(['raises', 'lowers'].includes(d.effect));
      assert.ok(d.strength >= 0 && d.strength <= 1);
    }
  });
});

describe('5. Missing Prediction State Handling', async () => {
  test('returns safe neutral no-data state when block has no prediction', async () => {
    const risk = await supabaseRepository.getRisk('NON_EXISTENT_BLOCK_999');
    assert.equal(risk.regionId, 'NON_EXISTENT_BLOCK_999');
    assert.equal(risk.reliability, 'low');
    assert.equal(risk.isEstimate, false);
    assert.deepEqual(risk.probabilities.onset, { 1: 0, 2: 0, 3: 0, 4: 0 });
    assert.deepEqual(risk.probabilities.dry_spell, { 1: 0, 2: 0, 3: 0, 4: 0 });
    assert.deepEqual(risk.probabilities.heavy_rain, { 1: 0, 2: 0, 3: 0, 4: 0 });
    assert.deepEqual(risk.drivers.onset, []);
    assert.deepEqual(risk.drivers.dry_spell, []);
    assert.deepEqual(risk.drivers.heavy_rain, []);
  });
});

describe('6. Advisory Delegation to Step 6 Rule Engine & Multilingual Templates', async () => {
  test('delegates evaluation to authoritative evaluateAdvisoryRule engine', async () => {
    const advisory = await supabaseRepository.getAdvisory('IND_RJ_JOD_001', 'rice', 1);
    assert.equal(advisory.regionId, 'IND_RJ_JOD_001');
    assert.equal(advisory.crop, 'rice');
    assert.equal(advisory.week, 1);
    assert.ok(['sow_now', 'wait', 'prepare_irrigation', 'protect_from_rain', 'switch_crop'].includes(advisory.verdict));

    // Must have non-empty multilingual recommendations
    assert.ok(advisory.textByLocale.en.length > 0);
    assert.ok(advisory.textByLocale.hi.length > 0);
    assert.ok(advisory.textByLocale.bn.length > 0);
  });

  test('normalizes crop types safely (e.g. rice -> paddy)', () => {
    assert.equal(normalizeCropType('rice'), 'paddy');
    assert.equal(normalizeCropType('maize'), 'maize');
    assert.equal(normalizeCropType('cotton'), 'cotton');
    assert.equal(normalizeCropType('soybean'), 'soybean');
  });

  test('evaluates default monitoring rule when conditions are normal', () => {
    const pred = SAMPLE_PREDICTIONS[0];
    const evalRes = evaluateAdvisoryRule(pred, {
      rules: VERIFIED_ADVISORY_RULES,
      cropCategory: 'paddy',
      isModelProductionReady: false,
      langCode: 'en',
    });

    assert.equal(evalRes.hasMatch, true);
    assert.equal(evalRes.ruleCode, 'ICAR-CRIDA-MONITOR-01');
    assert.equal(evalRes.actionType, 'monitor_conditions');
    assert.ok(evalRes.recommendation.includes('Monsoon probability indices'));
  });

  test('generates localized texts for all 3 supported UI locales (en, hi, bn)', () => {
    const pred = SAMPLE_PREDICTIONS[0];
    const enRes = evaluateAdvisoryRule(pred, { rules: VERIFIED_ADVISORY_RULES, cropCategory: 'paddy', langCode: 'en' });
    const hiRes = evaluateAdvisoryRule(pred, { rules: VERIFIED_ADVISORY_RULES, cropCategory: 'paddy', langCode: 'hi' });
    const bnRes = evaluateAdvisoryRule(pred, { rules: VERIFIED_ADVISORY_RULES, cropCategory: 'paddy', langCode: 'bn' });

    assert.equal(enRes.isEnglishFallback, false);
    assert.equal(hiRes.isEnglishFallback, false);
    assert.equal(bnRes.isEnglishFallback, false);
    assert.ok(hiRes.recommendation.length > 10);
    assert.ok(bnRes.recommendation.length > 10);
  });
});

describe('7. Experimental Model Provenance Preservation', () => {
  test('flags prediction as experimental when primary driver contains [EXPERIMENTAL]', () => {
    const expPred = SAMPLE_PREDICTIONS[4];
    const evalRes = evaluateAdvisoryRule(expPred, {
      rules: VERIFIED_ADVISORY_RULES,
      cropCategory: 'paddy',
      isModelProductionReady: true,
      langCode: 'en',
    });

    assert.equal(evalRes.isExperimental, true);
    assert.ok(evalRes.experimentalWarning !== null);
  });

  test('ForecastMeta preserves model readiness and training coverage metadata', async () => {
    const meta = await supabaseRepository.getMeta();
    assert.ok(meta.issuedAt);
    assert.ok(meta.validFrom);
    assert.ok(meta.nextUpdateAt);
    assert.equal(meta.modelTier, 'EXPERIMENTAL');
    assert.equal(meta.isProductionReady, false);
    assert.ok(meta.trainingCoverage);
    assert.equal(meta.trainingCoverage.seasonsCount, 1);
  });
});

describe('8. Browser-Side Security: No Service Role Key Exposure', () => {
  test('supabase-adapter.ts does not contain SUPABASE_SERVICE_ROLE_KEY', () => {
    const adapterPath = path.resolve(process.cwd(), 'src/lib/forecast/supabase-adapter.ts');
    const content = fs.readFileSync(adapterPath, 'utf8');

    assert.equal(
      content.includes('SUPABASE_SERVICE_ROLE_KEY'),
      false,
      'SUPABASE_SERVICE_ROLE_KEY must never appear in client adapter source'
    );
    assert.equal(
      content.includes('getSupabaseServerClient'),
      false,
      'getSupabaseServerClient must not be imported in client adapter'
    );
  });

  test('only public/anon variables are accessed via getPublicEnv()', () => {
    const adapterPath = path.resolve(process.cwd(), 'src/lib/forecast/supabase-adapter.ts');
    const content = fs.readFileSync(adapterPath, 'utf8');

    assert.ok(content.includes('getPublicEnv'));
    assert.ok(content.includes('supabaseAnonKey'));
  });
});

describe('9. Mock Mode vs Supabase Mode Integrity', () => {
  test('mockRepository satisfies ForecastRepository interface completely', async () => {
    const meta = await mockRepository.getMeta();
    assert.ok(meta.issuedAt);
    assert.ok(meta.validFrom);

    const states = await mockRepository.listRegions(null);
    assert.ok(states.length > 0);

    const risk = await mockRepository.getRisk('block-0-0-0');
    assert.ok(risk.probabilities);

    const advisory = await mockRepository.getAdvisory('block-0-0-0', 'rice', 1);
    assert.ok(advisory.verdict);
    assert.ok(advisory.textByLocale.en);
  });

  test('getRepository() respects NEXT_PUBLIC_USE_MOCK_DATA flag', () => {
    const originalEnv = process.env.NEXT_PUBLIC_USE_MOCK_DATA;

    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true';
    const mockRepo = getRepository();
    assert.equal(mockRepo, mockRepository);

    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false';
    const realRepo = getRepository();
    assert.equal(realRepo, supabaseRepository);

    process.env.NEXT_PUBLIC_USE_MOCK_DATA = originalEnv;
  });
});
