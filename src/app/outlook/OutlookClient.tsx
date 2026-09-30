'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MapPin, ChevronRight, Sparkles, Activity } from 'lucide-react';
import type { Hazard, LeadWeek, Region, RegionRisk } from '@/lib/forecast/types';
import { getRepository } from '@/lib/forecast/repository';

const HAZARDS: { key: Hazard; label: string; desc: string }[] = [
  { key: 'onset', label: 'Monsoon start', desc: 'Probability of active monsoon precipitation onset' },
  { key: 'dry_spell', label: 'Dry spell', desc: 'Probability of 7+ consecutive days with <2.5mm rain' },
  { key: 'heavy_rain', label: 'Heavy rain', desc: 'Probability of extreme precipitation event (>65mm/day)' },
];

function getRiskBandColor(hazard: Hazard, prob: number): { bg: string; text: string; label: string } {
  if (prob >= 80) {
    if (hazard === 'onset') return { bg: '#13755F', text: '#FFFFFF', label: 'Very High' };
    if (hazard === 'dry_spell') return { bg: '#B0451C', text: '#FFFFFF', label: 'Very High' };
    return { bg: '#2B449E', text: '#FFFFFF', label: 'Very High' };
  }
  if (prob >= 60) {
    if (hazard === 'onset') return { bg: '#3FA38E', text: '#FFFFFF', label: 'High' };
    if (hazard === 'dry_spell') return { bg: '#D9762B', text: '#FFFFFF', label: 'High' };
    return { bg: '#4A73CC', text: '#FFFFFF', label: 'High' };
  }
  if (prob >= 40) {
    if (hazard === 'onset') return { bg: '#7CC4B0', text: '#101413', label: 'Moderate' };
    if (hazard === 'dry_spell') return { bg: '#EDA84A', text: '#101413', label: 'Moderate' };
    return { bg: '#7DA4E4', text: '#101413', label: 'Moderate' };
  }
  if (prob >= 20) {
    if (hazard === 'onset') return { bg: '#B7DFD2', text: '#101413', label: 'Low-Mod' };
    if (hazard === 'dry_spell') return { bg: '#F6CF8A', text: '#101413', label: 'Low-Mod' };
    return { bg: '#B5CDF1', text: '#101413', label: 'Low-Mod' };
  }
  if (hazard === 'onset') return { bg: '#E3F3EE', text: '#101413', label: 'Low' };
  if (hazard === 'dry_spell') return { bg: '#FBEBCB', text: '#101413', label: 'Low' };
  return { bg: '#E2ECFA', text: '#101413', label: 'Low' };
}

