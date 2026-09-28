import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Info } from 'lucide-react';
import { RISK_LEVELS, type RiskLevel } from '@/lib/risk';

export function RiskLegend() {
  const levels: RiskLevel[] = ['low', 'moderate', 'elevated', 'high', 'very_high'];

  return (
    <Card className="border-border/70 shadow-sm bg-card/60 backdrop-blur-xs">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Standard 5-Level Probabilistic Risk Scale
          </CardTitle>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            <span>Calibrated Event Probability</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {levels.map((lvl) => {
            const meta = RISK_LEVELS[lvl];
            return (
              <div
                key={lvl}
                className="flex flex-col gap-1 p-2.5 rounded-md bg-muted/30 border border-border/60 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full ring-2 ring-background"
                      style={{ backgroundColor: meta.hexColor }}
                    />
                    <span className="text-xs font-bold text-foreground font-mono">{meta.rangeText}</span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold border ${meta.badgeClass}`}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="text-[10.5px] text-muted-foreground leading-tight mt-1">{meta.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

