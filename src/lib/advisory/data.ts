/**
 * BHUMI Advisory Data Access Layer
 *
 * Provides safe, cached, read-only queries for public.advisory_rules.
 *
 * Guarantees:
 * - Uses anonymous/read-only Supabase client (never exposes service_role key to browser).
 * - Falls back to authoritative VERIFIED_ADVISORY_RULES if Supabase is offline or unseeded.
 * - Single source of truth for advisory evaluation.
 */

import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AdvisoryRuleRow } from '@/lib/supabase/types';
import { VERIFIED_ADVISORY_RULES } from './rules';

/**
 * Fetches active advisory rules from public.advisory_rules.
 */
export async function getAdvisoryRules(): Promise<AdvisoryRuleRow[]> {
  const supabase = getSupabaseServerClient(false);
  if (!supabase) {
    return VERIFIED_ADVISORY_RULES;
  }

  try {
    const { data, error } = await supabase
      .from('advisory_rules')
      .select('*')
      .eq('is_active', true)
      .order('crop_category', { ascending: true })
      .order('rule_code', { ascending: true });

    if (error) {
      console.warn('[BHUMI Advisory] Could not fetch public.advisory_rules from Supabase:', error.message);
      return VERIFIED_ADVISORY_RULES;
    }

    if (Array.isArray(data) && data.length > 0) {
      return data as AdvisoryRuleRow[];
    }

    // Table exists but is empty; return authoritative verified rules
    return VERIFIED_ADVISORY_RULES;
  } catch (err) {
    console.warn('[BHUMI Advisory] Exception querying public.advisory_rules:', err);
    return VERIFIED_ADVISORY_RULES;
  }
}
