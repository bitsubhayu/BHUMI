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

import { derivePanchayatOutlook } from '../../src/lib/panchayat.ts';
import { resolveBlockGeometry, buildBlockGeoJSON } from '../../src/lib/geo.ts';

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

describe('5. On-Demand Panchayat Derived-View Labeling (Non-Persistent & Baseline-Preserving)', () => {
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
    assert.equal(derived.provenance.scenarioType, 'Provisional/illustrative block-derived terrain scenario');
    assert.match(derived.provenance.disclaimer, /no permanent panchayat database records exist/i);
  });

  it('preserves authoritative parent block forecast probabilities without synthetic lapse rates', () => {
    const derived = derivePanchayatOutlook(dummyBlock, dummyPrediction);

    // Baseline probabilities must be preserved without invented scaling
    assert.equal(derived.onsetProbability, dummyPrediction.onset_probability);
    assert.equal(derived.breakProbability, dummyPrediction.break_probability);
    assert.equal(derived.heavySpellProbability, dummyPrediction.heavy_spell_probability);
    assert.equal(derived.calibratedConfidence, dummyPrediction.calibrated_confidence);

    // Deltas are cleanly 0.0
    assert.equal(derived.adjustments.onsetDelta, 0.0);
    assert.equal(derived.adjustments.breakDelta, 0.0);
    assert.equal(derived.adjustments.heavyDelta, 0.0);
    assert.equal(derived.adjustments.isAdjusted, false);
  });
});

describe('6. Authentic Boundary GeoJSON Serialization & Centroid Fallback', () => {
  const authenticPolygonCoords = [
    [
      [73.81, 18.51],
      [73.89, 18.51],
      [73.89, 18.59],
      [73.81, 18.59],
      [73.81, 18.51],
    ],
  ];

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
      boundary_geom: {
        type: 'Polygon',
        coordinates: authenticPolygonCoords,
      },
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
      boundary_geom: null, // Missing boundary geom
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

  it('uses authentic PostGIS Polygon geometry when boundary_geom is available', () => {
    const res = resolveBlockGeometry(sampleBlocks[0]);
    assert.equal(res.geometry.type, 'Polygon');
    assert.deepEqual(res.geometry.coordinates, authenticPolygonCoords);
    assert.equal(res.representation, 'boundary_polygon');
    assert.equal(res.isCentroidFallback, false);
  });

  it('falls back to Point geometry at centroid when boundary_geom is missing without inventing fake polygons', () => {
    const res = resolveBlockGeometry(sampleBlocks[1]);
    assert.equal(res.geometry.type, 'Point');
    assert.deepEqual(res.geometry.coordinates, [sampleBlocks[1].centroid_lon, sampleBlocks[1].centroid_lat]);
    assert.equal(res.representation, 'centroid_fallback');
    assert.equal(res.isCentroidFallback, true);
  });

  it('buildBlockGeoJSON assembles FeatureCollection with dynamic risk and representation properties', () => {
    const fc = buildBlockGeoJSON(sampleBlocks, samplePredictions);
    assert.equal(fc.type, 'FeatureCollection');
    assert.equal(fc.features.length, 2);

    const f1 = fc.features[0];
    assert.equal(f1.geometry.type, 'Polygon');
    assert.equal(f1.properties.representation, 'boundary_polygon');
    assert.equal(f1.properties.is_centroid_fallback, false);
    assert.equal(f1.properties.week_1_break, 25.0);
    assert.equal(f1.properties.week_2_break, 55.0);

    const f2 = fc.features[1];
    assert.equal(f2.geometry.type, 'Point');
    assert.equal(f2.properties.representation, 'centroid_fallback');
    assert.equal(f2.properties.is_centroid_fallback, true);
  });
});
