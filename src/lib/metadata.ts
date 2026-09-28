/**
 * BHUMI Authoritative Model Metadata & Readiness Types and Parsers
 *
 * Guarantees:
 * - Preserves legitimate zero values (0 seasons, 0 blocks, 0 samples).
 * - Never uses invented fallback numbers (e.g. 1, 2, 96, [2024]).
 * - Returns explicit neutral defaults (0, [], {}, 'UNAVAILABLE') if fields are omitted.
 * - Single source of truth across dashboard components and testing suites.
 */

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
  modelVersion: 'UNAVAILABLE',
  modelName: 'BHUMI-Probabilistic-Downscaling-Engine',
  trainedAt: '',
  modelTier: 'EXPERIMENTAL',
  isProductionReady: false,
  readinessStatus: 'UNAVAILABLE',
  reasons: [
    'Authoritative model metadata is unavailable or unverified.',
    'No validated historical training archive or production readiness report found.',
  ],
  gruStatus: 'UNAVAILABLE',
  trainingCoverage: {
    seasonsCount: 0,
    seasonsList: [],
    blocksCount: 0,
    samplesGenerated: 0,
    classDistribution: {},
  },
};

export const AUTHORITATIVE_MODEL_METADATA: ModelMetadata = {
  modelVersion: 'v1.0.0',
  modelName: 'BHUMI-Probabilistic-Downscaling-Engine',
  trainedAt: '2026-09-28 05:34:45.959006+00:00',
  modelTier: 'EXPERIMENTAL',
  isProductionReady: false,
  readinessStatus: 'INSUFFICIENT_CLASS_DIVERSITY',
  reasons: [
    'Archive contains only 1 season(s) ([2024]); minimum 3 required for multi-year ENSO/IOD cycle validation.',
    'Archive contains only 2 block(s); minimum 20 required across diverse agro-climatic zones.',
    'Dataset contains only 96 samples; minimum 1000 required for reliable downscaling.',
    'Statistically inadequate minority class representation: Onset (count=4, required=30), Break (count=22, required=30), Heavy-Rain (count=4, required=30).',
    'Held-out test set lacks adequate representation for: Onset, Heavy-Rain (minimum 5 samples each in test set for credible recall/precision evaluation).',
  ],
  gruStatus: 'DISABLED_INSUFFICIENT_TRAINING_DATA (samples=48, required=100)',
  trainingCoverage: {
    seasonsCount: 1,
    seasonsList: [2024],
    blocksCount: 2,
    samplesGenerated: 96,
    classDistribution: {
      '0': 66,
      '1': 4,
      '2': 22,
      '3': 4,
    },
  },
};

/**
 * Safely parses authoritative model metadata from a JSON-derived object.
 *
 * Guarantees:
 * - Preserves legitimate zero values (0 seasons, 0 blocks, 0 samples).
 * - Never uses invented fallback numbers (e.g. 1, 2, 96, [2024]).
 * - Returns explicit neutral defaults (0, [], {}, 'UNAVAILABLE') if fields are omitted.
 */
export function parseModelMetadata(parsed: Record<string, unknown> | null | undefined): ModelMetadata {
  if (!parsed || typeof parsed !== 'object') {
    return FALLBACK_MODEL_METADATA;
  }

  const readiness = (parsed.model_readiness && typeof parsed.model_readiness === 'object'
    ? parsed.model_readiness
    : {}) as Record<string, unknown>;

  const coverage = (parsed.training_coverage && typeof parsed.training_coverage === 'object'
    ? parsed.training_coverage
    : {}) as Record<string, unknown>;

  const archiveSummary = (readiness.archive_summary && typeof readiness.archive_summary === 'object'
    ? readiness.archive_summary
    : {}) as Record<string, unknown>;

  // Preserve legitimate zero values; do not substitute synthetic defaults
  const seasonsCount = typeof coverage.seasons_count === 'number'
    ? coverage.seasons_count
    : (typeof archiveSummary.seasons_count === 'number'
        ? archiveSummary.seasons_count
        : (Array.isArray(coverage.seasons_list) ? coverage.seasons_list.length : 0));

  const seasonsList: number[] = Array.isArray(coverage.seasons_list)
    ? (coverage.seasons_list as number[])
    : (Array.isArray(archiveSummary.seasons) ? (archiveSummary.seasons as number[]) : []);

  const blocksCount = typeof coverage.blocks_count === 'number'
    ? coverage.blocks_count
    : (typeof archiveSummary.blocks_count === 'number' ? archiveSummary.blocks_count : 0);

  const samplesGenerated = typeof coverage.samples_generated === 'number'
    ? coverage.samples_generated
    : (typeof archiveSummary.samples_count === 'number' ? archiveSummary.samples_count : 0);

  const classDistribution = (coverage.class_distribution && typeof coverage.class_distribution === 'object'
    ? coverage.class_distribution
    : (archiveSummary.class_distribution && typeof archiveSummary.class_distribution === 'object'
        ? archiveSummary.class_distribution
        : {})) as Record<string, number>;

  const reasons: string[] = Array.isArray(readiness.reasons) && readiness.reasons.length > 0
    ? (readiness.reasons as string[])
    : (typeof readiness.status === 'string' && readiness.status
        ? [readiness.status]
        : FALLBACK_MODEL_METADATA.reasons);

  return {
    modelVersion: typeof parsed.model_version === 'string' && parsed.model_version
      ? parsed.model_version
      : 'UNAVAILABLE',
    modelName: typeof parsed.model_name === 'string' && parsed.model_name
      ? parsed.model_name
      : 'BHUMI Downscaling Engine',
    trainedAt: typeof parsed.trained_at === 'string' ? parsed.trained_at : '',
    modelTier: parsed.model_tier === 'PRODUCTION' ? 'PRODUCTION' : 'EXPERIMENTAL',
    isProductionReady: Boolean(readiness.is_production_ready),
    readinessStatus: typeof readiness.status === 'string' && readiness.status
      ? readiness.status
      : 'UNAVAILABLE',
    reasons,
    gruStatus: typeof coverage.gru_status === 'string' && coverage.gru_status
      ? coverage.gru_status
      : (typeof readiness.gru_status === 'string' && readiness.gru_status
          ? readiness.gru_status
          : 'UNAVAILABLE'),
    trainingCoverage: {
      seasonsCount,
      seasonsList,
      blocksCount,
      samplesGenerated,
      classDistribution,
    },
  };
}
