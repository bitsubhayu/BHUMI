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
import { parseModelMetadata, FALLBACK_MODEL_METADATA } from '../../src/lib/metadata.ts';
import {
  evaluateAdvisoryRule,
  normalizeCropType,
  evaluateTriggerCondition,
  isDefaultTriggerCondition,
  parseConditionClause,
  evaluateClause,
  determineCandidateAction,
} from '../../src/lib/advisory/engine.ts';
import {
  resolveLocalizedTemplate,
  isLanguageSupported,
  SUPPORTED_LANGUAGES,
} from '../../src/lib/advisory/templates.ts';
import {
  VERIFIED_ADVISORY_RULES,
} from '../../src/lib/advisory/rules.ts';

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

describe('7. Model Metadata Integrity & Zero Preservation', () => {
  it('preserves legitimate zero values for seasons, blocks, and samples', () => {
    const zeroMetadata = {
      model_version: 'v1.0.0',
      model_name: 'BHUMI-Zero-Test',
      model_tier: 'EXPERIMENTAL',
      model_readiness: {
        status: 'UNAVAILABLE',
        is_production_ready: false,
        reasons: ['No historical data ingested.'],
        archive_summary: {
          seasons_count: 0,
          blocks_count: 0,
          samples_count: 0,
          seasons: [],
          class_distribution: {},
        },
      },
      training_coverage: {
        seasons_count: 0,
        seasons_list: [],
        blocks_count: 0,
        samples_generated: 0,
        class_distribution: {},
        gru_status: 'UNAVAILABLE',
      },
    };

    const parsed = parseModelMetadata(zeroMetadata);

    // Assert zero is strictly preserved and not overridden by 1, 2, or 96
    assert.equal(parsed.trainingCoverage.seasonsCount, 0);
    assert.equal(parsed.trainingCoverage.blocksCount, 0);
    assert.equal(parsed.trainingCoverage.samplesGenerated, 0);
    assert.deepEqual(parsed.trainingCoverage.seasonsList, []);
    assert.deepEqual(parsed.trainingCoverage.classDistribution, {});
    assert.equal(parsed.readinessStatus, 'UNAVAILABLE');
    assert.equal(parsed.isProductionReady, false);
  });

  it('produces neutral UNAVAILABLE values on missing or empty metadata without inventing coverage', () => {
    // Completely empty metadata object
    const emptyParsed = parseModelMetadata({});

    assert.equal(emptyParsed.trainingCoverage.seasonsCount, 0);
    assert.equal(emptyParsed.trainingCoverage.blocksCount, 0);
    assert.equal(emptyParsed.trainingCoverage.samplesGenerated, 0);
    assert.deepEqual(emptyParsed.trainingCoverage.seasonsList, []);
    assert.deepEqual(emptyParsed.trainingCoverage.classDistribution, {});
    assert.equal(emptyParsed.readinessStatus, 'UNAVAILABLE');
    assert.equal(emptyParsed.gruStatus, 'UNAVAILABLE');
    assert.equal(emptyParsed.modelVersion, 'UNAVAILABLE');
    assert.equal(emptyParsed.isProductionReady, false);

    // Null input
    const nullParsed = parseModelMetadata(null);
    assert.equal(nullParsed.trainingCoverage.seasonsCount, 0);
    assert.equal(nullParsed.trainingCoverage.blocksCount, 0);
    assert.equal(nullParsed.trainingCoverage.samplesGenerated, 0);
    assert.deepEqual(nullParsed.trainingCoverage.seasonsList, []);

    // Static fallback constant
    assert.equal(FALLBACK_MODEL_METADATA.trainingCoverage.seasonsCount, 0);
    assert.equal(FALLBACK_MODEL_METADATA.trainingCoverage.blocksCount, 0);
    assert.equal(FALLBACK_MODEL_METADATA.trainingCoverage.samplesGenerated, 0);
    assert.deepEqual(FALLBACK_MODEL_METADATA.trainingCoverage.seasonsList, []);
    assert.deepEqual(FALLBACK_MODEL_METADATA.trainingCoverage.classDistribution, {});
    assert.equal(FALLBACK_MODEL_METADATA.readinessStatus, 'UNAVAILABLE');
    assert.equal(FALLBACK_MODEL_METADATA.isProductionReady, false);
  });
});

