'use client';

import React from 'react';
import { AlertTriangle, Clock, Database, CheckCircle2 } from 'lucide-react';
import type { ModelMetadata } from '@/lib/data';

interface ModelReadinessBannerProps {
  metadata?: ModelMetadata | null;
  lastSyncTime?: string | null;
}

export function ModelReadinessBanner({ metadata, lastSyncTime }: ModelReadinessBannerProps) {
  const isProduction = metadata?.isProductionReady ?? false;
  const status = metadata?.readinessStatus || 'EXPERIMENTAL';
  const displaySync = lastSyncTime
    ? new Date(lastSyncTime).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Daily Ingestion Active';

  return (
    <div className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-4 py-3 shadow-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-1 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 mt-0.5 sm:mt-0 shrink-0">
            {isProduction ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                {isProduction ? 'Operational Readiness Tier' : 'Experimental System Status'}
              </span>
              <span className="text-xs font-semibold text-foreground">
                {isProduction
                  ? 'Validated Multi-Season Operational Forecasts'
                  : 'Experimental model output — historical training coverage is currently limited.'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {isProduction
                ? 'Model validated against national multi-year baseline archive.'
                : 'Status: ' +
                  status +
                  ' (2 blocks, 2024 season archive). Downscaled probabilities must be interpreted with caution.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground self-end sm:self-center font-mono">
          <div className="flex items-center gap-1.5" title="Data Freshness & Sync Window">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>Sync: {displaySync}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Supabase Storage & Inference Tier">
            <Database className="h-3.5 w-3.5 text-primary" />
            <span>Tier: {metadata?.modelTier || 'EXPERIMENTAL'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
