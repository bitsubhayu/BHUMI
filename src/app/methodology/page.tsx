import { AppShell } from '@/components/shell/AppShell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Methodology — BHUMI',
  description: 'How BHUMI predicts monsoon onset, dry spells, and heavy rain at block and panchayat scale.',
};

const SECTIONS = [
  {
    id: 'what',
    title: 'What BHUMI predicts',
    content: `BHUMI predicts the probability of three events for each block in India, one to four weeks ahead:
    
    • Monsoon start (onset) — the chance that the seasonal monsoon reaches this block within the forecast window.
    • Dry spell (break) — the chance of a sustained pause in rainfall of 5 or more days.
    • Heavy rain — the chance of rainfall intense enough to damage standing crops or cause localised flooding.
    
    These are probabilities, not guarantees. A "72% chance" means: in 100 years with similar conditions, 72 had this outcome.`,
  },
  {
    id: 'sources',
    title: 'Where the data comes from',
    content: `Daily forecasts are built from a combination of free, publicly available data sources:
    
    • IMD gridded rainfall and temperature — the primary Indian ground-truth source.
    • ERA5 / ERA5-Land reanalysis — a global, consistent historical climate record from Copernicus.
    • CHIRPS — satellite-merged rainfall at 0.05° resolution, 1981–present.
    • NASA GPM IMERG — near-real-time satellite precipitation.
    • NOAA, BOM climate indices — ENSO (El Niño/La Niña), IOD (Indian Ocean Dipole) and MJO phase.
    • NOAA GFS / ECMWF Open Data — numerical weather prediction for the live forecast input.`,
  },
  {
    id: 'probability',
    title: 'How to read a probability',
    content: `Each percentage is a calibrated probability. Calibration means: if we say "60% chance", then across all the times we said that in the past, roughly 60% of events actually happened. Raw model outputs are calibrated using isotonic regression before being published.
    
    A higher number means higher confidence, not certainty. Always cross-check with your local agriculture office before making large sowing or marketing decisions.`,
  },
  {
    id: 'cadence',
    title: 'Update cadence',
    content: `Forecasts are updated once daily, typically by 6 AM IST. The app shows the issue time for each forecast. The next update time is shown on the dashboard.`,
  },
  {
    id: 'panchayat',
    title: 'Panchayat-scale estimates',
    content: `Block-level probabilities are the authoritative forecast. When you select a village cluster (panchayat), the app shows an estimate adjusted for local terrain characteristics — elevation and slope — to reflect that hilly terrain may receive onset earlier or later, and is more prone to heavy-rain events. These are labelled "Estimate" throughout the app and carry greater uncertainty than block-level values.`,
  },
  {
    id: 'limits',
    title: 'Limits and what is not yet measured',
    content: `[Slot reserved for backtest results once validation data is available.]
    
    All accuracy claims require validation on held-out seasons. No accuracy number has been published here until that validation is complete.
    
    BHUMI does not replace official IMD forecasts, IMD district advisories, or ICAR crop advisories. It is a supplementary probabilistic view built from public data.`,
  },
];

export default function MethodologyPage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-2xl mx-auto py-6 px-4">
        <header>
          <h1 className="text-2xl font-bold text-[var(--ink)]">Our Methodology</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            How BHUMI produces block-level monsoon probability forecasts — transparently, without jargon.
          </p>
        </header>

        {SECTIONS.map((section) => (
          <section key={section.id} id={`method-${section.id}`} className="bhumi-card">
            <h2 className="text-base font-semibold text-[var(--ink)] mb-3">{section.title}</h2>
            <div className="flex flex-col gap-2">
              {section.content.split('\n\n').map((para, i) => (
                <p key={i} className="text-sm text-[var(--ink-muted)] leading-relaxed whitespace-pre-line">
                  {para.trim()}
                </p>
              ))}
            </div>
          </section>
        ))}

        {/* Disclaimer */}
        <div
          className="p-4 rounded-xl text-sm text-[var(--ink-muted)] leading-relaxed"
          style={{ background: 'var(--surface-tile)', border: '1px solid var(--line)' }}
          role="note"
          aria-label="Disclaimer"
        >
          <strong className="text-[var(--ink)]">Disclaimer: </strong>
          These are chances, not guarantees. Check with your local agriculture office before big decisions. BHUMI is a research prototype built for Smart India Hackathon 2026.
        </div>
      </div>
    </AppShell>
  );
}
