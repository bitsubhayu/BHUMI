/**
 * BHUMI Rule-Based Crop Advisory Engine
 *
 * Sourced directly from public.advisory_rules.trigger_condition.
 * Evaluates verified ICAR/KVK Kharif contingency rules deterministically against
 * calibrated probabilistic forecasts without hardcoded threshold duplication.
 *
 * Guarantees:
 * - Authoritative trigger_condition evaluation (DSL supporting numeric comparisons, lead_time_bucket IN, AND clauses).
 * - Zero eval(), Function(), or dynamic code execution.
 * - Strict rule priority:
 *     1. Active + trigger_condition matches + crop-specific rule
 *     2. Active + trigger_condition matches + general/kharif_general rule
 *     3. Deterministic tie-break using rule_code
 * - Inactive rules (is_active: false) are strictly ignored.
 * - When no verified rule matches, returns exactly:
 *     "No verified advisory rule is available for this forecast."
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

export interface ParsedComparisonClause {
  type: 'comparison';
  field: string;
  operator: '>=' | '<=' | '>' | '<' | '=' | '==' | '!=';
  targetValue: number;
}

export interface ParsedInClause {
  type: 'in';
  field: string;
  allowedValues: string[];
}

export type ParsedConditionClause = ParsedComparisonClause | ParsedInClause;

/**
 * Safely parses a single condition clause without eval or regex vulnerabilities.
 */
export function parseConditionClause(rawClause: string): ParsedConditionClause | null {
  const clause = rawClause.trim();
  if (!clause) return null;

  // 1. IN clause: `field IN (val1, val2, ...)`
  const inMatch = clause.match(/^([a-zA-Z0-9_]+)\s+IN\s*\(([^)]+)\)$/i);
  if (inMatch) {
    const field = inMatch[1].toLowerCase().trim();
    const rawValues = inMatch[2];
    const allowedValues = rawValues
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
      .filter((s) => s.length > 0);

    return {
      type: 'in',
      field,
      allowedValues,
    };
  }

  // 2. Comparison clause: `field op number`
  const compMatch = clause.match(
    /^([a-zA-Z0-9_]+)\s*(>=|<=|>|<|==|=|!=)\s*([+-]?[0-9]+(?:\.[0-9]+)?)$/
  );
  if (compMatch) {
    const field = compMatch[1].toLowerCase().trim();
    const operator = compMatch[2] as ParsedComparisonClause['operator'];
    const targetValue = parseFloat(compMatch[3]);

    if (!Number.isFinite(targetValue)) return null;

    return {
      type: 'comparison',
      field,
      operator,
      targetValue,
    };
  }

  return null;
}

/**
 * Evaluates a single parsed clause against prediction data.
 */
export function evaluateClause(
  clause: ParsedConditionClause,
  prediction: LivePredictionRow
): boolean {
  if (clause.type === 'in') {
    if (clause.field === 'lead_time_bucket') {
      const actualVal = (prediction.lead_time_bucket || '').toLowerCase().trim();
      return clause.allowedValues.includes(actualVal);
    }
    return false;
  }

  if (clause.type === 'comparison') {
    let actualVal: number | null = null;
    switch (clause.field) {
      case 'break_probability':
        actualVal = prediction.break_probability;
        break;
      case 'onset_probability':
        actualVal = prediction.onset_probability;
        break;
      case 'heavy_spell_probability':
        actualVal = prediction.heavy_spell_probability;
        break;
      case 'calibrated_confidence':
        actualVal = prediction.calibrated_confidence;
        break;
      case 'teleconnection_analog_year':
        actualVal = prediction.teleconnection_analog_year;
        break;
      default:
        return false;
    }

    if (actualVal === null || actualVal === undefined || !Number.isFinite(actualVal)) {
      return false;
    }

    switch (clause.operator) {
      case '>=':
        return actualVal >= clause.targetValue;
      case '<=':
        return actualVal <= clause.targetValue;
      case '>':
        return actualVal > clause.targetValue;
      case '<':
        return actualVal < clause.targetValue;
      case '=':
      case '==':
        return Math.abs(actualVal - clause.targetValue) < 1e-6;
      case '!=':
        return Math.abs(actualVal - clause.targetValue) >= 1e-6;
      default:
        return false;
    }
  }

  return false;
}

