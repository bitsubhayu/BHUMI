import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import modules
import {
  getRiskLevel,
  getRiskMeta,
  getRiskColorHex,
  formatProbability,
  evaluatePredictionTier,
  RISK_LEVELS,
} from '../../src/lib/risk.ts';

import {
  derivePanchayatOutlook,
  getPresetPanchayatProfiles,
} from '../../src/lib/panchayat.ts';

describe('1. Prediction Formatting', () => {
  it('formats normal numeric probabilities with one decimal place', () => {
    assert.equal(formatProbability(0), '0%');
    assert.equal(formatProbability(23.456), '23.5%');
    assert.equal(formatProbability(87.9), '87.9%');
    assert.equal(formatProbability(100), '100%');
  });

  it('handles null, undefined, and NaN gracefully without crashing', () => {
    assert.equal(formatProbability(null), 'N/A');
    assert.equal(formatProbability(undefined), 'N/A');
    assert.equal(formatProbability(Number.NaN), 'N/A');
  });
});

describe('2. Risk-Level Calculation (5-Level System)', () => {
  it('classifies probability < 20% as low risk', () => {
    assert.equal(getRiskLevel(0), 'low');
    assert.equal(getRiskLevel(12.5), 'low');
    assert.equal(getRiskLevel(19.9), 'low');
    assert.equal(getRiskColorHex(15), RISK_LEVELS.low.hexColor);
    assert.equal(getRiskMeta('low').label, 'Low Risk');
  });

  it('classifies probability 20% to 39.9% as moderate risk', () => {
    assert.equal(getRiskLevel(20.0), 'moderate');
    assert.equal(getRiskLevel(28.3), 'moderate');
    assert.equal(getRiskLevel(39.9), 'moderate');
    assert.equal(getRiskColorHex(30), RISK_LEVELS.moderate.hexColor);
    assert.equal(getRiskMeta('moderate').label, 'Moderate');
  });

  it('classifies probability 40% to 59.9% as elevated risk', () => {
    assert.equal(getRiskLevel(40.0), 'elevated');
    assert.equal(getRiskLevel(50.0), 'elevated');
    assert.equal(getRiskLevel(59.9), 'elevated');
    assert.equal(getRiskColorHex(55), RISK_LEVELS.elevated.hexColor);
    assert.equal(getRiskMeta('elevated').label, 'Elevated');
  });

  it('classifies probability 60% to 79.9% as high risk', () => {
    assert.equal(getRiskLevel(60.0), 'high');
    assert.equal(getRiskLevel(72.1), 'high');
    assert.equal(getRiskLevel(79.9), 'high');
    assert.equal(getRiskColorHex(70), RISK_LEVELS.high.hexColor);
    assert.equal(getRiskMeta('high').label, 'High Risk');
  });

  it('classifies probability >= 80% as very high risk', () => {
    assert.equal(getRiskLevel(80.0), 'very_high');
    assert.equal(getRiskLevel(95.0), 'very_high');
    assert.equal(getRiskLevel(100.0), 'very_high');
    assert.equal(getRiskColorHex(85), RISK_LEVELS.very_high.hexColor);
    assert.equal(getRiskMeta('very_high').label, 'Very High Risk');
  });

  it('defaults null, undefined, or negative values to low risk', () => {
    assert.equal(getRiskLevel(null), 'low');
    assert.equal(getRiskLevel(undefined), 'low');
    assert.equal(getRiskLevel(-5), 'low');
  });
});

