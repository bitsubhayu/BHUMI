'use client';

import { useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import type { RegionRisk, Hazard, LeadWeek } from '@/lib/forecast/types';
import { toBand } from '@/lib/forecast/types';
import { useT } from '@/lib/i18n/useT';

interface GaugeCardProps {
  risk: RegionRisk | null;
  activeHazard: Hazard;
  activeWeek: LeadWeek;
}

const GAUGE_R = 52;
const GAUGE_CX = 70;
const GAUGE_CY = 70;
const GAUGE_CIRCUM = Math.PI * GAUGE_R; // semicircle

function ReliabilityChip({ level }: { level: 'low' | 'medium' | 'high' }) {
  const t = useT();
  const colors = {
    low: '#D9762B',
    medium: '#F2A91F',
    high: '#3FA38E',
  };
  return (
    <span
      className="text-xs font-medium px-2 py-1 rounded-full"
      style={{ background: colors[level] + '20', color: colors[level] }}
      aria-label={t(`cards.gauge.reliability.${level}`)}
      title={t('cards.gauge.reliability_tooltip')}
    >
      {t(`cards.gauge.reliability.${level}`)}
    </span>
  );
}

export function GaugeCard({ risk, activeHazard, activeWeek }: GaugeCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const arcRef = useRef<SVGPathElement>(null);
  const t = useT();

  const probability = risk?.probabilities[activeHazard][activeWeek] ?? 0;
  const hazardLabel = t(`hazards.${activeHazard}`);
  const band = toBand(probability);
  const drivers = (risk?.drivers[activeHazard] ?? []).slice(0, 2);

  // Animate arc on probability change
  useEffect(() => {
    const el = arcRef.current;
    if (!el) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const offset = GAUGE_CIRCUM - (probability / 100) * GAUGE_CIRCUM;
    if (mq.matches) {
      el.style.strokeDashoffset = String(offset);
      return;
    }
    el.style.transition = 'stroke-dashoffset 500ms cubic-bezier(0.16,1,0.3,1)';
    el.style.strokeDashoffset = String(offset);
  }, [probability]);

  function setWeek(w: LeadWeek) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('week', String(w));
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  }

  const HAZARD_COLORS = {
    onset: '#3FA38E',
    dry_spell: '#D9762B',
    heavy_rain: '#4A73CC',
  };
  const arcColor = HAZARD_COLORS[activeHazard];

  return (
    <div className="bhumi-card" id="gauge-card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-[var(--ink)]">{hazardLabel}</h3>
        {risk && <ReliabilityChip level={risk.reliability} />}
      </div>

      {/* Semicircle gauge */}
      <div className="flex justify-center">
        <svg
          width="140"
          height="80"
          viewBox="0 0 140 80"
          aria-label={`${probability}% chance of ${hazardLabel}`}
          role="img"
        >
          {/* Background arc */}
          <path
            d={`M ${GAUGE_CX - GAUGE_R} ${GAUGE_CY} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${GAUGE_CX + GAUGE_R} ${GAUGE_CY}`}
            fill="none"
            stroke="var(--line)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Foreground arc */}
          <path
            ref={arcRef}
            d={`M ${GAUGE_CX - GAUGE_R} ${GAUGE_CY} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${GAUGE_CX + GAUGE_R} ${GAUGE_CY}`}
            fill="none"
            stroke={arcColor}
            strokeWidth="10"
            strokeLinecap="round"
            style={{
              strokeDasharray: GAUGE_CIRCUM,
              strokeDashoffset: GAUGE_CIRCUM - (probability / 100) * GAUGE_CIRCUM,
            }}
          />
          {/* Center text */}
          <text x={GAUGE_CX} y={GAUGE_CY - 6} textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--ink)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {probability}%
          </text>
          <text x={GAUGE_CX} y={GAUGE_CY + 10} textAnchor="middle" fontSize="11" fill="var(--ink-muted)">
            {t(`bands.${band}`)}
          </text>
        </svg>
      </div>

      {/* Week bars */}
      {risk && (
        <div className="flex gap-1.5 mt-1" aria-label="Probability by week">
          {([1, 2, 3, 4] as LeadWeek[]).map((w) => {
            const p = risk.probabilities[activeHazard][w];
            const isActive = activeWeek === w;
            return (
              <button
                key={w}
                onClick={() => setWeek(w)}
                aria-pressed={isActive}
                aria-label={`Week ${w}: ${p}%`}
                className="flex-1 flex flex-col items-center gap-0.5 group"
                type="button"
              >
                <div
                  className="w-full rounded-sm overflow-hidden"
                  style={{ height: 28, background: 'var(--line)' }}
                  aria-hidden="true"
                >
                  <div
                    style={{
                      height: `${p}%`,
                      background: isActive ? arcColor : arcColor + '60',
                      transition: 'height 0.45s cubic-bezier(0.16,1,0.3,1)',
                      marginTop: `${100 - p}%`,
                    }}
                  />
                </div>
                <span
                  className="text-[10px]"
                  style={{ color: isActive ? 'var(--ink)' : 'var(--ink-muted)', fontWeight: isActive ? 600 : 400 }}
                >
                  W{w}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Top driver chips */}
      {drivers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[var(--line)]">
          {drivers.map((d) => (
            <span
              key={d.key}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: 'var(--surface-tile)', color: 'var(--ink-muted)' }}
            >
              {d.effect === 'raises' ? '↑' : '↓'} {d.labelByLocale.en}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
