-- Migration: 20260927000007_advisory_rules.sql
-- Description: Rule-based agronomic advisory engine thresholds and multilingual template cache (PRD §2 & TECH_STACK §5).

CREATE TABLE IF NOT EXISTS public.advisory_rules (
    rule_code VARCHAR(50) PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('safe_to_sow', 'delay_sowing', 'prepare_irrigation', 'drainage_alert', 'monitor_conditions')),
    crop_category VARCHAR(50) NOT NULL DEFAULT 'kharif_general',
    trigger_condition TEXT NOT NULL, -- e.g. "onset_probability >= 70 AND break_probability <= 25"
    english_title TEXT NOT NULL,
    english_recommendation TEXT NOT NULL,
    suggested_measures TEXT[] NOT NULL DEFAULT '{}',
    icar_reference_code VARCHAR(50),
    localized_templates JSONB NOT NULL DEFAULT '{}'::jsonb, -- Pre-translated templates via Bhashini across regional languages
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_advisory_rules_action ON public.advisory_rules (action_type, is_active);
CREATE INDEX IF NOT EXISTS idx_advisory_rules_crop ON public.advisory_rules (crop_category);
