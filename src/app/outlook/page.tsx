import { AppShell } from '@/components/shell/AppShell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Outlook — BHUMI',
  description: '4-week outlook grid for all three hazards: monsoon start, dry spell, and heavy rain.',
};

const HAZARDS = [
  { key: 'onset', label: 'Monsoon start' },
  { key: 'dry_spell', label: 'Dry spell' },
  { key: 'heavy_rain', label: 'Heavy rain' },
] as const;

export default function OutlookPage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-2xl mx-auto py-6 px-4">
        <header>
          <h1 className="text-2xl font-bold text-[var(--ink)]">4-Week Outlook</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Select a block on the map to see probabilities by hazard and week. Tap a cell to jump to that view.
          </p>
        </header>

        {/* Outlook grid: 3 hazards × 4 weeks */}
        <div className="bhumi-card overflow-x-auto">
          <table
            className="w-full text-sm border-collapse"
            aria-label="4-week outlook by hazard"
          >
            <thead>
              <tr>
                <th
                  scope="col"
                  className="text-left py-2 pr-4 text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide"
                >
                  Hazard
                </th>
                {[1, 2, 3, 4].map((w) => (
                  <th
                    key={w}
                    scope="col"
                    className="py-2 px-3 text-center text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide"
                  >
                    Week {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HAZARDS.map((h) => (
                <tr key={h.key} className="border-t border-[var(--line)]">
                  <td className="py-3 pr-4 text-sm font-medium text-[var(--ink)] whitespace-nowrap">
                    {h.label}
                  </td>
                  {[1, 2, 3, 4].map((w) => (
                    <td key={w} className="py-2 px-1 text-center">
                      <a
                        href={`/?hazard=${h.key}&week=${w}`}
                        className="inline-flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-xs font-medium w-full min-w-[60px] transition-opacity hover:opacity-80"
                        style={{ background: 'var(--surface-tile)', color: 'var(--ink-muted)' }}
                        aria-label={`Go to ${h.label} week ${w} forecast`}
                      >
                        <span className="text-[var(--ink-muted)]">—</span>
                        <span className="text-[10px]">No data</span>
                      </a>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-[var(--ink-muted)] mt-3">
            Select a block on the map to populate this table with forecast values.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
