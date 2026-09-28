'use client';

import { useEffect, useRef, useState } from 'react';
import { Pin, MapPin } from 'lucide-react';
import type { RegionRisk, Region, Hazard, LeadWeek } from '@/lib/forecast/types';
import { toBand } from '@/lib/forecast/types';
import { useT } from '@/lib/i18n/useT';

interface StatTileProps {
  hazard: Hazard;
  probability: number;
  week: LeadWeek;
  previousProbability?: number;
}

const HAZARD_COLORS: Record<Hazard, { bar: string; band: { [key: string]: string } }> = {
  onset: {
    bar: '#3FA38E',
    band: { low: '#E3F3EE', moderate: '#B7DFD2', high: '#7CC4B0', very_high: '#13755F' },
  },
  dry_spell: {
    bar: '#D9762B',
    band: { low: '#FBEBCB', moderate: '#F6CF8A', high: '#EDA84A', very_high: '#B0451C' },
  },
  heavy_rain: {
    bar: '#4A73CC',
    band: { low: '#E2ECFA', moderate: '#B5CDF1', high: '#7DA4E4', very_high: '#2B449E' },
  },
};

const HAZARD_ICONS: Record<Hazard, string> = {
  onset: '🌧',
  dry_spell: '☀️',
  heavy_rain: '⛈',
};

function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(value);

  useEffect(() => {
    if (!ref.current) return;
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    // Only animate if motion is not reduced
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      ref.current.textContent = String(to);
      prevRef.current = to;
      return;
    }

    const start = performance.now();
    const dur = 450;
    function frame(now: number) {
      const t = Math.min((now - start) / dur, 1);
      // ease-out curve
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (to - from) * eased);
      if (ref.current) ref.current.textContent = String(current);
      if (t < 1) requestAnimationFrame(frame);
      else prevRef.current = to;
    }
    requestAnimationFrame(frame);
  }, [value]);

  return (
    <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </span>
  );
}

function StatTile({ hazard, probability }: Omit<StatTileProps, 'week' | 'previousProbability'>) {
  const t = useT();
  const band = toBand(probability);
  const colors = HAZARD_COLORS[hazard];
  const bandColor = colors.band[band];

  return (
    <div className="stat-tile">
      <span className="text-lg" aria-hidden="true">{HAZARD_ICONS[hazard]}</span>
      <p className="stat-label">{t(`hazards.${hazard}`)}</p>
      <p className="stat-value" aria-label={`${probability}% chance`}>
        <AnimatedNumber value={probability} />%
      </p>
      <div className="flex items-center gap-2">
        <span
          className="stat-band"
          style={{ background: bandColor, color: band === 'very_high' ? 'white' : 'var(--ink)' }}
        >
          {t(`bands.${band}`)}
        </span>
      </div>
      {/* Thin probability bar */}
      <div
        className="mt-auto h-1 rounded-full overflow-hidden"
        style={{ background: 'var(--line)', marginTop: '8px' }}
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${probability}%`,
            background: colors.bar,
            transition: 'width 0.45s cubic-bezier(0.16,1,0.3,1)',
          }}
        />
      </div>
    </div>
  );
}

interface LocationCardProps {
  region: Region | null;
  risk: RegionRisk | null;
  activeWeek: LeadWeek;
  updatedAt: string;
}

export function LocationCard({ region, risk, activeWeek, updatedAt }: LocationCardProps) {
  const t = useT();
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = region?.id;
    queueMicrotask(() => {
      if (cancelled || !id) return;
      const pins = JSON.parse(localStorage.getItem('bhumi_pins') ?? '[]') as string[];
      setPinned(pins.includes(id));
    });
    return () => { cancelled = true; };
  }, [region]);

  function togglePin() {
    if (!region) return;
    const pins = JSON.parse(localStorage.getItem('bhumi_pins') ?? '[]') as string[];
    const next = pinned
      ? pins.filter((p) => p !== region.id)
      : [...pins, region.id];
    localStorage.setItem('bhumi_pins', JSON.stringify(next));
    setPinned(!pinned);
  }

  const updatedFmt = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(updatedAt));

  const hazards: Hazard[] = ['onset', 'dry_spell', 'heavy_rain'];

  return (
    <div className="bhumi-card" id="location-card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink)] leading-tight">
            {region?.name ?? t('select_region')}
          </h2>
          {region && (
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
              {t('cards.location.updated', {
                date: updatedFmt.split(',')[0],
                time: updatedFmt.split(',')[1]?.trim() ?? '',
              })}
            </p>
          )}
        </div>
        {region && (
          <button
            onClick={togglePin}
            aria-label={t('cards.location.pin')}
            aria-pressed={pinned}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-tile)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
            type="button"
          >
            {pinned ? <Pin size={16} strokeWidth={1.75} /> : <MapPin size={16} strokeWidth={1.75} />}
          </button>
        )}
      </div>

      {risk && region ? (
        <div className="grid grid-cols-3 gap-2 flex-1">
          {hazards.map((h) => (
            <StatTile
              key={h}
              hazard={h}
              probability={risk.probabilities[h][activeWeek]}
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--ink-muted)]">
          {t('select_region')}
        </div>
      )}
    </div>
  );
}
