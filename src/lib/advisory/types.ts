/**
 * BHUMI Advisory Domain Types
 * Aligned with ICAR / KVK threshold-driven agronomic actions & multilingual delivery.
 */

import type { AgronomicActionType, CropType } from '@/types/advisory';
import type { AdvisoryRuleRow, LivePredictionRow } from '@/lib/supabase/types';

export type { AgronomicActionType, CropType };

export interface LocalizedTemplateContent {
  title?: string;
  recommendation: string;
  suggested_measures?: string[];
}

export type LocalizedTemplatesMap = Record<string, string | LocalizedTemplateContent>;

export interface AdvisoryEvaluationResult {
  hasMatch: boolean;
  hasMatchingRule: boolean;
  ruleCode: string | null;
  actionType: AgronomicActionType | null;
  action: AgronomicActionType | null;
  cropCategory: CropType;
  cropType: CropType;
  icarReferenceCode: string | null;
  title: string;
  recommendation: string;
  suggestedMeasures: string[];
  template: {
    title: string;
    recommendation: string;
    suggested_measures: string[];
  };
  selectedLanguage: string;
  language: string;
  isEnglishFallback: boolean;
  isExperimental: boolean;
  isCropSpecific: boolean;
  isGeneralFallback: boolean;
  experimentalWarning: string | null;
  provenance: {
    ruleSource: 'public.advisory_rules' | 'verified_registry';
    predictionId?: number;
    leadTimeBucket?: string;
    predictionDate?: string;
    isModelProductionReady: boolean;
  };
}

export interface EvaluateAdvisoryOptions {
  prediction?: LivePredictionRow | null | undefined;
  cropCategory?: CropType;
  selectedCrop?: CropType;
  rules?: AdvisoryRuleRow[];
  isModelProductionReady?: boolean;
  langCode?: string;
  targetLanguage?: string;
}