/**
 * Evaluates full trigger_condition string safely against a prediction row.
 * Supports AND combinations of comparison and IN clauses.
 *
 * Security: ZERO eval(), Function(), or dynamic execution.
 */
export function evaluateTriggerCondition(
  prediction: LivePredictionRow | null | undefined,
  triggerCondition?: string | null
): boolean {
  if (!prediction || !triggerCondition) return false;
  const trimmed = triggerCondition.trim();
  if (!trimmed || trimmed.toLowerCase() === 'default') return false;

  const rawClauses = trimmed.split(/\s+AND\s+/i);
  if (rawClauses.length === 0) return false;

  for (const raw of rawClauses) {
    const parsed = parseConditionClause(raw);
    if (!parsed) {
      // Unrecognized clause syntax fails safely to false
      return false;
    }
    if (!evaluateClause(parsed, prediction)) {
      return false;
    }
  }

  return true;
}

/**
 * Resolves candidate agronomic action without hardcoded threshold values.
 *
 * Sourced directly from matched rule's action_type or explicit prediction advisory_code.
 * Contains ZERO hardcoded probability numbers.
 */
export function determineCandidateAction(
  prediction: LivePredictionRow,
  matchedRule?: AdvisoryRuleRow | null
): AgronomicActionType | null {
  if (matchedRule && matchedRule.action_type) {
    return matchedRule.action_type;
  }

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

  return null;
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

  const unverifiedMsg = 'No verified advisory rule is available for this forecast.';

  // 1. Handle missing forecast data
  if (!prediction) {
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

  // 3. Filter active rules only (ignore inactive rules)
  const activeRules = rules.filter((r) => Boolean(r.is_active));

  // 4. Evaluate trigger_condition for each active rule
  interface CandidateMatch {
    rule: AdvisoryRuleRow;
    isCropSpecific: boolean;
  }

  const matchingCandidates: CandidateMatch[] = [];

  for (const rule of activeRules) {
    const isConditionMet = evaluateTriggerCondition(prediction, rule.trigger_condition);
    if (!isConditionMet) {
      continue;
    }

    const ruleCrop = (rule.crop_category || 'general').toLowerCase().trim();
    const isTargetCropMatch = targetCrop !== 'general' && ruleCrop === targetCrop;
    const isGeneralMatch = ruleCrop === 'general' || ruleCrop === 'kharif_general';

    if (isTargetCropMatch) {
      matchingCandidates.push({ rule, isCropSpecific: true });
    } else if (isGeneralMatch) {
      matchingCandidates.push({ rule, isCropSpecific: false });
    }
  }

  // Priority sorting:
  // 1. Crop-specific matching rules before general rules
  // 2. Deterministic tie-break using rule_code
  matchingCandidates.sort((a, b) => {
    if (a.isCropSpecific !== b.isCropSpecific) {
      return a.isCropSpecific ? -1 : 1;
    }
    return a.rule.rule_code.localeCompare(b.rule.rule_code);
  });

  const matchedRule: AdvisoryRuleRow | undefined = matchingCandidates[0]?.rule;
  const isCropSpecific = matchingCandidates[0]?.isCropSpecific ?? false;

  // 5. Handle no verified rule match
  if (!matchedRule) {
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

  // 6. Match confirmed: resolve localized template
  const candidateAction = determineCandidateAction(prediction, matchedRule);
  const localized = resolveLocalizedTemplate(matchedRule, langCode);
  const isGeneralFallback = !isCropSpecific && targetCrop !== 'general';

  return {
    hasMatch: true,
    hasMatchingRule: true,
    ruleCode: matchedRule.rule_code,
    actionType: candidateAction,
    action: candidateAction,
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