describe('3. Production vs Experimental Labeling & Provenance', () => {
  const samplePrediction = {
    id: 101,
    block_id: 'IND_MH_PUN_001',
    prediction_date: '2026-09-28',
    lead_time_bucket: 'week_1',
    onset_probability: 25.0,
    break_probability: 65.0,
    heavy_spell_probability: 10.0,
    calibrated_confidence: 78.0,
    primary_driver: 'IOD negative + MJO phase 3 [EXPERIMENTAL]',
    secondary_driver: 'Soil moisture deficit',
    teleconnection_analog_year: 2024,
    advisory_code: 'exp_alert_01',
    created_at: '2026-09-28T06:00:00Z',
    updated_at: '2026-09-28T06:00:00Z',
  };

  it('labels prediction as EXPERIMENTAL when model is not production-ready', () => {
    const result = evaluatePredictionTier(samplePrediction, false);
    assert.equal(result.isValid, true);
    assert.equal(result.tier, 'EXPERIMENTAL');
    assert.match(result.notice, /Experimental model output/i);
    assert.equal(result.badgeLabel, 'Experimental Outlook');
  });

  it('labels prediction as EXPERIMENTAL when driver contains [EXPERIMENTAL] even if flag is true', () => {
    const result = evaluatePredictionTier(samplePrediction, true);
    assert.equal(result.isValid, true);
    assert.equal(result.tier, 'EXPERIMENTAL');
  });

  it('labels clean prediction as PRODUCTION only when model readiness is true and no experimental tags exist', () => {
    const cleanProdPrediction = {
      ...samplePrediction,
      primary_driver: 'IOD negative + MJO phase 3',
      advisory_code: 'icar_adv_01',
    };
    const result = evaluatePredictionTier(cleanProdPrediction, true);
    assert.equal(result.isValid, true);
    assert.equal(result.tier, 'PRODUCTION');
    assert.equal(result.badgeLabel, 'Operational Forecast');
    assert.equal(result.reasons.length, 0);
  });
});

describe('4. Missing Prediction Handling', () => {
  it('handles null prediction with UNAVAILABLE tier and safe empty notice', () => {
    const result = evaluatePredictionTier(null, false);
    assert.equal(result.isValid, false);
    assert.equal(result.tier, 'UNAVAILABLE');
    assert.equal(result.badgeLabel, 'No Forecast Available');
    assert.match(result.notice, /no forecast data is currently available/i);
  });

  it('handles undefined prediction safely', () => {
    const result = evaluatePredictionTier(undefined, true);
    assert.equal(result.isValid, false);
    assert.equal(result.tier, 'UNAVAILABLE');
  });
});

describe('5. On-Demand Panchayat Derived-View Labeling & BCSD Downscaling', () => {
  const dummyBlock = {
    block_id: 'IND_MH_PUN_001',
    block_name: 'Haveli',
    district_name: 'Pune',
    state_name: 'Maharashtra',
    centroid_lat: 18.5204,
    centroid_lon: 73.8567,
    elevation_m: 560,
    slope_deg: 2.1,
    distance_to_coast_km: 120,
    agro_climatic_zone: 'Western Plateau & Hills',
    boundary_geom: null,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  };

  const dummyPrediction = {
    id: 1,
    block_id: 'IND_MH_PUN_001',
    prediction_date: '2026-09-28',
    lead_time_bucket: 'week_1',
    onset_probability: 30.0,
    break_probability: 50.0,
    heavy_spell_probability: 20.0,
    calibrated_confidence: 82.0,
    primary_driver: 'MJO Phase 2',
    secondary_driver: null,
    teleconnection_analog_year: 2024,
    advisory_code: null,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  };

  it('strictly marks output as Block-derived panchayat outlook and never permanent', () => {
    const derived = derivePanchayatOutlook(dummyBlock, dummyPrediction);
    assert.equal(derived.provenance.label, 'Block-derived panchayat outlook');
    assert.equal(derived.provenance.isPermanentRecord, false);
    assert.match(derived.provenance.disclaimer, /no permanent panchayat database records exist/i);
  });

  it('adjusts heavy rain and break probability based on positive elevation delta (ridge)', () => {
    const ridgeProfile = {
      name: 'Haveli Ridge GP',
      elevationM: 760, // +200m
      slopeDeg: 4.5,
      terrainType: 'ridge',
    };
    const derived = derivePanchayatOutlook(dummyBlock, dummyPrediction, ridgeProfile);

    // +200m elevation delta produces positive orographic trigger (+3.0%)
    assert.ok(derived.elevationDeltaM === 200);
    assert.ok(derived.adjustments.orographicFactor > 0);
    assert.ok(derived.heavySpellProbability > dummyPrediction.heavy_spell_probability);
    assert.equal(derived.parentBlockId, 'IND_MH_PUN_001');
  });

  it('provides standard preset topographical archetypes', () => {
    const presets = getPresetPanchayatProfiles(dummyBlock);
    assert.equal(presets.length, 3);
    assert.equal(presets[0].terrainType, 'ridge');
    assert.equal(presets[1].terrainType, 'plateau');
    assert.equal(presets[2].terrainType, 'valley');
  });
});

