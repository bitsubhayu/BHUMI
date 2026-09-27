import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Map, Calendar, Database, Sparkles } from 'lucide-react';

export function OverviewStats() {
  const stats = [
    {
      label: 'Nationwide Block Scale',
      value: '6,700+ Blocks',
      description: 'Comprehensive coverage across all Indian agro-climatic zones',
      icon: Map,
    },
    {
      label: 'Lead-Time Horizon',
      value: '1–4 Weeks',
      description: 'Probabilistic onset, dry break & heavy spell buckets',
      icon: Calendar,
    },
    {
      label: 'Panchayat Downscaling',
      value: 'Computed On-Demand',
      description: 'BCSD terrain adjustment without ballooning historical storage',
      icon: Sparkles,
    },
    {
      label: 'Supabase Storage Budget',
      value: '< 215 MB / 500 MB',
      description: 'Compact array-packed season rows (~12 MB/year) leaving 55% headroom',
      icon: Database,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <Card key={i} className="border-border/70 shadow-sm bg-card hover:border-border transition-colors">
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                <div className="p-1.5 rounded-md bg-muted text-foreground">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="text-xl font-bold tracking-tight text-foreground">{stat.value}</div>
              <p className="text-[11px] text-muted-foreground leading-snug">{stat.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