export function OutlookClient() {
  const searchParams = useSearchParams();
  const repo = getRepository();
  const selectedBlockId = searchParams.get('block');

  const [region, setRegion] = useState<Region | null>(null);
  const [risk, setRisk] = useState<RegionRisk | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!selectedBlockId) {
      queueMicrotask(() => {
        if (active) {
          setRegion(null);
          setRisk(null);
        }
      });
      return;
    }

    queueMicrotask(() => {
      if (active) setLoading(true);
    });
    Promise.all([
      repo.searchRegions(selectedBlockId),
      repo.getRisk(selectedBlockId),
    ])
      .then(([regions, riskData]) => {
        if (!active) return;
        const matchedRegion = regions.find((r) => r.id === selectedBlockId) || regions[0] || null;
        setRegion(matchedRegion);
        setRisk(riskData);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedBlockId, repo]);

  const activeDriver = risk?.drivers?.onset?.[0] || risk?.drivers?.dry_spell?.[0];

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto py-6 px-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--ink)]">4-Week Risk Outlook</h1>
          {region && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--surface-tile)] text-[var(--ink)]">
              <MapPin size={12} />
              {region.name}
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--ink-muted)]">
          Probabilistic risk forecast across 3 core subseasonal agricultural hazards over 1 to 4 lead weeks.
        </p>
      </header>

      {/* Block selection banner if none selected */}
      {!selectedBlockId ? (
        <div className="bhumi-card p-5 border border-dashed border-[var(--line)] bg-[var(--surface-shell)] flex flex-col items-center text-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-tile)] flex items-center justify-center text-[var(--ink)]">
            <Activity size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">No Block Selected</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-sm">
              Select a block to inspect real 4-week hazard probabilities, or view Haveli (Pune) as a verified benchmark.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            <Link
              href="/outlook?block=4515&state=Maharashtra&district=Pune"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--ink)] text-white hover:opacity-90 transition-opacity"
            >
              <Sparkles size={14} />
              View Haveli (Pune) Outlook
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-tile)] text-[var(--ink)] hover:opacity-80 transition-opacity"
            >
              Pick from Map
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      ) : loading ? (
        <div className="bhumi-card p-6 text-center text-xs text-[var(--ink-muted)] animate-pulse">
          Loading 4-week hazard risks...
        </div>
      ) : (
        <>
          {/* Block Metadata Card */}
          <div className="bhumi-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                  Active Location
                </span>
                <h2 className="text-lg font-bold text-[var(--ink)]">{region?.name ?? selectedBlockId}</h2>
              </div>
              {risk && (
                <div className="text-right">
                  <span className="text-xs text-[var(--ink-muted)] block">Model Reliability</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--surface-tile)] text-[var(--ink)] capitalize">
                    {risk.reliability}
                  </span>
                </div>
              )}
            </div>

            {activeDriver && (
              <div className="mt-2 p-2.5 rounded-xl bg-[var(--surface-tile)] text-xs text-[var(--ink-muted)]">
                <span className="font-semibold text-[var(--ink)]">Primary Signal: </span>
                {activeDriver.labelByLocale.en} ({activeDriver.effect === 'raises' ? 'elevating' : 'moderating'} risk)
              </div>
            )}
          </div>

          {/* 3 Hazards × 4 Weeks Grid */}
          <div className="bhumi-card overflow-x-auto p-4">
            <table className="w-full text-sm border-collapse" aria-label="4-week outlook by hazard">
              <thead>
                <tr>
                  <th scope="col" className="text-left py-2 pr-4 text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                    Hazard
                  </th>
                  {[1, 2, 3, 4].map((w) => (
                    <th key={w} scope="col" className="py-2 px-2 text-center text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                      Week {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HAZARDS.map((h) => (
                  <tr key={h.key} className="border-t border-[var(--line)]">
                    <td className="py-3 pr-4 text-sm font-medium text-[var(--ink)] whitespace-nowrap">
                      <div>
                        <span>{h.label}</span>
                        <span className="block text-[10px] text-[var(--ink-muted)] font-normal">{h.desc}</span>
                      </div>
                    </td>
                    {([1, 2, 3, 4] as const).map((w: LeadWeek) => {
                      const prob = risk?.probabilities?.[h.key]?.[w];
                      const hasData = typeof prob === 'number';
                      const band = hasData ? getRiskBandColor(h.key, prob) : null;

                      return (
                        <td key={w} className="py-2 px-1 text-center align-middle">
                          <Link
                            href={`/?hazard=${h.key}&week=${w}&block=${selectedBlockId}`}
                            className="inline-flex flex-col items-center justify-center rounded-xl p-2 min-w-[64px] transition-all hover:scale-105"
                            style={{
                              background: band ? band.bg : 'var(--surface-tile)',
                              color: band ? band.text : 'var(--ink-muted)',
                            }}
                            title={`Jump to ${h.label} Week ${w} Map Layer`}
                          >
                            <span className="text-sm font-bold">
                              {hasData ? `${prob}%` : '—'}
                            </span>
                            <span className="text-[10px] opacity-90 font-medium">
                              {hasData ? band?.label : 'No data'}
                            </span>
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between text-xs text-[var(--ink-muted)] mt-4 pt-3 border-t border-[var(--line)]">
              <span>Tap any cell to jump to that hazard & week map layer.</span>
              <Link href="/" className="font-semibold text-[var(--ink)] hover:underline inline-flex items-center gap-1">
                Return to Map <ChevronRight size={12} />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
