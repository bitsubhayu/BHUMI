'use client';

import React, { useState } from 'react';
import { AlertTriangle, Clock, Database, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import type { ModelMetadata } from '@/lib/data';

interface ModelReadinessBannerProps {
  metadata?: ModelMetadata | null;
  lastSyncTime?: string | null;
}

export function ModelReadinessBanner({ metadata, lastSyncTime }: ModelReadinessBannerProps) {
  const [showReasons, setShowReasons] = useState(false);

  const isProduction = metadata?.isProductionReady ?? false;
  const status = metadata?.readinessStatus || 'EXPERIMENTAL';
  const coverage = metadata?.trainingCoverage;
  const reasons = metadata?.reasons || [];

  const seasonsText = coverage?.seasonsList && coverage.seasonsList.length > 0
    ? coverage.seasonsList.join(', ')
    : typeof coverage?.seasonsCount === 'number'
    ? `${coverage.seasonsCount} season(s)`
    : '0 seasons';

  const blocksText = typeof coverage?.blocksCount === 'number'
    ? `${coverage.blocksCount} blocks`
    : '0 blocks';

  const samplesText = typeof coverage?.samplesGenerated === 'number'
    ? `${coverage.samplesGenerated} samples`
    : '0 samples';

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
    <div
      className={`w-full rounded-lg border px-4 py-3 shadow-xs transition-colors ${
        isProduction
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-200'
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div
            className={`p-1 rounded-md mt-0.5 sm:mt-0 shrink-0 ${
              isProduction
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
            }`}
          >
            {isProduction ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs font-bold uppercase tracking-wider font-mono px-1.5 py-0.5 rounded border ${
                  isProduction
                    ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/30'
                }`}
              >
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
                : `Status: ${status} (${blocksText}, seasons: [${seasonsText}], ${samplesText}). Downscaled probabilities must be interpreted with caution.`}
            </p>

            {!isProduction && reasons.length > 0 && (
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={() => setShowReasons(!showReasons)}
                  className="text-[11px] font-mono font-medium text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>{showReasons ? 'Hide Authoritative Readiness Reasons' : `View ${reasons.length} Readiness Reasons`}</span>
                  {showReasons ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>

                {showReasons && (
                  <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground pl-4 list-disc font-sans">
                    {reasons.map((reason, idx) => (
                      <li key={idx} className="leading-snug">
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground self-end sm:self-center font-mono">
          <div className="flex items-center gap-1.5" title="Data Freshness & Sync Window">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>Sync: {displaySync}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Authoritative Model Tier">
            <Database className="h-3.5 w-3.5 text-primary" />
            <span>Tier: {metadata?.modelTier || 'EXPERIMENTAL'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
