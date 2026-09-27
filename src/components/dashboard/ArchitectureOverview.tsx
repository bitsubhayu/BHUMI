import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, Database, GitBranch, Cpu, CheckCircle } from 'lucide-react';

export function ArchitectureOverview() {
  const pillars = [
    {
      title: 'Vercel Serves, Actions Computes',
      subtitle: 'Instant Request Path (TECH_STACK.md §1)',
      description:
        'Zero heavy inference runs in the HTTP request path. GitHub Actions runs background jobs (6 AM IST) and populates Supabase. Next.js App Router only reads precomputed tables for sub-100ms response times.',
      icon: Server,
    },
    {
      title: 'Compact 500 MB Storage Budget',
      subtitle: 'Array-Packed Season Rows (TECH_STACK.md §3)',
      description:
        'Avoids the naive daily-row trap (250 MB/yr). Stores one row per block per season using smallint[214] scaled arrays (~12 MB/yr). 12 seasons of history take only ~145 MB, leaving 55% headroom.',
      icon: Database,
    },
    {
      title: 'Two-Stage Downscaling ML',
      subtitle: 'Analog-Ensemble + LightGBM (TECH_STACK.md §5)',
      description:
        'Global ENSO/IOD/MJO trajectory is matched against historical analog years, downscaled to ~6,700 blocks via LightGBM/XGBoost, and calibrated with Platt scaling for honest probability scores.',
      icon: Cpu,
    },
    {
      title: '₹0 Sustainable Operating Cost',
      subtitle: 'Free & Public Infrastructure (TECH_STACK.md §8)',
      description:
        'Vercel Hobby + Supabase 500MB + GitHub Actions + MapLibre/OSM + Bhashini API. Entire architecture runs at zero recurring cost, making long-term government deployment viable.',
      icon: GitBranch,
    },
  ];

  return (
    <Card id="architecture" className="border-border/80 shadow-sm">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold tracking-tight">
                BHUMI Technical Architecture & Stack Foundations
              </CardTitle>
              <Badge variant="outline" className="text-[10px] font-mono">
                SIH 2026 Core
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Production-ready foundation designed strictly around zero-cost constraints and sub-second page delivery.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pillars.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <div
                key={index}
                className="p-3.5 rounded-lg bg-muted/40 border border-border/60 space-y-2 hover:border-border transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-md bg-primary text-primary-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">{pillar.title}</h4>
                    <span className="text-[10px] text-muted-foreground font-mono">{pillar.subtitle}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{pillar.description}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
            <span>Step 1 Architecture Verified: Strict TypeScript, Next.js App Router, Tailwind CSS, shadcn/ui</span>
          </div>
          <span className="font-mono text-[11px]">Repository: github.com/bitsubhayu/BHUMI</span>
        </div>
      </CardContent>
    </Card>
  );
}
