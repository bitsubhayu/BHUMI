'use client';

import { useRef, useEffect } from 'react';
import type { RegionRisk, Hazard, LeadWeek } from '@/lib/forecast/types';
import { useT } from '@/lib/i18n/useT';

interface StatChipsProps {
  risk: RegionRisk;
  activeHazard: Hazard;
  activeWeek: LeadWeek;
  /** Map project function — converts lng/lat to pixel coordinates */
  getPosition: () => { x: number; y: number } | null;
}

const HAZARDS: Hazard[] = ['onset', 'dry_spell', 'heavy_rain'];

/**
 * Three joined black pills anchored to the selected block centroid.
 * Position is updated from a requestAnimationFrame-throttled move handler
 * by writing to element style.transform (not React state).
 */
export function StatChips({ risk, activeHazard, activeWeek, getPosition }: StatChipsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    let rafId: number;
    function update() {
      const pos = getPosition();
      if (pos && ref.current) {
        ref.current.style.transform = `translate(calc(${pos.x}px - 50%), calc(${pos.y}px - 100% - 12px))`;
        ref.current.style.opacity = '1';
      }
      rafId = requestAnimationFrame(update);
    }
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [getPosition]);

  const hazardKeys: Record<Hazard, string> = {
    onset: t('hazards.onset'),
    dry_spell: t('hazards.dry_spell'),
    heavy_rain: t('hazards.heavy_rain'),
  };

  return (
    <div
      ref={ref}
      className="stat-chips absolute top-0 left-0 pointer-events-none"
      style={{ opacity: 0, transition: 'opacity 0.2s' }}
      aria-live="polite"
      aria-label="Selected block risk statistics"
    >
      {HAZARDS.map((hazard, i) => {
        const prob = risk.probabilities[hazard][activeWeek];
        const isActive = hazard === activeHazard;
        return (
          <div
            key={hazard}
            className="stat-chip"
            style={{
              borderRadius: i === 0 ? '100px 4px 4px 100px' : i === 2 ? '4px 100px 100px 4px' : '4px',
              opacity: isActive ? 1 : 0.65,
              transform: isActive ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.2s, opacity 0.2s',
            }}
          >
            <span className="stat-chip-value">{prob}%</span>
            <span className="stat-chip-label">{hazardKeys[hazard].split(' ')[0]}</span>
          </div>
        );
      })}
    </div>
  );
}
