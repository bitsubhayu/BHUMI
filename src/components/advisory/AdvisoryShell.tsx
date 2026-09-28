'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sprout,
  AlertTriangle,
  Languages,
  ShieldAlert,
  CloudRain,
  Activity,
  CheckCircle2,
  Calendar,
  Layers,
  BookOpen,
  Info,
} from 'lucide-react';
import type { BlockRow, LivePredictionRow, AdvisoryRuleRow } from '@/lib/supabase/types';
import type { CropType } from '@/types/advisory';
import { supportedLanguages } from '@/config/languages';
import { evaluateAdvisoryRule, VERIFIED_ADVISORY_RULES } from '@/lib/advisory';

interface AdvisoryShellProps {
  prediction?: LivePredictionRow | null;
  block?: BlockRow | null;
  isModelProductionReady?: boolean;
  advisoryRules?: AdvisoryRuleRow[];
  selectedWeek?: 'week_1' | 'week_2' | 'week_3' | 'week_4';
}

const CROPS: { id: CropType; label: string }[] = [
  { id: 'general', label: 'All Crops (General)' },
  { id: 'paddy', label: 'Paddy / Rice' },
  { id: 'soybean', label: 'Soybean' },
  { id: 'cotton', label: 'Cotton' },
  { id: 'maize', label: 'Maize' },
  { id: 'pulses', label: 'Pulses' },
  { id: 'groundnut', label: 'Groundnut' },
];

