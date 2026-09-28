/**
 * BHUMI Rule-Based Crop Advisory Engine
 *
 * Maps calibrated probabilistic predictions to verified ICAR/KVK agronomic actions
 * and static multilingual templates.
 *
 * Guarantees:
 * - Deterministic rule matching (no runtime ML inference or translation calls).
 * - Priority: Crop-specific verified rule -> General Kharif verified rule -> No-match state.
 * - Inactive rules are strictly ignored.
 * - When no verified rule matches, returns explicit "No verified advisory rule is available for this forecast."
 * - Preserves prediction provenance and experimental tier.
 */

import type { AgronomicActionType, CropType } from '@/types/advisory';
import type { AdvisoryRuleRow, LivePredictionRow } from '@/lib/supabase/types';
import type { AdvisoryEvaluationResult, EvaluateAdvisoryOptions } from './types';
import { resolveLocalizedTemplate } from './templates.ts';

/**
 * Normalizes crop category into supported CropType values.
 */
export function normalizeCropType(rawCrop?: string | null): CropType {
  const norm = (rawCrop || 'general').toLowerCase().trim();
  switch (norm) {
    case 'paddy':
    case 'rice':
      return 'paddy';
    case 'soybean':
    case 'soya':
      return 'soybean';
    case 'cotton':
      return 'cotton';
    case 'maize':
    case 'corn':
      return 'maize';
    case 'pulses':
    case 'pulse':
    case 'arhar':
    case 'moong':
    case 'urad':
      return 'pulses';
    case 'groundnut':
    case 'peanut':
      return 'groundnut';
    case 'general':
    case 'kharif_general':
    default:
      return 'general';
  }
}

/**
 * Evaluates candidate agronomic action type based on probabilistic thresholds
 * established in ICAR / KVK Kharif guidance and pipeline driver attribution.
 */
export function determineCandidateAction(
  prediction: LivePredictionRow
): AgronomicActionType {
  // If prediction already has an explicit advisory code matching standard actions
  if (prediction.advisory_code) {
    const raw = prediction.advisory_code.replace(/^exp_/, '').trim().toLowerCase();
    if (
      raw === 'delay_sowing' ||
      raw === 'drainage_alert' ||
      raw === 'safe_to_sow' ||
      raw === 'prepare_irrigation' ||
      raw === 'monitor_conditions'
    ) {
      return raw as AgronomicActionType;
    }
  }

  const breakProb = typeof prediction.break_probability === 'number' ? prediction.break_probability : 0;
  const onsetProb = typeof prediction.onset_probability === 'number' ? prediction.onset_probability : 0;
  const heavyProb = typeof prediction.heavy_spell_probability === 'number' ? prediction.heavy_spell_probability : 0;
  const leadBucket = prediction.lead_time_bucket || 'week_1';

  // 1. Dry break hazard during early vegetative window (Week 1–2)
  if (breakProb >= 50.0 && (leadBucket === 'week_1' || leadBucket === 'week_2')) {
    return 'delay_sowing';
  }

  // 2. Heavy downpour & waterlogging hazard
  if (heavyProb >= 40.0) {
    return 'drainage_alert';
  }

  // 3. Favorable onset & optimal seedbed moisture
  if (onsetProb >= 50.0 && breakProb <= 30.0) {
    return 'safe_to_sow';
  }

  // 4. Moderate/elevated break risk requiring protective irrigation reserves
  if (breakProb >= 40.0) {
    return 'prepare_irrigation';
  }

  // 5. Normal climatological baseline
  return 'monitor_conditions';
}

/**
 * Evaluates verified advisory rules against the current block prediction.
 * Supports both options object and (prediction, options) calling conventions.
 */
