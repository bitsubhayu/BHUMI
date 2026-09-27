import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Info } from 'lucide-react';

export function RiskLegend() {
  const bands = [
    {
      range: '0% – 25%',
      label: 'Favorable / Low Risk',
      color: 'bg-emerald-500',
      description: 'Normal rainfall progression; safe sowing conditions',
    },
    {
      range: '25% – 50%',
      label: 'Mild Advisory',
      color: 'bg-sky-500',
      description: 'Transient dry spells; routine field monitoring suggested',
    },
    {
      range: '50% – 70%',
      label: 'Moderate Watch',
      color: 'bg-amber-500',
      description: 'Prolonged dry interval likely; prep moisture conservation',
    },
    {
      range: '70% – 85%',
      label: 'High Break Alert',
      color: 'bg-orange-500',
      description: 'Extended dry spell; delay sowing or arrange supplemental irrigation',
    },
    {
      range: '> 85%',
      label: 'Severe Break / False Onset',
      color: 'bg-rose-600',
      description: 'Critical moisture stress window; high seedling mortality risk',
    },
  ];

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Probabilistic Risk Scale
          </CardTitle>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {bands.map((band, idx) => (
            <div key={idx} className="flex flex-col gap-1 p-2 rounded-md bg-muted/40 border border-border/50">
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${band.color}`} />
                <span className="text-xs font-semibold text-foreground">{band.range}</span>
              </div>
              <span className="text-[11px] font-medium text-foreground">{band.label}</span>
              <p className="text-[10px] text-muted-foreground leading-tight">{band.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
