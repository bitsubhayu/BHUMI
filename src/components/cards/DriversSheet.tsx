'use client';

import { useEffect, useRef } from 'react';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import type { RegionRisk, Hazard, Driver, Locale } from '@/lib/forecast/types';
import { useT, useLocale } from '@/lib/i18n/useT';

interface DriversSheetProps {
  risk: RegionRisk;
  activeHazard: Hazard;
  onClose: () => void;
}

interface DriverBarProps {
  driver: Driver;
  index: number;
}

function DriverBar({ driver, index }: DriverBarProps) {
  const { locale } = useLocale();
  const t = useT();
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      el.style.transform = 'scaleX(1)';
      return;
    }
    const delay = index * 30;
    setTimeout(() => {
      el.style.transition = `transform 350ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`;
      el.style.transform = 'scaleX(1)';
    }, 50);
  }, [index]);

  const label = driver.labelByLocale[locale as Locale] ?? driver.labelByLocale.en;
  const color = driver.effect === 'raises' ? '#3FA38E' : '#D9762B';
  const Icon = driver.effect === 'raises' ? TrendingUp : TrendingDown;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Icon size={14} strokeWidth={1.75} color={color} aria-hidden="true" />
        <span className="text-sm text-[var(--ink)] flex-1">{label}</span>
        <span className="text-xs text-[var(--ink-muted)]">
          {t(`drivers.${driver.effect}`)}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--line)' }}
        aria-hidden="true"
      >
        <div
          ref={barRef}
          className="h-full rounded-full"
          style={{
            width: `${Math.round(driver.strength * 100)}%`,
            background: color,
            transform: 'scaleX(0)',
            transformOrigin: 'left',
          }}
        />
      </div>
    </div>
  );
}

export function DriversSheet({ risk, activeHazard, onClose }: DriversSheetProps) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const drivers = risk.drivers[activeHazard] ?? [];

  // Focus trap
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    el.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const focusable = el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const topDrivers = drivers.slice(0, 4);
  const hazardLabel = t(`hazards.${activeHazard}`);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--ink)]/30"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drivers-title"
        tabIndex={-1}
        className="relative bg-[var(--surface-card)] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80dvh] overflow-y-auto p-6 shadow-xl outline-none"
        id="drivers-sheet"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 id="drivers-title" className="text-base font-semibold text-[var(--ink)]">
              {t('cards.advisory.why')}
            </h2>
            <p className="text-xs text-[var(--ink-muted)]">{hazardLabel}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-[var(--surface-tile)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
            type="button"
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {/* Summary sentence */}
        {topDrivers.length > 0 && (
          <p className="text-sm text-[var(--ink-muted)] mb-4">
            {t('drivers.summary_prefix')}{' '}
            {topDrivers.slice(0, 2).map((d) => d.labelByLocale.en ?? d.key).join(' and ')}.
          </p>
        )}

        {/* Driver bars */}
        <div className="flex flex-col gap-4">
          {topDrivers.map((driver, i) => (
            <DriverBar key={driver.key} driver={driver} index={i} />
          ))}
        </div>

        {/* Disclaimer */}
        <p className="mt-6 text-xs text-[var(--ink-muted)] italic leading-relaxed">
          {t('drivers.disclaimer')}
        </p>
      </div>
    </div>
  );
}
