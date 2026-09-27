import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sprout, CheckCircle2, AlertTriangle, Languages, ShieldAlert } from 'lucide-react';

export function AdvisoryShell() {
  const thresholdScenarios = [
    {
      action: 'Safe Sowing Window',
      condition: 'Onset probability > 70% & Break risk < 25% across Week 1–2',
      recommendation: 'Optimal soil moisture expected. Initiate land preparation and certified seed sowing.',
      icon: CheckCircle2,
      variant: 'default' as const,
      color: 'text-emerald-600',
    },
    {
      action: 'Delay Sowing Advisory',
      condition: 'False onset signature or Dry break probability > 60% in Week 2',
      recommendation: 'High seedling desiccation hazard. Withhold sowing until continuous revival spell is confirmed.',
      icon: AlertTriangle,
      variant: 'destructive' as const,
      color: 'text-amber-600',
    },
    {
      action: 'Irrigation Preparedness',
      condition: 'Crop in tillering/flowering + Break risk > 65% in Week 1',
      recommendation: 'Arrange farm pond / micro-irrigation reserves to protect standing Kharif crops against moisture stress.',
      icon: ShieldAlert,
      variant: 'secondary' as const,
      color: 'text-blue-600',
    },
  ];

  return (
    <Card id="crop-advisory" className="border-border/80 shadow-sm">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold tracking-tight">
                ICAR / KVK Rule-Based Agronomic Advisory Engine
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-mono">
                Agronomic Rules
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Directly translates calibrated hydro-meteorological risks into plain-language, crop-specific farmer actions.
            </p>
          </div>
          <Sprout className="h-4 w-4 text-emerald-600" />
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {thresholdScenarios.map((scenario, index) => {
            const Icon = scenario.icon;
            return (
              <div key={index} className="p-3.5 rounded-lg bg-muted/40 border border-border/60 flex flex-col justify-between gap-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">{scenario.action}</span>
                    <Icon className={`h-4 w-4 ${scenario.color}`} />
                  </div>
                  <div className="text-[10px] font-mono bg-background p-1.5 rounded border border-border/50 text-muted-foreground">
                    {scenario.condition}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                    {scenario.recommendation}
                  </p>
                </div>

                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Threshold Rule #{index + 1}</span>
                  <span className="text-[10px] uppercase font-mono">Kharif Season</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Translation delivery architecture note */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Languages className="h-4 w-4 text-primary shrink-0" />
            <span>
              <strong>Multilingual Delivery:</strong> Templates translated once via <strong>Bhashini (Govt. of India)</strong> across 10+ regional languages with zero runtime translation latency.
            </span>
          </div>
          <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
            Phase 3 Ready
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
