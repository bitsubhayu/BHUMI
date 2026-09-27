import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, HelpCircle, Compass, Waves, Wind } from 'lucide-react';

export function ExplainabilityPreview() {
  const drivers = [
    {
      name: 'ENSO (El Niño–Southern Oscillation)',
      source: 'NOAA CPC (Oceanic Niño Index)',
      role: 'Macro-scale circulation & monsoon trough strength',
      icon: Waves,
    },
    {
      name: 'IOD (Indian Ocean Dipole)',
      source: 'Australian BOM (Dipole Mode Index)',
      role: 'Arabian Sea vs Bay of Bengal moisture convergence',
      icon: Compass,
    },
    {
      name: 'MJO (Madden–Julian Oscillation)',
      source: 'BOM / BoM RMM Phases 1–8',
      role: 'Intra-seasonal convective pulse controlling onset & break spells',
      icon: Wind,
    },
  ];

  return (
    <Card id="explainability" className="border-border/80 shadow-sm">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold tracking-tight">
                Model Explainability & Physical Teleconnections
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-mono">
                Analog + LightGBM
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Every probability output is coupled with dominant physical drivers, preventing black-box predictions.
            </p>
          </div>
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-4">
        {/* Core telemetry signals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {drivers.map((driver, index) => {
            const Icon = driver.icon;
            return (
              <div key={index} className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-muted text-foreground">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">{driver.name.split(' ')[0]}</span>
                </div>
                <div className="text-[11px] font-medium text-muted-foreground">{driver.source}</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{driver.role}</p>
              </div>
            );
          })}
        </div>

        {/* Example driver output showcase */}
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <HelpCircle className="h-3.5 w-3.5 text-primary" />
            <span>Operational Output Pattern (PRD §2)</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Example Driver Synthesis:</strong>{' '}
            <code className="bg-background px-1.5 py-0.5 rounded border border-border text-[11px] font-mono text-foreground">
              &quot;IOD negative + MJO phase 3 → 65% break risk, next 2 weeks&quot;
            </code>
            <br />
            Farmers and extension officers receive clear physical causality rather than unexplained probability scores.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
