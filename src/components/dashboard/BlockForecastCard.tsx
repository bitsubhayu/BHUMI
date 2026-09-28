'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Compass,
  AlertTriangle,
  ShieldCheck,
  CloudRain,
  Sun,
  Activity,
  Layers,
  Sparkles,
  MapPin,
} from 'lucide-react';
import type { BlockRow, LivePredictionRow } from '@/lib/supabase/types';
import {
  getRiskLevel,
  getRiskMeta,
  formatProbability,
  evaluatePredictionTier,
} from '@/lib/risk';


interface BlockForecastCardProps {
  block: BlockRow | null;
  predictions: LivePredictionRow[];
  isModelProductionReady?: boolean;
  selectedWeek?: 'week_1' | 'week_2' | 'week_3' | 'week_4';
  onSelectWeek?: (week: 'week_1' | 'week_2' | 'week_3' | 'week_4') => void;
}

export function BlockForecastCard({
  block,
  predictions,
  isModelProductionReady = false,
  selectedWeek = 'week_1',
  onSelectWeek,
}: BlockForecastCardProps) {
  const [activeWeek, setActiveWeek] = useState<'week_1' | 'week_2' | 'week_3' | 'week_4'>(selectedWeek);

  const handleWeekChange = (wk: 'week_1' | 'week_2' | 'week_3' | 'week_4') => {
    setActiveWeek(wk);
    if (onSelectWeek) {
      onSelectWeek(wk);
    }
  };

  if (!block) {
    return (
      <Card className="border-border/70 shadow-sm bg-card/60 backdrop-blur-xs">
        <CardContent className="p-8 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Compass className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">Select an Administrative Block</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Tap a block polygon on the India risk map or select from the block registry to view calibrated weekly
            forecasts and explainability drivers.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Find prediction for currently selected week
  const currentPred = predictions.find((p) => p.lead_time_bucket === activeWeek) || null;
  const tierStatus = evaluatePredictionTier(currentPred, isModelProductionReady);

  const weekLabels: Record<string, { title: string; range: string }> = {
    week_1: { title: 'Week 1', range: 'Days 1 – 7' },
    week_2: { title: 'Week 2', range: 'Days 8 – 14' },
    week_3: { title: 'Week 3', range: 'Days 15 – 21' },
    week_4: { title: 'Week 4', range: 'Days 22 – 28' },
  };

  const breakRiskMeta = getRiskMeta(getRiskLevel(currentPred?.break_probability));
  const onsetRiskMeta = getRiskMeta(getRiskLevel(currentPred?.onset_probability));
  const heavyRiskMeta = getRiskMeta(getRiskLevel(currentPred?.heavy_spell_probability));

  return (
    <Card className="border-border/70 shadow-sm bg-card/60 backdrop-blur-xs overflow-hidden">
      {/* Block Header */}
      <CardHeader className="p-4 sm:p-5 border-b border-border/50 bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                {block.block_id}
              </span>
              <Badge
                variant={tierStatus.tier === 'PRODUCTION' ? 'default' : 'secondary'}
                className="text-[11px] font-mono uppercase tracking-wider"
              >
                {tierStatus.tier === 'PRODUCTION' ? (
                  <ShieldCheck className="h-3 w-3 mr-1 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-3 w-3 mr-1 text-amber-500" />
                )}
                {tierStatus.badgeLabel}
              </Badge>
              {block.agro_climatic_zone && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Zone: {block.agro_climatic_zone}
                </Badge>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary shrink-0" />
              {block.block_name}
            </h2>
            <p className="text-xs text-muted-foreground">
              District: <span className="font-semibold text-foreground">{block.district_name}</span> | State:{' '}
              <span className="font-semibold text-foreground">{block.state_name}</span>
            </p>
          </div>

          <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center text-xs text-muted-foreground font-mono bg-background/50 p-2 sm:p-2.5 rounded-md border border-border/40">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>Forecast: {currentPred?.prediction_date || 'Current Cycle'}</span>
            </div>
            <div className="text-[11px] mt-0.5">
              Elev: {block.elevation_m ? `${block.elevation_m}m` : 'N/A'} | Coast:{' '}
              {block.distance_to_coast_km ? `${block.distance_to_coast_km}km` : 'N/A'}
            </div>
          </div>
        </div>

        {/* Tier / Experimental Disclaimer Notice */}
        {tierStatus.tier === 'EXPERIMENTAL' && (
          <div className="mt-3 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold">Notice: {tierStatus.notice}</span>
              <p className="text-[11px] text-muted-foreground">
                Probabilities reflect preliminary analog ensemble matching. Stage 1 deep GRU is disabled pending multi-decadal historical archive ingestion.
              </p>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-5">
        {/* Week Selector Tabs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Lead-Time Horizon
            </label>
            <span className="text-[11px] font-mono text-muted-foreground">Sub-Seasonal Outlook</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['week_1', 'week_2', 'week_3', 'week_4'] as const).map((wk) => {
              const isActive = activeWeek === wk;
              const hasData = predictions.some((p) => p.lead_time_bucket === wk);
              return (
                <button
                  key={wk}
                  type="button"
                  onClick={() => handleWeekChange(wk)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-muted/40 hover:bg-muted text-foreground border-border/60'
                  }`}
                >
                  <div className="text-xs font-bold leading-none">{weekLabels[wk].title}</div>
                  <div
                    className={`text-[10px] mt-1 font-mono ${
                      isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    }`}
                  >
                    {weekLabels[wk].range}
                  </div>
                  {!hasData && (
                    <div className="text-[9px] text-amber-500 font-semibold mt-0.5">Pending</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Current Prediction Display */}
        {currentPred ? (
          <div className="space-y-4">
            {/* Probability Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Break Risk */}
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                    <span>Monsoon Break Risk</span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${breakRiskMeta.badgeClass}`}
                  >
                    {breakRiskMeta.label}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold font-mono text-foreground">
                    {formatProbability(currentPred.break_probability)}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground font-mono">Probabilistic</span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, currentPred.break_probability))}%`,
                      backgroundColor: breakRiskMeta.hexColor,
                    }}
                  />
                </div>
                <p className="text-[10.5px] text-muted-foreground leading-tight">
                  Likelihood of prolonged dry interval (&lt;2.5mm/day for &gt;5 consecutive days).
                </p>
              </div>

              {/* Onset Probability */}
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Activity className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Onset Progression</span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${onsetRiskMeta.badgeClass}`}
                  >
                    {onsetRiskMeta.label}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold font-mono text-foreground">
                    {formatProbability(currentPred.onset_probability)}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground font-mono">Transition</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, currentPred.onset_probability))}%`,
                      backgroundColor: onsetRiskMeta.hexColor,
                    }}
                  />
                </div>
                <p className="text-[10.5px] text-muted-foreground leading-tight">
                  Probability of seasonal monsoon surge and sustained soil moisture saturation.
                </p>
              </div>

              {/* Heavy Rain Risk */}
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <CloudRain className="h-3.5 w-3.5 text-sky-500" />
                    <span>Heavy Rain Spell</span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${heavyRiskMeta.badgeClass}`}
                  >
                    {heavyRiskMeta.label}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold font-mono text-foreground">
                    {formatProbability(currentPred.heavy_spell_probability)}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground font-mono">Excess Spell</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, currentPred.heavy_spell_probability))}%`,
                      backgroundColor: heavyRiskMeta.hexColor,
                    }}
                  />
                </div>
                <p className="text-[10.5px] text-muted-foreground leading-tight">
                  Chance of extreme precipitation event (&gt;64.5mm/day) causing inundation.
                </p>
              </div>
            </div>

            {/* Confidence & Meteorological Attribution */}
            <div className="p-3.5 rounded-lg border border-border/60 bg-background/60 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Model Confidence &amp; Teleconnection Attribution
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-muted-foreground">Calibrated Confidence:</span>
                  <span className="font-bold text-foreground">
                    {formatProbability(currentPred.calibrated_confidence)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10.5px] font-medium text-muted-foreground">Primary Driver</span>
                  <p className="font-semibold text-foreground mt-0.5 font-mono">
                    {currentPred.primary_driver || 'Global Teleconnection Baseline'}
                  </p>
                </div>
                <div>
                  <span className="text-[10.5px] font-medium text-muted-foreground">Secondary Driver</span>
                  <p className="font-semibold text-foreground mt-0.5 font-mono">
                    {currentPred.secondary_driver || 'Local Soil Moisture Feedback'}
                  </p>
                </div>
                <div>
                  <span className="text-[10.5px] font-medium text-muted-foreground">Analogous Historical Year</span>
                  <p className="font-semibold text-foreground mt-0.5 font-mono">
                    {currentPred.teleconnection_analog_year
                      ? `Monsoon ${currentPred.teleconnection_analog_year}`
                      : 'Multi-decadal climatology'}
                  </p>
                </div>
              </div>

              {/* Advisory identifier if present */}
              {currentPred.advisory_code && (
                <div className="pt-1 text-xs border-t border-border/40 flex items-center justify-between">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Advisory Rule Trigger:
                  </span>
                  <span className="text-foreground font-mono text-[11px] bg-muted/50 px-2 py-0.5 rounded border border-border/40">
                    {currentPred.advisory_code}
                  </span>
                </div>
              )}

            </div>
          </div>
        ) : (
          <div className="p-6 text-center rounded-lg border border-dashed border-border/60 bg-muted/10 space-y-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto" />
            <h4 className="text-sm font-semibold text-foreground">
              No Forecast Computed for {weekLabels[activeWeek].title}
            </h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              The daily inference pipeline has not yet generated a forecast for this lead-time horizon in block{' '}
              <span className="font-mono font-medium">{block.block_id}</span>.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
