'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Mountain,
  Sliders,
  Info,
  TrendingUp,
  CloudRain,
  Sun,
} from 'lucide-react';
import type { BlockRow, LivePredictionRow } from '@/lib/supabase/types';
import {
  derivePanchayatOutlook,
  getPresetPanchayatProfiles,
  type PanchayatTerrainProfile,
} from '@/lib/panchayat';
import { getRiskLevel, getRiskMeta, formatProbability } from '@/lib/risk';

interface PanchayatOutlookViewProps {
  block: BlockRow | null;
  prediction: LivePredictionRow | null;
}

export function PanchayatOutlookView({ block, prediction }: PanchayatOutlookViewProps) {
  const presets = useMemo(() => {
    if (!block) return [];
    return getPresetPanchayatProfiles(block);
  }, [block]);

  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);

  const activeProfile = useMemo<Partial<PanchayatTerrainProfile>>(() => {
    if (!block) return {};
    return presets[selectedPresetIndex] || presets[0] || {};
  }, [block, presets, selectedPresetIndex]);


  const derived = useMemo(() => {
    if (!block || !prediction) return null;
    return derivePanchayatOutlook(block, prediction, activeProfile);
  }, [block, prediction, activeProfile]);

  if (!block || !prediction) {
    return (
      <Card className="border-border/70 shadow-sm bg-card/60 backdrop-blur-xs">
        <CardContent className="p-6 text-center text-muted-foreground text-xs space-y-2">
          <Mountain className="h-6 w-6 text-primary mx-auto opacity-70" />
          <p className="font-semibold text-foreground">Select a block with an active forecast to view derived panchayat terrain adjustments.</p>
          <p className="text-[11px]">BCSD micro-topography downscaling operates on-demand relative to block centroid elevation.</p>
        </CardContent>
      </Card>
    );
  }

  const breakRiskMeta = derived ? getRiskMeta(getRiskLevel(derived.breakProbability)) : null;
  const onsetRiskMeta = derived ? getRiskMeta(getRiskLevel(derived.onsetProbability)) : null;
  const heavyRiskMeta = derived ? getRiskMeta(getRiskLevel(derived.heavySpellProbability)) : null;

  return (
    <Card className="border-border/70 shadow-sm bg-card/60 backdrop-blur-xs">
      <CardHeader className="p-4 sm:p-5 border-b border-border/50 bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-primary font-mono text-[10.5px] border-primary/40 bg-primary/5">
                ON-DEMAND BCSD
              </Badge>
              <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider">
                {derived?.provenance.label}
              </Badge>
            </div>
            <CardTitle className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
              <Mountain className="h-5 w-5 text-primary" />
              {derived?.panchayatName}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Parent Block: <span className="font-semibold text-foreground">{block.block_name}</span> ({block.district_name}, {block.state_name})
            </p>
          </div>

          <div className="text-right text-xs font-mono text-muted-foreground bg-background/50 p-2 rounded border border-border/40 shrink-0">
            <div>
              Target Elev: <span className="font-bold text-foreground">{derived?.elevationM}m</span>
              <span className="text-primary ml-1 font-semibold">
                ({derived && derived.elevationDeltaM >= 0 ? `+${derived.elevationDeltaM}` : derived?.elevationDeltaM}m vs block)
              </span>
            </div>
            <div className="text-[11px] mt-0.5">
              Slope: <span className="font-bold text-foreground">{derived?.slopeDeg}&deg;</span> | Orographic: {derived?.adjustments.orographicFactor}%
            </div>
          </div>
        </div>

        {/* Mandatory Provenance Disclaimer */}
        <div className="mt-3 p-2.5 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-950 dark:text-sky-200 text-xs flex items-start gap-2">
          <Info className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 leading-relaxed">
            <span className="font-bold uppercase tracking-wider text-[10.5px] text-sky-700 dark:text-sky-300">
              Notice: {derived?.provenance.label}
            </span>
            <p className="text-[11px] text-muted-foreground">
              {derived?.provenance.disclaimer}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-5">
        {/* Preset Micro-Terrain Selector */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <Sliders className="h-3.5 w-3.5" />
            Topographical Archetype (Micro-Elevation Variance)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {presets.map((preset, idx) => {
              const isSelected = selectedPresetIndex === idx;
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setSelectedPresetIndex(idx)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${

                    isSelected
                      ? 'bg-primary/10 border-primary shadow-xs ring-1 ring-primary'
                      : 'bg-muted/30 hover:bg-muted/60 border-border/60'
                  }`}
                >
                  <div className="text-xs font-bold text-foreground">{preset.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-1">
                    Elevation: {preset.elevationM}m ({preset.elevationM - (block.elevation_m ?? 300) >= 0 ? '+' : ''}
                    {preset.elevationM - (block.elevation_m ?? 300)}m)
                  </div>
                  <div className="text-[10px] text-primary capitalize font-medium mt-0.5">
                    Archetype: {preset.terrainType}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Derived Probabilities vs Parent Block Baseline */}
        {derived && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium border-b border-border/40 pb-1">
              <span>Downscaled Risk Metrics</span>
              <span>Parent Block Baseline &Delta; Delta</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Break Risk */}
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1">
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                    Break Risk
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold border ${breakRiskMeta?.badgeClass}`}>
                    {breakRiskMeta?.label}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-foreground">
                    {formatProbability(derived.breakProbability)}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {derived.adjustments.breakDelta >= 0 ? `+${derived.adjustments.breakDelta}` : derived.adjustments.breakDelta}%
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Base block: {formatProbability(prediction.break_probability)}
                </p>
              </div>

              {/* Onset Risk */}
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                    Onset Likelihood
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold border ${onsetRiskMeta?.badgeClass}`}>
                    {onsetRiskMeta?.label}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-foreground">
                    {formatProbability(derived.onsetProbability)}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {derived.adjustments.onsetDelta >= 0 ? `+${derived.adjustments.onsetDelta}` : derived.adjustments.onsetDelta}%
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Base block: {formatProbability(prediction.onset_probability)}
                </p>
              </div>

              {/* Heavy Rain Risk */}
              <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1">
                    <CloudRain className="h-3.5 w-3.5 text-sky-500" />
                    Heavy Rain Risk
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold border ${heavyRiskMeta?.badgeClass}`}>
                    {heavyRiskMeta?.label}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-foreground">
                    {formatProbability(derived.heavySpellProbability)}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {derived.adjustments.heavyDelta >= 0 ? `+${derived.adjustments.heavyDelta}` : derived.adjustments.heavyDelta}%
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Base block: {formatProbability(prediction.heavy_spell_probability)}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-md bg-muted/30 border border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>BCSD Lapse Adjustment Rate: ~1.5% precipitation trigger per 100m elevation delta</span>
              <span className="font-mono">Calibrated Confidence: {formatProbability(derived.calibratedConfidence)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