describe('8. Geometry Behavior: Authentic PostGIS Boundary or Centroid Point Only', () => {
  const dummyBlock = {
    block_id: 'IND_TEST_001',
    block_name: 'Test Block',
    district_name: 'Test District',
    state_name: 'Test State',
    centroid_lat: 19.12,
    centroid_lon: 74.56,
    elevation_m: 500,
    slope_deg: 1.5,
    distance_to_coast_km: 150,
    agro_climatic_zone: 'Zone 1',
    boundary_geom: null,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  };

  it('parses valid stringified JSON MultiPolygon geometry accurately', () => {
    const multiPolygonJson = JSON.stringify({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [74.5, 19.1],
            [74.6, 19.1],
            [74.6, 19.2],
            [74.5, 19.2],
            [74.5, 19.1],
          ],
        ],
      ],
    });

    const blockWithMulti = { ...dummyBlock, boundary_geom: multiPolygonJson };
    const res = resolveBlockGeometry(blockWithMulti);

    assert.equal(res.geometry.type, 'MultiPolygon');
    assert.equal(res.representation, 'boundary_polygon');
    assert.equal(res.isCentroidFallback, false);
  });

  it('safely falls back to centroid Point when geometry is raw WKT or unsupported format without inventing polygons', () => {
    // Raw WKT string that is not JSON
    const blockWithWkt = {
      ...dummyBlock,
      boundary_geom: 'POLYGON((74.5 19.1, 74.6 19.1, 74.6 19.2, 74.5 19.2, 74.5 19.1))',
    };
    const res = resolveBlockGeometry(blockWithWkt);

    assert.equal(res.geometry.type, 'Point');
    assert.deepEqual(res.geometry.coordinates, [74.56, 19.12]);
    assert.equal(res.representation, 'centroid_fallback');
    assert.equal(res.isCentroidFallback, true);
  });

  it('safely falls back to centroid Point when boundary_geom is null or undefined without bounding box fabrication', () => {
    const blockNull = { ...dummyBlock, boundary_geom: null };
    const resNull = resolveBlockGeometry(blockNull);

    assert.equal(resNull.geometry.type, 'Point');
    assert.deepEqual(resNull.geometry.coordinates, [74.56, 19.12]);
    assert.equal(resNull.representation, 'centroid_fallback');
    assert.equal(resNull.isCentroidFallback, true);

    const blockUndefined = { ...dummyBlock, boundary_geom: undefined };
    const resUndefined = resolveBlockGeometry(blockUndefined);

    assert.equal(resUndefined.geometry.type, 'Point');
    assert.deepEqual(resUndefined.geometry.coordinates, [74.56, 19.12]);
    assert.equal(resUndefined.representation, 'centroid_fallback');
    assert.equal(resUndefined.isCentroidFallback, true);
  });
});

const dummyPredictionOnset = {
  id: 101,
  block_id: 'IND_MH_PUN_001',
  prediction_date: '2026-09-28',
  lead_time_bucket: 'week_1',
  onset_probability: 65.0,
  break_probability: 20.0,
  heavy_spell_probability: 15.0,
  calibrated_confidence: 85.0,
  primary_driver: 'MJO Phase 3 Active',
  secondary_driver: null,
  teleconnection_analog_year: 2024,
  advisory_code: null,
  created_at: '2026-09-28T00:00:00Z',
  updated_at: '2026-09-28T00:00:00Z',
};

const dummyPredictionBreak = {
  id: 102,
  block_id: 'IND_MH_PUN_001',
  prediction_date: '2026-09-28',
  lead_time_bucket: 'week_2',
  onset_probability: 20.0,
  break_probability: 60.0,
  heavy_spell_probability: 10.0,
  calibrated_confidence: 78.0,
  primary_driver: 'Equatorial Rossby Wave',
  secondary_driver: null,
  teleconnection_analog_year: 2024,
  advisory_code: null,
  created_at: '2026-09-28T00:00:00Z',
  updated_at: '2026-09-28T00:00:00Z',
};

