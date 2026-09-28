'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Waves,
  Compass,
  Wind,
  Droplets,
  Calendar,
  Layers,
} from 'lucide-react';

import type {
  LivePredictionRow,
  TeleconnectionsHistoryRow,
  LiveWeatherBufferRow,
} from '@/lib/supabase/types';

interface ExplainabilityPanelProps {
  prediction: LivePredictionRow | null;
  teleconnections?: TeleconnectionsHistoryRow[];
  recentObservations?: LiveWeatherBufferRow[];
}

export function ExplainabilityPanel({
  prediction,
  teleconnections = [],
  recentObservations = [],
}: ExplainabilityPanelProps) {
  // Use the latest teleconnection record from backend
  const latestTele = teleconnections.length > 0 ? teleconnections[0] : null;

  // Derive observation summaries strictly from backend data
  const totalRain7d = recentObservations.reduce((acc, row) => acc + (row.rainfall_mm || 0), 0);
  const avgSoilMoisture =
    recentObservations.length > 0
      ? recentObservations.reduce((acc, row) => acc + (row.soil_moisture_idx || 0), 0) /
        recentObservations.length
      : null;

  return (
    <Card id="explainability" className="border-border/70 shadow-sm bg-card/60 backdrop-blur-xs">
      <CardHeader className="p-4 sm:p-5 border-b border-border/50 bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary font-mono text-[10.5px] border-primary/40 bg-primary/5">
                CAUSAL ATTRIBUTION
              </Badge>
              <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                Physical Teleconnections &amp; Model Explainability
              </CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              Direct physical drivers and teleconnection states supplied by the backend forecasting engine.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-background/50 px-2 py-1 rounded border border-border/40 shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Analog Ensemble</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-5">
        {/* Dominant Drivers & Analog Year */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-lg border border-border/60 bg-muted/20 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Primary Physical Driver</span>
            </div>
            <p className="text-sm font-bold font-mono text-foreground leading-snug">
              {prediction?.primary_driver || 'Awaiting block prediction'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Dominant synoptic pattern driving the sub-seasonal probability distribution.
            </p>
          </div>

          <div className="p-3.5 rounded-lg border border-border/60 bg-muted/20 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Droplets className="h-3.5 w-3.5 text-sky-500" />
              <span>Secondary Driver</span>
            </div>
            <p className="text-sm font-bold font-mono text-foreground leading-snug">
              {prediction?.secondary_driver || 'Local Boundary Layer Feedback'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Secondary convective trigger or surface moisture constraint.
            </p>
          </div>

          <div className="p-3.5 rounded-lg border border-border/60 bg-muted/20 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Calendar className="h-3.5 w-3.5 text-amber-500" />
              <span>Analogous Historical Year</span>
            </div>
            <p className="text-sm font-bold font-mono text-foreground leading-snug">
              {prediction?.teleconnection_analog_year
                ? `Monsoon ${prediction.teleconnection_analog_year}`
                : 'Climatological Normal'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Historical season with nearest Euclidean teleconnection state vector.
            </p>
          </div>
        </div>

        {/* Global Teleconnection State Indices */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2.5">
            <Compass className="h-3.5 w-3.5" />
            Active Large-Scale Atmospheric Indices (Backend Teleconnections History)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* ENSO ONI */}
            <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Waves className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">ENSO (ONI)</div>
                    <div className="text-[10px] text-muted-foreground">NOAA CPC Niño 3.4</div>
                  </div>
                </div>
                <span className="text-sm font-extrabold font-mono text-foreground">
                  {latestTele?.enso_oni !== null && latestTele?.enso_oni !== undefined
                    ? `${latestTele.enso_oni > 0 ? '+' : ''}${latestTele.enso_oni.toFixed(2)} °C`
                    : 'Awaiting sync'}
                </span>
              </div>
              <p className="text-[10.5px] text-muted-foreground leading-tight">
                Tropical Pacific SST anomaly modulating the mean South Asian monsoon circulation.
              </p>
            </div>

            {/* IOD DMI */}
            <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Compass className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">IOD (DMI)</div>
                    <div className="text-[10px] text-muted-foreground">Australian BOM</div>
                  </div>
                </div>
                <span className="text-sm font-extrabold font-mono text-foreground">
                  {latestTele?.iod_dmi !== null && latestTele?.iod_dmi !== undefined
                    ? `${latestTele.iod_dmi > 0 ? '+' : ''}${latestTele.iod_dmi.toFixed(2)} °C`
                    : 'Awaiting sync'}
                </span>
              </div>
              <p className="text-[10.5px] text-muted-foreground leading-tight">
                Indian Ocean Dipole index controlling Arabian Sea moisture convergence into the subcontinent.
              </p>
            </div>

            {/* MJO Phase & Amplitude */}
            <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Wind className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">MJO State</div>
                    <div className="text-[10px] text-muted-foreground">BoM RMM1/RMM2</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold font-mono text-foreground block">
                    {latestTele?.mjo_phase ? `Phase ${latestTele.mjo_phase}` : 'Phase N/A'}
                  </span>
                  <span className="text-[10.5px] font-mono text-muted-foreground">
                    Amp: {latestTele?.mjo_amplitude?.toFixed(2) ?? 'N/A'}
                  </span>
                </div>
              </div>
              <p className="text-[10.5px] text-muted-foreground leading-tight">
                Madden-Julian Oscillation eastward-propagating convective pulse controlling active/break phases.
              </p>
            </div>
          </div>
        </div>

        {/* Local 7-Day Ground Context (if live buffer has records for selected block) */}
        {recentObservations.length > 0 && (
          <div className="p-3 rounded-lg border border-border/60 bg-background/50 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Droplets className="h-3.5 w-3.5 text-primary" />
                Recent Ground Buffer (Last {recentObservations.length} Days)
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                Source: {recentObservations[0]?.data_source || 'Live Ingestion Buffer'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-muted/30">
                <span className="text-[10px] text-muted-foreground block">Cumulative Rain</span>
                <span className="font-bold text-foreground">{totalRain7d.toFixed(1)} mm</span>
              </div>
              <div className="p-2 rounded bg-muted/30">
                <span className="text-[10px] text-muted-foreground block">Mean Soil Index</span>
                <span className="font-bold text-foreground">
                  {avgSoilMoisture !== null ? (avgSoilMoisture / 10).toFixed(1) : 'N/A'}
                </span>
              </div>
              <div className="p-2 rounded bg-muted/30">
                <span className="text-[10px] text-muted-foreground block">Max Temp</span>
                <span className="font-bold text-foreground">
                  {recentObservations[0]?.max_temp_c ? `${recentObservations[0].max_temp_c}°C` : 'N/A'}
                </span>
              </div>
              <div className="p-2 rounded bg-muted/30">
                <span className="text-[10px] text-muted-foreground block">Min Temp</span>
                <span className="font-bold text-foreground">
                  {recentObservations[0]?.min_temp_c ? `${recentObservations[0].min_temp_c}°C` : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
