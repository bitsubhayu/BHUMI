/**
 * BHUMI Multilingual Advisory Template Resolver
 *
 * Resolves static pre-translated templates across 10 regional Indian languages:
 * English (en), Hindi (hi), Marathi (mr), Telugu (te), Tamil (ta),
 * Bengali (bn), Gujarati (gu), Kannada (kn), Punjabi (pa), Odia (or).
 *
 * Guarantees:
 * - Zero runtime translation API calls (no external credentials required).
 * - Falls back to English if a localized string is missing, explicitly flagging `isEnglishFallback`.
 * - Never silently claims a translation exists when falling back.
 */

import type { AdvisoryRuleRow } from '@/lib/supabase/types';
import type { LocalizedTemplateContent, LocalizedTemplatesMap } from './types';
import { supportedLanguages } from '../../config/languages.ts';

export const SUPPORTED_LANGUAGES = supportedLanguages;

export function isLanguageSupported(langCode: string): boolean {
  const norm = (langCode || '').toLowerCase().trim();
  return supportedLanguages.some((l) => l.code === norm);
}

export interface ResolvedTemplate {
  title: string;
  recommendation: string;
  suggestedMeasures: string[];
  content: {
    title: string;
    recommendation: string;
    suggested_measures: string[];
  };
  isEnglishFallback: boolean;
  selectedLanguage: string;
  sourceLanguage: string;
}

export function resolveLocalizedTemplate(
  ruleOrTemplates: AdvisoryRuleRow | LocalizedTemplatesMap | Record<string, unknown>,
  langCode: string = 'en'
): ResolvedTemplate {
  const normLang = (langCode || 'en').toLowerCase().trim();

  let englishTitle = 'Agricultural Contingency Advisory';
  let englishRec = 'Monitor field conditions and consult local KVK agronomists.';
  let englishMeasures: string[] = [];
  let templates: Record<string, string | LocalizedTemplateContent> = {};

  if (typeof ruleOrTemplates === 'object' && ruleOrTemplates !== null) {
    if ('english_recommendation' in ruleOrTemplates && typeof ruleOrTemplates.english_recommendation === 'string') {
      const r = ruleOrTemplates as AdvisoryRuleRow;
      englishTitle = r.english_title || englishTitle;
      englishRec = r.english_recommendation;
      englishMeasures = Array.isArray(r.suggested_measures) ? r.suggested_measures : [];
      templates = (r.localized_templates || {}) as Record<string, string | LocalizedTemplateContent>;
    } else if ('en' in ruleOrTemplates) {
      templates = ruleOrTemplates as Record<string, string | LocalizedTemplateContent>;
      const enEntry = templates['en'];
      if (typeof enEntry === 'string') {
        englishRec = enEntry;
      } else if (typeof enEntry === 'object' && enEntry !== null) {
        englishTitle = enEntry.title || englishTitle;
        englishRec = enEntry.recommendation || englishRec;
        englishMeasures = Array.isArray(enEntry.suggested_measures) ? enEntry.suggested_measures : [];
      }
    } else if ('localized_templates' in ruleOrTemplates) {
      const obj = ruleOrTemplates as Record<string, unknown>;
      templates = (obj.localized_templates || {}) as Record<string, string | LocalizedTemplateContent>;
      if (typeof obj.english_title === 'string') englishTitle = obj.english_title;
      if (typeof obj.english_recommendation === 'string') englishRec = obj.english_recommendation;
      if (Array.isArray(obj.suggested_measures)) englishMeasures = obj.suggested_measures;
    } else {
      templates = ruleOrTemplates as Record<string, string | LocalizedTemplateContent>;
    }
  }

  // If English is requested, return English directly
  if (normLang === 'en') {
    return {
      title: englishTitle,
      recommendation: englishRec,
      suggestedMeasures: englishMeasures,
      content: {
        title: englishTitle,
        recommendation: englishRec,
        suggested_measures: englishMeasures,
      },
      isEnglishFallback: false,
      selectedLanguage: 'en',
      sourceLanguage: 'en',
    };
  }

  const entry = templates[normLang];
  if (!entry) {
    return {
      title: englishTitle,
      recommendation: englishRec,
      suggestedMeasures: englishMeasures,
      content: {
        title: englishTitle,
        recommendation: englishRec,
        suggested_measures: englishMeasures,
      },
      isEnglishFallback: true,
      selectedLanguage: normLang,
      sourceLanguage: 'en',
    };
  }

  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) {
      return {
        title: englishTitle,
        recommendation: englishRec,
        suggestedMeasures: englishMeasures,
        content: {
          title: englishTitle,
          recommendation: englishRec,
          suggested_measures: englishMeasures,
        },
        isEnglishFallback: true,
        selectedLanguage: normLang,
        sourceLanguage: 'en',
      };
    }
    return {
      title: englishTitle,
      recommendation: trimmed,
      suggestedMeasures: englishMeasures,
      content: {
        title: englishTitle,
        recommendation: trimmed,
        suggested_measures: englishMeasures,
      },
      isEnglishFallback: false,
      selectedLanguage: normLang,
      sourceLanguage: normLang,
    };
  }

  if (typeof entry === 'object' && entry !== null) {
    const rec = typeof entry.recommendation === 'string' && entry.recommendation.trim()
      ? entry.recommendation.trim()
      : englishRec;

    const title = typeof entry.title === 'string' && entry.title.trim()
      ? entry.title.trim()
      : englishTitle;

    const measures = Array.isArray(entry.suggested_measures) && entry.suggested_measures.length > 0
      ? entry.suggested_measures
      : englishMeasures;

    const isRecMissing = !entry.recommendation || !entry.recommendation.trim();

    return {
      title,
      recommendation: rec,
      suggestedMeasures: measures,
      content: {
        title,
        recommendation: rec,
        suggested_measures: measures,
      },
      isEnglishFallback: isRecMissing,
      selectedLanguage: normLang,
      sourceLanguage: isRecMissing ? 'en' : normLang,
    };
  }

  return {
    title: englishTitle,
    recommendation: englishRec,
    suggestedMeasures: englishMeasures,
    content: {
      title: englishTitle,
      recommendation: englishRec,
      suggested_measures: englishMeasures,
    },
    isEnglishFallback: true,
    selectedLanguage: normLang,
    sourceLanguage: 'en',
  };
}