export function AdvisoryShell({
  prediction = null,
  block = null,
  isModelProductionReady = false,
  advisoryRules = VERIFIED_ADVISORY_RULES,
  selectedWeek = 'week_1',
}: AdvisoryShellProps) {
  const [selectedCrop, setSelectedCrop] = useState<CropType>('general');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedLang = localStorage.getItem('bhumi_advisory_lang');
        if (savedLang && supportedLanguages.some((l) => l.code === savedLang)) {
          return savedLang;
        }
      } catch {
        // Ignore localStorage errors (e.g. private mode)
      }
    }
    return 'en';
  });

  const handleLanguageChange = (code: string) => {
    setSelectedLanguage(code);
    try {
      localStorage.setItem('bhumi_advisory_lang', code);
    } catch {
      // Ignore
    }
  };

  // Evaluate rule deterministically
  const advisory = useMemo(() => {
    return evaluateAdvisoryRule({
      prediction,
      cropCategory: selectedCrop,
      rules: advisoryRules && advisoryRules.length > 0 ? advisoryRules : VERIFIED_ADVISORY_RULES,
      isModelProductionReady,
      langCode: selectedLanguage,
    });
  }, [prediction, selectedCrop, advisoryRules, isModelProductionReady, selectedLanguage]);

  const currentLangMeta = supportedLanguages.find((l) => l.code === selectedLanguage) || supportedLanguages[0];

  const actionMeta: Record<
    string,
    { label: string; icon: React.ComponentType<{ className?: string }>; colorClass: string; badgeVariant: 'default' | 'destructive' | 'secondary' | 'outline' }
  > = {
    safe_to_sow: {
      label: 'Safe Sowing Window',
      icon: CheckCircle2,
      colorClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
      badgeVariant: 'default',
    },
    delay_sowing: {
      label: 'Delay Sowing Advisory',
      icon: AlertTriangle,
      colorClass: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
      badgeVariant: 'destructive',
    },
    prepare_irrigation: {
      label: 'Prepare Irrigation',
      icon: ShieldAlert,
      colorClass: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
      badgeVariant: 'secondary',
    },
    drainage_alert: {
      label: 'Field Drainage Alert',
      icon: CloudRain,
      colorClass: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/30',
      badgeVariant: 'default',
    },
    monitor_conditions: {
      label: 'Normal Monitoring',
      icon: Activity,
      colorClass: 'text-muted-foreground bg-muted/40 border-border/60',
      badgeVariant: 'outline',
    },
  };

  const actionStyle = advisory.actionType ? actionMeta[advisory.actionType] || actionMeta.monitor_conditions : actionMeta.monitor_conditions;
  const ActionIcon = actionStyle.icon;

  const weekLabels: Record<string, string> = {
    week_1: 'Week 1 (Days 1–7)',
    week_2: 'Week 2 (Days 8–14)',
    week_3: 'Week 3 (Days 15–21)',
    week_4: 'Week 4 (Days 22–28)',
  };

  return (
    <Card id="crop-advisory" className="border-border/80 shadow-sm bg-card/60 backdrop-blur-xs overflow-hidden">
      <CardHeader className="p-4 sm:p-5 border-b border-border/50 bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
                <Sprout className="h-4 w-4 text-emerald-500" />
                ICAR / KVK Rule-Based Agronomic Advisory Engine
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-mono">
                PRD §2 & TECH_STACK §7
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Directly translates calibrated hydro-meteorological risks into plain-language, crop-specific farmer actions using verified ICAR/KVK thresholds.
            </p>
          </div>

          {/* Regional Language Selector */}
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <Languages className="h-4 w-4 text-primary shrink-0" />
            <div className="flex items-center gap-1.5">
              <label htmlFor="advisory-language-selector" className="text-xs font-semibold text-muted-foreground whitespace-nowrap sr-only">
                Advisory Language
              </label>
              <select
                id="advisory-language-selector"
                value={selectedLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="text-xs font-medium bg-background border border-border/70 rounded-md px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-primary shadow-2xs"
              >
                {supportedLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Crop Selector Tabs */}
        <div className="pt-3 flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
          <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap mr-1">
            Target Crop:
          </span>
          {CROPS.map((crop) => (
            <button
              key={crop.id}
              type="button"
              onClick={() => setSelectedCrop(crop.id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all whitespace-nowrap font-medium ${
                selectedCrop === crop.id
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs font-semibold'
                  : 'bg-muted/40 hover:bg-muted text-foreground border-border/60'
              }`}
            >
              {crop.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Experimental Model Banner */}
        {advisory.isExperimental && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold">Experimental Advisory Notice:</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The underlying forecast is generated under experimental validation mode (limited historical training archive). Recommendations are illustrative Kharif rule triggers and must not be presented as certified operational guidance.
              </p>
            </div>
          </div>
        )}

        {/* English Fallback Indicator */}
        {advisory.isEnglishFallback && selectedLanguage !== 'en' && (
          <div className="p-2.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span>
                <strong>English Fallback:</strong> Localized template for <em>{currentLangMeta.name}</em> is not yet available for this rule. Showing verified English advisory.
              </span>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase font-mono">
              English Fallback
            </Badge>
          </div>
        )}

        {/* Active Advisory Card */}
        {advisory.hasMatch ? (
          <div className="p-4 rounded-xl border border-border/70 bg-muted/20 space-y-3.5">
            {/* Action and Category Meta Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold ${actionStyle.colorClass}`}>
                  <ActionIcon className="h-3.5 w-3.5 shrink-0" />
                  {actionStyle.label}
                </span>

                {advisory.isCropSpecific && (
                  <Badge variant="secondary" className="text-[11px] capitalize font-medium">
                    Crop-Specific: {advisory.cropCategory}
                  </Badge>
                )}
                {!advisory.isCropSpecific && (
                  <Badge variant="outline" className="text-[11px] font-medium text-muted-foreground">
                    General Kharif Rule
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {weekLabels[selectedWeek] || selectedWeek}
                </span>
                {block && (
                  <span>
                    • {block.block_name} ({block.district_name})
                  </span>
                )}
              </div>
            </div>

            {/* Localized Advisory Title & Recommendation */}
            <div className="space-y-1.5">
              <h3 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                {advisory.title}
              </h3>
              <p className="text-sm text-foreground/90 leading-relaxed font-sans">
                {advisory.recommendation}
              </p>
            </div>

            {/* Suggested Agronomic Measures */}
            {advisory.suggestedMeasures.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-border/40">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5 text-primary" />
                  Recommended Agronomic Field Actions:
                </h4>
                <ul className="space-y-1.5 text-xs text-foreground/90 list-disc list-inside">
                  {advisory.suggestedMeasures.map((measure, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {measure}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Authoritative Provenance & Rule Codes */}
            <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground font-mono">
              <div className="flex items-center gap-3 flex-wrap">
                {advisory.ruleCode && (
                  <span>
                    Rule Code: <strong className="text-foreground">{advisory.ruleCode}</strong>
                  </span>
                )}
                {advisory.icarReferenceCode && (
                  <span>
                    ICAR Ref: <strong className="text-foreground">{advisory.icarReferenceCode}</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[10.5px]">
                <Layers className="h-3 w-3 text-primary" />
                <span>Deterministic ICAR/KVK Thresholds</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center rounded-lg border border-dashed border-border/80 bg-muted/10 space-y-2">
            <Info className="h-5 w-5 text-muted-foreground mx-auto" />
            <p className="text-sm font-semibold text-foreground">
              {advisory.recommendation}
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              No unverified recommendation is fabricated. Select a block with active forecast predictions to view calibrated advisories.
            </p>
          </div>
        )}

        {/* Translation Architecture Note */}
        <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <Languages className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>
              <strong>Zero-Latency Multilingual Layer:</strong> All 10 regional language templates are pre-translated and loaded with zero runtime translation latency and no external API keys.
            </span>
          </div>
          <span className="font-mono text-[10px] text-primary whitespace-nowrap">
            Selected: {currentLangMeta.name} ({currentLangMeta.nativeName})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