const dummyPredictionNoTrigger = {
  id: 103,
  block_id: 'IND_MH_PUN_001',
  prediction_date: '2026-09-28',
  lead_time_bucket: 'week_3',
  onset_probability: 10.0,
  break_probability: 12.0,
  heavy_spell_probability: 5.0,
  calibrated_confidence: 60.0,
  primary_driver: 'Neutral Teleconnections',
  secondary_driver: null,
  teleconnection_analog_year: null,
  advisory_code: null,
  created_at: '2026-09-28T00:00:00Z',
  updated_at: '2026-09-28T00:00:00Z',
};

describe('9. Rule Matching & Deterministic Selection', () => {

  it('parses and evaluates comparison and IN clauses safely via condition DSL', () => {
    const compParsed = parseConditionClause('break_probability >= 50');
    assert.deepEqual(compParsed, {
      type: 'comparison',
      field: 'break_probability',
      operator: '>=',
      targetValue: 50,
    });
    assert.equal(evaluateClause(compParsed, { break_probability: 50 }), true);
    assert.equal(evaluateClause(compParsed, { break_probability: 49.9 }), false);

    const inParsed = parseConditionClause('lead_time_bucket IN (week_1, week_2)');
    assert.deepEqual(inParsed, {
      type: 'in',
      field: 'lead_time_bucket',
      allowedValues: ['week_1', 'week_2'],
    });
    assert.equal(evaluateClause(inParsed, { lead_time_bucket: 'week_1' }), true);
    assert.equal(evaluateClause(inParsed, { lead_time_bucket: 'week_3' }), false);

    assert.equal(parseConditionClause('malicious_func()'), null);
  });

  it('matches active general rule when trigger threshold is met', () => {
    const result = evaluateAdvisoryRule(dummyPredictionBreak, {
      rules: VERIFIED_ADVISORY_RULES,
      selectedCrop: 'general',
      targetLanguage: 'en',
    });

    assert.equal(result.hasMatchingRule, true);
    assert.equal(result.action, 'delay_sowing');
    assert.equal(result.ruleCode, 'ICAR-CRIDA-DELAY-01');
    assert.equal(result.icarReferenceCode, 'ICAR-CRIDA-KHARIF-STD-01');
    assert.equal(result.isGeneralFallback, false);
    assert.match(result.template.title, /Delay.*Sowing/i);
    assert.ok(result.template.suggested_measures.length > 0);
  });

  it('matches at boundary 50.0 and rejects at 49.9 for break_probability >= 50', () => {
    const rule = {
      rule_code: 'THRESHOLD-BOUNDARY-TEST',
      crop_category: 'general',
      action_type: 'delay_sowing',
      trigger_condition: 'break_probability >= 50',
      english_title: 'Delay Test',
      english_recommendation: 'Delay Rec',
      suggested_measures: [],
      is_active: true,
      icar_reference_code: 'ICAR-BOUNDARY-TEST',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    };

    const predAt50 = { ...dummyPredictionBreak, break_probability: 50.0 };
    const resultAt50 = evaluateAdvisoryRule(predAt50, { rules: [rule], selectedCrop: 'general' });
    assert.equal(resultAt50.hasMatchingRule, true);
    assert.equal(resultAt50.ruleCode, 'THRESHOLD-BOUNDARY-TEST');
    assert.equal(resultAt50.action, 'delay_sowing');

    const predAt49_9 = { ...dummyPredictionBreak, break_probability: 49.9 };
    const resultAt49_9 = evaluateAdvisoryRule(predAt49_9, { rules: [rule], selectedCrop: 'general' });
    assert.equal(resultAt49_9.hasMatchingRule, false);
    assert.equal(resultAt49_9.ruleCode, 'NO_VERIFIED_RULE');
    assert.equal(resultAt49_9.action, null);
    assert.equal(resultAt49_9.template.title, 'No verified advisory rule is available for this forecast.');
  });

  it('evaluates AND conditions strictly requiring all clauses to be satisfied', () => {
    const andRule = {
      rule_code: 'AND-CONDITION-TEST',
      crop_category: 'general',
      action_type: 'safe_to_sow',
      trigger_condition: 'onset_probability >= 50 AND break_probability <= 30',
      english_title: 'Safe Sowing Window',
      english_recommendation: 'Rec',
      suggested_measures: [],
      is_active: true,
      icar_reference_code: 'ICAR-AND-TEST',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    };

    // Both true (onset=55 >= 50, break=25 <= 30) -> true
    const bothTrue = { ...dummyPredictionOnset, onset_probability: 55.0, break_probability: 25.0 };
    assert.equal(evaluateTriggerCondition(bothTrue, andRule.trigger_condition), true);
    assert.equal(evaluateAdvisoryRule(bothTrue, { rules: [andRule] }).hasMatchingRule, true);

    // First true, second false (onset=55 >= 50, break=35 > 30) -> false
    const secondFalse = { ...dummyPredictionOnset, onset_probability: 55.0, break_probability: 35.0 };
    assert.equal(evaluateTriggerCondition(secondFalse, andRule.trigger_condition), false);
    assert.equal(evaluateAdvisoryRule(secondFalse, { rules: [andRule] }).hasMatchingRule, false);

    // First false (onset=45 < 50), second true -> false
    const firstFalse = { ...dummyPredictionOnset, onset_probability: 45.0, break_probability: 25.0 };
    assert.equal(evaluateTriggerCondition(firstFalse, andRule.trigger_condition), false);
    assert.equal(evaluateAdvisoryRule(firstFalse, { rules: [andRule] }).hasMatchingRule, false);
  });

  it('evaluates lead_time_bucket IN (...) sets accurately', () => {
    const inRule = {
      rule_code: 'IN-SET-TEST',
      crop_category: 'general',
      action_type: 'delay_sowing',
      trigger_condition: 'lead_time_bucket IN (week_1, week_2)',
      english_title: 'Delay Test',
      english_recommendation: 'Rec',
      suggested_measures: [],
      is_active: true,
      icar_reference_code: 'ICAR-IN-TEST',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    };

    const predWeek1 = { ...dummyPredictionBreak, lead_time_bucket: 'week_1' };
    assert.equal(evaluateTriggerCondition(predWeek1, inRule.trigger_condition), true);

    const predWeek2 = { ...dummyPredictionBreak, lead_time_bucket: 'week_2' };
    assert.equal(evaluateTriggerCondition(predWeek2, inRule.trigger_condition), true);

    const predWeek3 = { ...dummyPredictionBreak, lead_time_bucket: 'week_3' };
    assert.equal(evaluateTriggerCondition(predWeek3, inRule.trigger_condition), false);

    const predWeek4 = { ...dummyPredictionBreak, lead_time_bucket: 'week_4' };
    assert.equal(evaluateTriggerCondition(predWeek4, inRule.trigger_condition), false);
  });

  it('dynamically adapts matching behavior when rule trigger_condition changes in data', () => {
    const dynamicRule = {
      rule_code: 'DYNAMIC-DATA-RULE',
      crop_category: 'general',
      action_type: 'prepare_irrigation',
      trigger_condition: 'break_probability >= 40',
      english_title: 'Irrigation Alert',
      english_recommendation: 'Rec',
      suggested_measures: [],
      is_active: true,
      icar_reference_code: 'ICAR-DYN-01',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    };

    const predAt45 = { ...dummyPredictionBreak, break_probability: 45.0, lead_time_bucket: 'week_3' };

    // Matches threshold 40
    const res1 = evaluateAdvisoryRule(predAt45, { rules: [dynamicRule] });
    assert.equal(res1.hasMatchingRule, true);
    assert.equal(res1.ruleCode, 'DYNAMIC-DATA-RULE');

    // Without changing engine code, change data threshold in rule to 60
    const updatedDataRule = { ...dynamicRule, trigger_condition: 'break_probability >= 60' };
    const res2 = evaluateAdvisoryRule(predAt45, { rules: [updatedDataRule] });
    assert.equal(res2.hasMatchingRule, false);
    assert.equal(res2.ruleCode, 'NO_VERIFIED_RULE');

    // Now test with break_probability 65 against updated rule
    const predAt65 = { ...predAt45, break_probability: 65.0 };
    const res3 = evaluateAdvisoryRule(predAt65, { rules: [updatedDataRule] });
    assert.equal(res3.hasMatchingRule, true);
    assert.equal(res3.ruleCode, 'DYNAMIC-DATA-RULE');
  });

  it('strictly ignores inactive rules even when conditions match', () => {
    const inactiveRule = {
      rule_code: 'INACTIVE-RULE-TEST',
      crop_category: 'general',
      action_type: 'delay_sowing',
      trigger_condition: 'break_probability >= 50 AND lead_time_bucket IN (week_1, week_2)',
      english_title: 'Inactive template that must never trigger',
      english_recommendation: 'Inactive recommendation',
      suggested_measures: [],
      is_active: false,
      icar_reference_code: 'ICAR-TEST-INACTIVE',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    };

    const result = evaluateAdvisoryRule(dummyPredictionBreak, {
      rules: [inactiveRule, ...VERIFIED_ADVISORY_RULES],
      selectedCrop: 'general',
      targetLanguage: 'en',
    });

    assert.equal(result.hasMatchingRule, true);
    assert.notEqual(result.ruleCode, 'INACTIVE-RULE-TEST');
    assert.equal(result.ruleCode, 'ICAR-CRIDA-DELAY-01');
  });

  it('prioritizes crop-specific rule over general rule', () => {
    const resultPaddy = evaluateAdvisoryRule(dummyPredictionOnset, {
      rules: VERIFIED_ADVISORY_RULES,
      selectedCrop: 'paddy',
      targetLanguage: 'en',
    });

    assert.equal(resultPaddy.hasMatchingRule, true);
    assert.equal(resultPaddy.ruleCode, 'ICAR-NRRI-PAD-SOW-01');
    assert.equal(resultPaddy.icarReferenceCode, 'ICAR-NRRI-CRIDA-03');
    assert.equal(resultPaddy.cropType, 'paddy');
    assert.equal(resultPaddy.isGeneralFallback, false);
    assert.match(resultPaddy.template.title, /Paddy/i);
  });

  it('falls back strictly to verified general rule when crop has no specific rule for condition', () => {
    const resultGroundnut = evaluateAdvisoryRule(dummyPredictionBreak, {
      rules: VERIFIED_ADVISORY_RULES,
      selectedCrop: 'groundnut',
      targetLanguage: 'en',
    });

    assert.equal(resultGroundnut.hasMatchingRule, true);
    assert.equal(resultGroundnut.ruleCode, 'ICAR-CRIDA-DELAY-01');
    assert.equal(resultGroundnut.cropType, 'general');
    assert.equal(resultGroundnut.isGeneralFallback, true);
  });

  it('matches default rule (ICAR-CRIDA-MONITOR-01) when no other verified active rule matches', () => {
    const result = evaluateAdvisoryRule(dummyPredictionNoTrigger, {
      rules: VERIFIED_ADVISORY_RULES,
      selectedCrop: 'general',
      targetLanguage: 'en',
    });

    assert.equal(result.hasMatchingRule, true);
    assert.equal(result.ruleCode, 'ICAR-CRIDA-MONITOR-01');
    assert.equal(result.action, 'monitor_conditions');
    assert.equal(result.actionType, 'monitor_conditions');
    assert.equal(result.icarReferenceCode, 'ICAR-CRIDA-KHARIF-STD-05');
    assert.match(result.template.title, /Normal Seasonal Monitoring/i);
    assert.ok(result.template.suggested_measures.length > 0);
  });

  it('matching non-default rule always beats the default rule', () => {
    const result = evaluateAdvisoryRule(dummyPredictionBreak, {
      rules: VERIFIED_ADVISORY_RULES,
      selectedCrop: 'general',
      targetLanguage: 'en',
    });

    assert.equal(result.hasMatchingRule, true);
    assert.equal(result.ruleCode, 'ICAR-CRIDA-DELAY-01');
    assert.equal(result.action, 'delay_sowing');
    assert.notEqual(result.ruleCode, 'ICAR-CRIDA-MONITOR-01');
  });

  it('crop-specific matching rule beats a general default rule', () => {
    const result = evaluateAdvisoryRule(dummyPredictionOnset, {
      rules: VERIFIED_ADVISORY_RULES,
      selectedCrop: 'paddy',
      targetLanguage: 'en',
    });

    assert.equal(result.hasMatchingRule, true);
    assert.equal(result.ruleCode, 'ICAR-NRRI-PAD-SOW-01');
    assert.equal(result.cropType, 'paddy');
    assert.notEqual(result.ruleCode, 'ICAR-CRIDA-MONITOR-01');
  });

  it('strictly ignores an inactive default rule and falls back to NO_VERIFIED_RULE', () => {
    const inactiveDefaultRule = {
      rule_code: 'INACTIVE-DEFAULT-RULE',
      crop_category: 'general',
      action_type: 'monitor_conditions',
      trigger_condition: 'default',
      english_title: 'Inactive Monitor',
      english_recommendation: 'Inactive rec',
      suggested_measures: [],
      is_active: false,
      icar_reference_code: 'ICAR-INACTIVE-DEFAULT',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z',
    };

    const nonDefaultRules = VERIFIED_ADVISORY_RULES.filter(
      (r) => (r.trigger_condition || '').toLowerCase() !== 'default'
    );

    const result = evaluateAdvisoryRule(dummyPredictionNoTrigger, {
      rules: [inactiveDefaultRule, ...nonDefaultRules],
      selectedCrop: 'general',
      targetLanguage: 'en',
    });

    assert.equal(result.hasMatchingRule, false);
    assert.equal(result.ruleCode, 'NO_VERIFIED_RULE');
    assert.equal(result.action, null);
    assert.equal(result.icarReferenceCode, null);
    assert.equal(result.template.title, 'No verified advisory rule is available for this forecast.');
  });

  it('returns explicit NO_VERIFIED_RULE state when no non-default matches and no active default exists', () => {
    const nonDefaultRules = VERIFIED_ADVISORY_RULES.filter(
      (r) => (r.trigger_condition || '').toLowerCase() !== 'default'
    );

    const result = evaluateAdvisoryRule(dummyPredictionNoTrigger, {
      rules: nonDefaultRules,
      selectedCrop: 'general',
      targetLanguage: 'en',
    });

    assert.equal(result.hasMatchingRule, false);
    assert.equal(result.ruleCode, 'NO_VERIFIED_RULE');
    assert.equal(result.action, null);
    assert.equal(result.icarReferenceCode, null);
    assert.equal(result.template.title, 'No verified advisory rule is available for this forecast.');
    assert.match(result.template.recommendation, /No verified advisory rule is available for this forecast/i);
  });

  it('returns explicit unverified message when rules array is empty', () => {
    const result = evaluateAdvisoryRule(dummyPredictionBreak, {
      rules: [],
      selectedCrop: 'general',
      targetLanguage: 'en',
    });

    assert.equal(result.hasMatchingRule, false);
    assert.equal(result.template.title, 'No verified advisory rule is available for this forecast.');
  });

  it('determineCandidateAction contains zero hardcoded thresholds and returns null without matched rule', () => {
    const matchedRule = VERIFIED_ADVISORY_RULES.find((r) => r.rule_code === 'ICAR-CRIDA-DELAY-01');
    assert.equal(determineCandidateAction(dummyPredictionBreak, matchedRule), 'delay_sowing');
    assert.equal(determineCandidateAction(dummyPredictionNoTrigger, null), null);
  });

  it('does not select a rule merely because action_type or advisory_code matches when trigger_condition is not met', () => {
    const nonDefaultRules = VERIFIED_ADVISORY_RULES.filter(
      (r) => (r.trigger_condition || '').toLowerCase() !== 'default'
    );

    const predWithActionCode = {
      ...dummyPredictionNoTrigger,
      advisory_code: 'delay_sowing',
      break_probability: 10.0,
      lead_time_bucket: 'week_1',
    };

    const result = evaluateAdvisoryRule(predWithActionCode, {
      rules: nonDefaultRules,
      selectedCrop: 'general',
      targetLanguage: 'en',
    });

    assert.equal(result.hasMatchingRule, false);
    assert.equal(result.ruleCode, 'NO_VERIFIED_RULE');
    assert.equal(result.template.title, 'No verified advisory rule is available for this forecast.');
  });

  it('correctly identifies default trigger condition and safely ignores non-default', () => {
    assert.equal(isDefaultTriggerCondition('default'), true);
    assert.equal(isDefaultTriggerCondition('DEFAULT'), true);
    assert.equal(isDefaultTriggerCondition('  default  '), true);
    assert.equal(isDefaultTriggerCondition('break_probability >= 50'), false);
    assert.equal(isDefaultTriggerCondition(null), false);
    assert.equal(isDefaultTriggerCondition(undefined), false);
    assert.equal(isDefaultTriggerCondition(''), false);
  });

  it('strictly avoids eval(), Function(), or unsafe arbitrary expression execution in engine source', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const enginePath = path.resolve('src/lib/advisory/engine.ts');
    const content = fs.readFileSync(enginePath, 'utf-8');
    const codeWithoutComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    assert.doesNotMatch(codeWithoutComments, /\beval\s*\(/);
    assert.doesNotMatch(codeWithoutComments, /new\s+Function\s*\(/);
    assert.doesNotMatch(codeWithoutComments, /\bFunction\s*\(/);
  });
});

describe('10. Multilingual Static Templates & Fallback Integrity', () => {
  const sampleRule = VERIFIED_ADVISORY_RULES.find((r) => r.rule_code === 'ICAR-CRIDA-SOW-01');

  it('resolves English template correctly with isEnglishFallback false', () => {
    assert.ok(sampleRule, 'Sample rule must exist in verified registry');
    const res = resolveLocalizedTemplate(sampleRule, 'en');
    assert.equal(res.isEnglishFallback, false);
    assert.equal(res.sourceLanguage, 'en');
    assert.match(res.content.title, /Sowing Window/i);
    assert.ok(res.content.suggested_measures.length > 0);
  });

  it('resolves verified localized translations for supported languages', () => {
    assert.ok(sampleRule, 'Sample rule must exist in verified registry');
    const hindiRes = resolveLocalizedTemplate(sampleRule, 'hi');
    assert.equal(hindiRes.isEnglishFallback, false);
    assert.equal(hindiRes.sourceLanguage, 'hi');
    assert.match(hindiRes.content.title, /खरीफ बुवाई/i);

    const marathiRes = resolveLocalizedTemplate(sampleRule, 'mr');
    assert.equal(marathiRes.isEnglishFallback, false);
    assert.equal(marathiRes.sourceLanguage, 'mr');
    assert.match(marathiRes.content.title, /पेरणी/i);

    const teluguRes = resolveLocalizedTemplate(sampleRule, 'te');
    assert.equal(teluguRes.isEnglishFallback, false);
    assert.equal(teluguRes.sourceLanguage, 'te');
    assert.match(teluguRes.content.title, /విత్తనాలు/i);

    const bengaliRes = resolveLocalizedTemplate(sampleRule, 'bn');
    assert.equal(bengaliRes.isEnglishFallback, false);
    assert.equal(bengaliRes.sourceLanguage, 'bn');
    assert.match(bengaliRes.content.title, /বপন/i);
  });

  it('supports all 10 required languages in the static template library', () => {
    assert.ok(sampleRule, 'Sample rule must exist in verified registry');
    const expectedLangs = ['en', 'hi', 'mr', 'te', 'ta', 'bn', 'gu', 'kn', 'pa', 'or'];
    assert.equal(SUPPORTED_LANGUAGES.length, 10);
    for (const lang of expectedLangs) {
      assert.equal(isLanguageSupported(lang), true);
      const res = resolveLocalizedTemplate(sampleRule, lang);
      assert.ok(res.content.title.length > 0);
      assert.ok(res.content.recommendation.length > 0);
    }
  });

  it('falls back to English with isEnglishFallback true when localized translation is missing', () => {
    const partialRule = {
      rule_code: 'TEST-PARTIAL',
      crop_category: 'general',
      action_type: 'safe_to_sow',
      english_title: 'English Title',
      english_recommendation: 'English Recommendation',
      suggested_measures: ['Measure 1'],
      localized_templates: {},
    };

    const res = resolveLocalizedTemplate(partialRule, 'pa');
    assert.equal(res.isEnglishFallback, true);
    assert.equal(res.sourceLanguage, 'en');
    assert.equal(res.content.title, 'English Title');
    assert.equal(res.content.recommendation, 'English Recommendation');
  });

  it('visibly identifies English fallback in evaluation result', () => {
    const partialRule = {
      rule_code: 'PARTIAL-LANG-TEST',
      crop_category: 'general',
      action_type: 'safe_to_sow',
      trigger_condition: 'onset_probability >= 50',
      english_title: 'English Title',
      english_recommendation: 'English Rec',
      suggested_measures: [],
      is_active: true,
      icar_reference_code: 'ICAR-REF-PARTIAL',
      localized_templates: {
        en: { title: 'English Title', recommendation: 'English Rec', suggested_measures: [] },
      },
    };

    const result = evaluateAdvisoryRule(dummyPredictionOnset, {
      rules: [partialRule],
      selectedCrop: 'general',
      targetLanguage: 'ta',
    });

    assert.equal(result.isEnglishFallback, true);
    assert.equal(result.language, 'ta');
  });
});

describe('11. Experimental Model Provenance & Operational Caution', () => {
  const experimentalPrediction = {
    id: 201,
    block_id: 'IND_MH_PUN_001',
    prediction_date: '2026-09-28',
    lead_time_bucket: 'week_2',
    onset_probability: 30.0,
    break_probability: 65.0,
    heavy_spell_probability: 10.0,
    calibrated_confidence: 72.0,
    primary_driver: 'IOD negative [EXPERIMENTAL]',
    secondary_driver: null,
    teleconnection_analog_year: 2024,
    advisory_code: null,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  };

  const operationalPrediction = {
    id: 202,
    block_id: 'IND_MH_PUN_001',
    prediction_date: '2026-09-28',
    lead_time_bucket: 'week_1',
    onset_probability: 30.0,
    break_probability: 65.0,
    heavy_spell_probability: 10.0,
    calibrated_confidence: 85.0,
    primary_driver: 'MJO Phase 2 Active',
    secondary_driver: null,
    teleconnection_analog_year: 2024,
    advisory_code: null,
    created_at: '2026-09-28T00:00:00Z',
    updated_at: '2026-09-28T00:00:00Z',
  };

  it('marks evaluation as experimental when prediction driver indicates experimental', () => {
    const result = evaluateAdvisoryRule(experimentalPrediction, {
      rules: VERIFIED_ADVISORY_RULES,
      selectedCrop: 'general',
      targetLanguage: 'en',
      isModelProductionReady: false,
    });

    assert.equal(result.isExperimental, true);
    assert.ok(result.experimentalWarning !== null);
    assert.match(result.experimentalWarning, /experimental research model/i);
    assert.match(result.experimentalWarning, /does not constitute validated operational advisory guidance/i);
  });

  it('does not mark operational prediction with experimental warning', () => {
    const result = evaluateAdvisoryRule(operationalPrediction, {
      rules: VERIFIED_ADVISORY_RULES,
      selectedCrop: 'general',
      targetLanguage: 'en',
      isModelProductionReady: true,
    });

    assert.equal(result.isExperimental, false);
    assert.equal(result.experimentalWarning, null);
  });
});

describe('12. No Fabricated Values & Data Integrity Enforcement', () => {
  it('normalizes crop types safely and rejects arbitrary unverified crop advice', () => {
    assert.equal(normalizeCropType('paddy'), 'paddy');
    assert.equal(normalizeCropType('SoyBean'), 'soybean');
    assert.equal(normalizeCropType('COTTON'), 'cotton');
    assert.equal(normalizeCropType('Maize'), 'maize');
    assert.equal(normalizeCropType('pulses'), 'pulses');
    assert.equal(normalizeCropType('groundnut'), 'groundnut');
    assert.equal(normalizeCropType('general'), 'general');

    assert.equal(normalizeCropType('vanilla_orchid'), 'general');
    assert.equal(normalizeCropType('exotic_dragonfruit'), 'general');
    assert.equal(normalizeCropType(null), 'general');
    assert.equal(normalizeCropType(undefined), 'general');
  });

  it('verified advisory rules contain only legitimate ICAR/CRIDA references without fabricated codes', () => {
    for (const rule of VERIFIED_ADVISORY_RULES) {
      assert.ok(rule.rule_code.startsWith('ICAR-'), `Rule ${rule.rule_code} must follow ICAR naming`);
      assert.ok(
        rule.icar_reference_code.startsWith('ICAR-'),
        `Rule ${rule.rule_code} must reference verified ICAR document`
      );
      assert.ok(rule.is_active === true, `Rule ${rule.rule_code} must be active in registry`);
      assert.ok(rule.english_recommendation.length > 0, `Rule ${rule.rule_code} must have English recommendation`);
    }
  });
});