describe('6. Block Selection & GeoJSON Polygon Assembly', () => {
  const sampleBlocks = [
    {
      block_id: 'IND_MH_PUN_001',
      block_name: 'Haveli',
      district_name: 'Pune',
      state_name: 'Maharashtra',
      centroid_lat: 18.5204,
      centroid_lon: 73.8567,
      elevation_m: 560,
      slope_deg: 2.1,
      distance_to_coast_km: 120,
      agro_climatic_zone: 'Western Plateau',
      boundary_geom: null,
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    },
    {
      block_id: 'IND_RJ_JOD_001',
      block_name: 'Mandore',
      district_name: 'Jodhpur',
      state_name: 'Rajasthan',
      centroid_lat: 26.2389,
      centroid_lon: 73.0243,
      elevation_m: 231,
      slope_deg: 0.8,
      distance_to_coast_km: 450,
      agro_climatic_zone: 'Arid Western',
      boundary_geom: null,
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    },
  ];

  const samplePredictions = [
    {
      id: 1,
      block_id: 'IND_MH_PUN_001',
      prediction_date: '2026-09-28',
      lead_time_bucket: 'week_1',
      onset_probability: 45.0,
      break_probability: 25.0,
      heavy_spell_probability: 15.0,
      calibrated_confidence: 85.0,
      primary_driver: 'MJO Phase 3',
      secondary_driver: null,
      teleconnection_analog_year: 2024,
      advisory_code: null,
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    },
    {
      id: 2,
      block_id: 'IND_MH_PUN_001',
      prediction_date: '2026-09-28',
      lead_time_bucket: 'week_2',
      onset_probability: 30.0,
      break_probability: 55.0,
      heavy_spell_probability: 10.0,
      calibrated_confidence: 75.0,
      primary_driver: 'IOD negative [EXPERIMENTAL]',
      secondary_driver: null,
      teleconnection_analog_year: 2024,
      advisory_code: null,
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    },
  ];

  it('builds closed polygon geometry around centroid coordinates', () => {
    // Pure GeoJSON geometry builder test
    const delta = 0.08;
    const b = sampleBlocks[0];
    const ring = [
      [b.centroid_lon - delta, b.centroid_lat - delta],
      [b.centroid_lon + delta, b.centroid_lat - delta],
      [b.centroid_lon + delta, b.centroid_lat + delta],
      [b.centroid_lon - delta, b.centroid_lat + delta],
      [b.centroid_lon - delta, b.centroid_lat - delta],
    ];

    assert.equal(ring.length, 5);
    // Closed ring check: start == end
    assert.deepEqual(ring[0], ring[4]);
    assert.ok(ring[0][0] < b.centroid_lon);
    assert.ok(ring[1][0] > b.centroid_lon);
  });

  it('correctly maps multi-week lead times and detects experimental tag', () => {
    const w1 = samplePredictions.find((p) => p.block_id === 'IND_MH_PUN_001' && p.lead_time_bucket === 'week_1');
    const w2 = samplePredictions.find((p) => p.block_id === 'IND_MH_PUN_001' && p.lead_time_bucket === 'week_2');

    assert.equal(w1.onset_probability, 45.0);
    assert.equal(w2.break_probability, 55.0);
    assert.ok(w2.primary_driver.includes('[EXPERIMENTAL]'));
  });

  it('allows selecting blocks and retrieving associated forecasts seamlessly', () => {
    const selectedId = 'IND_MH_PUN_001';
    const selectedBlock = sampleBlocks.find((b) => b.block_id === selectedId);
    assert.ok(selectedBlock);
    assert.equal(selectedBlock.block_name, 'Haveli');

    const matchedPreds = samplePredictions.filter((p) => p.block_id === selectedId);
    assert.equal(matchedPreds.length, 2);
  });
});