export function evaluateAdvisoryRule(
  optionsOrPred: EvaluateAdvisoryOptions | LivePredictionRow | null | undefined,
  maybeOptions?: Partial<EvaluateAdvisoryOptions>
): AdvisoryEvaluationResult {
  let opts: EvaluateAdvisoryOptions;

  if (
    optionsOrPred &&
    typeof optionsOrPred === 'object' &&
    ('rules' in optionsOrPred || 'cropCategory' in optionsOrPred || 'langCode' in optionsOrPred)
  ) {
    opts = optionsOrPred as EvaluateAdvisoryOptions;
  } else {
    opts = {
      prediction: optionsOrPred as LivePredictionRow | null | undefined,
      rules: maybeOptions?.rules || [],
      cropCategory: maybeOptions?.cropCategory || maybeOptions?.selectedCrop || 'general',
      isModelProductionReady: maybeOptions?.isModelProductionReady ?? false,
      langCode: maybeOptions?.langCode || maybeOptions?.targetLanguage || 'en',
    };
  }

  const prediction = opts.prediction;
  const rules = opts.rules || [];
  const rawCrop = opts.cropCategory || opts.selectedCrop || 'general';
  const targetCrop = normalizeCropType(rawCrop);
  const isModelProductionReady = opts.isModelProductionReady ?? false;
  const langCode = opts.langCode || opts.targetLanguage || 'en';

  // 1. Handle missing forecast data
  if (!prediction) {
    const unverifiedMsg = 'No verified advisory rule is available for this forecast.';
    return {
      hasMatch: false,
      hasMatchingRule: false,
      ruleCode: 'NO_VERIFIED_RULE',
      actionType: null,
      action: null,
      cropCategory: targetCrop,
      cropType: targetCrop,
      icarReferenceCode: null,
      title: unverifiedMsg,
      recommendation: unverifiedMsg,
      suggestedMeasures: [],
      template: {
        title: unverifiedMsg,
        recommendation: unverifiedMsg,
        suggested_measures: [],
      },
      selectedLanguage: langCode,
      language: langCode,
      isEnglishFallback: false,
      isExperimental: false,
      isCropSpecific: false,
      isGeneralFallback: false,
      experimentalWarning: null,
      provenance: {
        ruleSource: 'verified_registry',
        isModelProductionReady: false,
      },
    };
  }

  // 2. Determine experimental status of prediction
  const isExperimental =
    !isModelProductionReady ||
    Boolean(prediction.primary_driver?.includes('[EXPERIMENTAL]')) ||
    Boolean(prediction.advisory_code?.startsWith('exp_'));

  const expWarning = isExperimental
    ? 'Forecast generated by an experimental research model. This advisory does not constitute validated operational advisory guidance.'
    : null;

  // 3. Determine candidate action
  const candidateAction = determineCandidateAction(prediction);

  // 4. Filter active rules only (ignore inactive rules)
  const activeRules = rules.filter((r) => r.is_active);

  // 5. Match candidate action:
  // First priority: crop-specific rule
  let matchedRule: AdvisoryRuleRow | undefined;
  let isCropSpecific = false;

  if (targetCrop !== 'general') {
    const cropMatches = activeRules.filter(
      (r) => r.action_type === candidateAction && r.crop_category.toLowerCase() === targetCrop
    );
    if (cropMatches.length > 0) {
      cropMatches.sort((a, b) => a.rule_code.localeCompare(b.rule_code));
      matchedRule = cropMatches[0];
      isCropSpecific = true;
    }
  }

  // Second priority: general fallback rule
  if (!matchedRule) {
    const generalMatches = activeRules.filter(
      (r) =>
        r.action_type === candidateAction &&
        (r.crop_category.toLowerCase() === 'general' || r.crop_category.toLowerCase() === 'kharif_general')
    );
    if (generalMatches.length > 0) {
      generalMatches.sort((a, b) => a.rule_code.localeCompare(b.rule_code));
      matchedRule = generalMatches[0];
      isCropSpecific = false;
    }
  }

  // 6. Handle no verified rule match
  if (!matchedRule) {
    const unverifiedMsg = 'No verified advisory rule is available for this forecast.';
    return {
      hasMatch: false,
      hasMatchingRule: false,
      ruleCode: 'NO_VERIFIED_RULE',
      actionType: candidateAction,
      action: candidateAction,
      cropCategory: targetCrop,
      cropType: targetCrop,
      icarReferenceCode: null,
      title: unverifiedMsg,
      recommendation: unverifiedMsg,
      suggestedMeasures: [],
      template: {
        title: unverifiedMsg,
        recommendation: unverifiedMsg,
        suggested_measures: [],
      },
      selectedLanguage: langCode,
      language: langCode,
      isEnglishFallback: false,
      isExperimental,
      isCropSpecific: false,
      isGeneralFallback: false,
      experimentalWarning: expWarning,
      provenance: {
        ruleSource: 'public.advisory_rules',
        predictionId: prediction.id,
        leadTimeBucket: prediction.lead_time_bucket,
        predictionDate: prediction.prediction_date,
        isModelProductionReady,
      },
    };
  }

  // 7. Resolve multilingual template
  const localized = resolveLocalizedTemplate(matchedRule, langCode);
  const isGeneralFallback = !isCropSpecific && targetCrop !== 'general';

  return {
    hasMatch: true,
    hasMatchingRule: true,
    ruleCode: matchedRule.rule_code,
    actionType: matchedRule.action_type,
    action: matchedRule.action_type,
    cropCategory: targetCrop,
    cropType: matchedRule.crop_category.toLowerCase() as CropType,
    icarReferenceCode: matchedRule.icar_reference_code,
    title: localized.title,
    recommendation: localized.recommendation,
    suggestedMeasures: localized.suggestedMeasures,
    template: {
      title: localized.title,
      recommendation: localized.recommendation,
      suggested_measures: localized.suggestedMeasures,
    },
    selectedLanguage: localized.selectedLanguage,
    language: localized.selectedLanguage,
    isEnglishFallback: localized.isEnglishFallback,
    isExperimental,
    isCropSpecific,
    isGeneralFallback,
    experimentalWarning: expWarning,
    provenance: {
      ruleSource: 'public.advisory_rules',
      predictionId: prediction.id,
      leadTimeBucket: prediction.lead_time_bucket,
      predictionDate: prediction.prediction_date,
      isModelProductionReady,
    },
  };
}
