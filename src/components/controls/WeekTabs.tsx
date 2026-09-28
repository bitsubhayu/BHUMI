'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition, useEffect, useRef } from 'react';
import type { LeadWeek } from '@/lib/forecast/types';
import { useT } from '@/lib/i18n/useT';

interface WeekTabsProps {
  activeWeek: LeadWeek;
  validFrom: string; // ISO 8601 — start of Week 1 (Days 1–7)
}

export function WeekTabs({ activeWeek, validFrom }: WeekTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const setWeek = useCallback((week: LeadWeek) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('week', String(week));
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  }, [router, searchParams]);

  // Arrow key navigation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        const next = Math.min(activeWeek + 1, 4) as LeadWeek;
        setWeek(next);
      } else if (e.key === 'ArrowLeft') {
        const prev = Math.max(activeWeek - 1, 1) as LeadWeek;
        setWeek(prev);
      }
    };
    container.addEventListener('keydown', handleKey);
    return () => container.removeEventListener('keydown', handleKey);
  }, [activeWeek, setWeek]);

  // Compute date ranges
  const from = new Date(validFrom);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(d);

  const weeks: Array<{ n: LeadWeek; start: string; end: string }> = [1, 2, 3, 4].map((n) => {
    const startDay = (n - 1) * 7;
    const s = new Date(from);
    s.setDate(s.getDate() + startDay);
    const e = new Date(from);
    e.setDate(e.getDate() + startDay + 6);
    return { n: n as LeadWeek, start: fmt(s), end: fmt(e) };
  });

  return (
    <div
      ref={containerRef}
      className="week-tabs"
      role="tablist"
      aria-label="Select forecast week"
      id="week-tabs"
    >
      {weeks.map(({ n, start, end }) => (
        <button
          key={n}
          role="tab"
          aria-selected={activeWeek === n}
          aria-controls={`week-panel-${n}`}
          id={`week-tab-${n}`}
          onClick={() => setWeek(n)}
          className={`week-tab${activeWeek === n ? ' active' : ''}`}
          type="button"
        >
          <span>{t('week.label', { n: String(n) })}</span>
          <span className="week-tab-date">
            {start} – {end}
          </span>
        </button>
      ))}
    </div>
  );
}
