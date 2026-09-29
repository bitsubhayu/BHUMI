'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Hazard } from '@/lib/forecast/types';
import { RISK_COLORS } from '@/lib/forecast/types';
import { useT } from '@/lib/i18n/useT';

interface MapLegendProps {
  activeHazard: Hazard;
}

const BINS = [
  { label: '< 20%', idx: 0 },
  { label: '20–39%', idx: 1 },
  { label: '40–59%', idx: 2 },
  { label: '60–79%', idx: 3 },
  { label: '≥ 80%', idx: 4 },
];

export function MapLegend({ activeHazard }: MapLegendProps) {
  const [expanded, setExpanded] = useState(false);
  const t = useT();
  const colors = RISK_COLORS[activeHazard];
  const hazardLabel = t(`hazards.${activeHazard}`);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="map-overlay bottom-0 flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--ink)]"
        aria-label="Show risk legend"
        aria-expanded="false"
        type="button"
        id="map-legend-toggle"
      >
        <span
          className="w-3 h-3 rounded-sm flex-shrink-0"
          style={{ background: colors[3] }}
          aria-hidden="true"
        />
        {t('legend.title')}
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="map-overlay bottom-0 p-3 min-w-[160px]" id="map-legend-panel" role="dialog" aria-label="Risk legend">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
          {hazardLabel}
        </span>
        <button
          onClick={() => setExpanded(false)}
          className="text-[var(--ink-muted)] hover:text-[var(--ink)] p-0.5"
          aria-label="Close legend"
          type="button"
        >
          <ChevronDown size={12} strokeWidth={1.75} style={{ transform: 'rotate(180deg)' }} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {BINS.map((bin) => (
          <div key={bin.idx} className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded-sm flex-shrink-0"
              style={{ background: colors[bin.idx] }}
              aria-hidden="true"
            />
            <span className="text-xs text-[var(--ink-muted)]">{bin.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-1 pt-1 border-t border-[var(--line)]">
          <span
            className="w-4 h-4 rounded-sm flex-shrink-0"
            style={{ background: '#E0E0E0', border: '1px dashed #ccc' }}
            aria-hidden="true"
          />
          <span className="text-xs text-[var(--ink-muted)]">{t('legend.no_data')}</span>
        </div>
      </div>
    </div>
  );
}
