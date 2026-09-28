import { AppShell } from '@/components/shell/AppShell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Advisories — BHUMI',
  description: 'Weekly crop advisories for your selected block, 1 to 4 weeks ahead.',
};

// Verdicts in display order
const VERDICTS = [
  { key: 'sow_now', label: 'Good time to sow', icon: '🌱', color: '#3FA38E', bg: '#E3F3EE' },
  { key: 'wait', label: 'Wait a week', icon: '⏱', color: '#101413', bg: '#FBEBCB' },
  { key: 'prepare_irrigation', label: 'Prepare irrigation', icon: '💧', color: '#2B449E', bg: '#E2ECFA' },
  { key: 'protect_from_rain', label: 'Protect seed from heavy rain', icon: '🌂', color: '#2B449E', bg: '#E2ECFA' },
  { key: 'switch_crop', label: 'Consider a crop that needs less water', icon: '🔄', color: '#5B6764', bg: '#F7F6F2' },
];

export default function AdvisoriesPage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-2xl mx-auto py-6 px-4">
        <header>
          <h1 className="text-2xl font-bold text-[var(--ink)]">Advisories</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            4-week crop advisory for your selected block. Select a block on the map to see personalised advice.
          </p>
        </header>

        {/* Weeks 1–4 */}
        {([1, 2, 3, 4] as const).map((week) => (
          <section
            key={week}
            className="bhumi-card"
            aria-label={`Week ${week} advisory`}
          >
            <h2 className="text-base font-semibold text-[var(--ink)] mb-1">
              Week {week}
            </h2>
            <p className="text-xs text-[var(--ink-muted)] mb-4">
              Select a block to see the advisory for this week.
            </p>
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--surface-tile)' }}>
              <span className="text-sm text-[var(--ink-muted)]">No block selected — use the map to select your block.</span>
            </div>
            {/* Print button — needs a client boundary; using CSS @media print for now */}
          </section>
        ))}

        {/* Legend */}
        <section className="bhumi-card" aria-label="Verdict legend">
          <h2 className="text-sm font-semibold text-[var(--ink)] mb-3">Verdict guide</h2>
          <div className="flex flex-col gap-2">
            {VERDICTS.map((v) => (
              <div key={v.key} className="flex items-center gap-3">
                <span
                  className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full flex-shrink-0"
                  style={{ background: v.bg, color: v.color }}
                >
                  <span aria-hidden="true">{v.icon}</span>
                  {v.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
