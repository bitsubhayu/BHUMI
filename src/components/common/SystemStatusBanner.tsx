'use client';

import React from 'react';
import { Database, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface SystemStatusBannerProps {
  isConfigured: boolean;
}

export function SystemStatusBanner({ isConfigured }: SystemStatusBannerProps) {
  return (
    <div
      id="system-status-banner"
      className="w-full bg-muted/40 border-b border-border/60 px-4 py-2 text-xs md:text-sm transition-colors"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={isConfigured ? 'default' : 'secondary'} className="gap-1 font-mono text-[11px]">
            <Database className="h-3 w-3" />
            {isConfigured ? 'Supabase Connected' : 'Step 1: Local Foundation Mode'}
          </Badge>
          <span className="text-muted-foreground">
            {isConfigured
              ? 'Connected to Supabase PostGIS live predictions table.'
              : 'Database keys pending in .env.local — Application running gracefully in architecture foundation mode.'}
          </span>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Vercel Free Tier Target
          </span>
          <span className="hidden md:inline text-border">|</span>
          <span className="flex items-center gap-1 font-mono text-[11px]">
            SIH 2026 PS 26086
          </span>
        </div>
      </div>
    </div>
  );
}
