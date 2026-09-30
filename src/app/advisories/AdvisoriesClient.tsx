'use client';

import { useState, useEffect, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Share2, Check, MapPin, ChevronRight, Sparkles } from 'lucide-react';
import type { Advisory, Crop, LeadWeek, Locale, Region, Verdict } from '@/lib/forecast/types';
import { VERDICT_META } from '@/lib/forecast/types';
import { getRepository } from '@/lib/forecast/repository';
import { useT, useLocale } from '@/lib/i18n/useT';

const CROPS: { id: Crop; label: string }[] = [
  { id: 'rice', label: 'Paddy / Rice' },
  { id: 'soybean', label: 'Soybean' },
  { id: 'cotton', label: 'Cotton' },
  { id: 'maize', label: 'Maize' },
  { id: 'pulses', label: 'Pulses' },
  { id: 'groundnut', label: 'Groundnut' },
];

const VERDICTS: { key: Verdict; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'sow_now', label: 'Good time to sow', icon: '🌱', color: '#3FA38E', bg: '#E3F3EE' },
  { key: 'wait', label: 'Wait a week', icon: '⏱', color: '#101413', bg: '#FBEBCB' },
  { key: 'prepare_irrigation', label: 'Prepare irrigation', icon: '💧', color: '#2B449E', bg: '#E2ECFA' },
  { key: 'protect_from_rain', label: 'Protect seed from heavy rain', icon: '🌂', color: '#2B449E', bg: '#E2ECFA' },
  { key: 'switch_crop', label: 'Consider alternative crop', icon: '🔄', color: '#5B6764', bg: '#F7F6F2' },
];

export function AdvisoriesClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const t = useT();
  const { locale } = useLocale();
  const repo = getRepository();

  const selectedBlockId = searchParams.get('block');
  const cropParam = searchParams.get('crop') as Crop | null;
  const initialCrop: Crop = CROPS.some((c) => c.id === cropParam) ? (cropParam as Crop) : 'rice';

  const [crop, setCrop] = useState<Crop>(initialCrop);
  const [region, setRegion] = useState<Region | null>(null);
  const [advisories, setAdvisories] = useState<Record<LeadWeek, Advisory | null>>({
    1: null,
    2: null,
    3: null,
    4: null,
  });
  const [loading, setLoading] = useState(false);
  const [copiedWeek, setCopiedWeek] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    if (!selectedBlockId) {
      queueMicrotask(() => {
        if (active) {
          setRegion(null);
          setAdvisories({ 1: null, 2: null, 3: null, 4: null });
        }
      });
      return;
    }

    queueMicrotask(() => {
      if (active) setLoading(true);
    });
    Promise.all([
      repo.searchRegions(selectedBlockId),
      repo.getAdvisory(selectedBlockId, crop, 1),
      repo.getAdvisory(selectedBlockId, crop, 2),
      repo.getAdvisory(selectedBlockId, crop, 3),
      repo.getAdvisory(selectedBlockId, crop, 4),
    ])
      .then(([regions, adv1, adv2, adv3, adv4]) => {
        if (!active) return;
        const matchedRegion = regions.find((r) => r.id === selectedBlockId) || regions[0] || null;
        setRegion(matchedRegion);
        setAdvisories({ 1: adv1, 2: adv2, 3: adv3, 4: adv4 });
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedBlockId, crop, repo]);

  const handleCropChange = (newCrop: Crop) => {
    setCrop(newCrop);
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('crop', newCrop);
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  const handleShare = async (week: LeadWeek, adv: Advisory | null) => {
    if (!adv) return;
    const text = adv.textByLocale[locale as Locale] ?? adv.textByLocale.en;
    const shareText = `BHUMI Advisory — ${region?.name ?? 'Block'} (Week ${week}): ${text}`;
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText, title: `BHUMI Advisory Week ${week}` });
      } catch {
        // user cancelled or share failed
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      setCopiedWeek(week);
      setTimeout(() => setCopiedWeek(null), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto py-6 px-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--ink)]">4-Week Advisories</h1>
          {region && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--surface-tile)] text-[var(--ink)]">
              <MapPin size={12} />
              {region.name}
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--ink-muted)]">
          Actionable agricultural guidance tailored for crop sowing windows and weather hazards.
        </p>
      </header>

      {/* Block selection banner if none selected */}
      {!selectedBlockId ? (
        <div className="bhumi-card p-5 border border-dashed border-[var(--line)] bg-[var(--surface-shell)] flex flex-col items-center text-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--surface-tile)] flex items-center justify-center text-[var(--ink)]">
            <MapPin size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">No Block Selected</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-sm">
              Select a block to inspect real 4-week crop advisory recommendations, or view Haveli (Pune) as a verified benchmark.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            <Link
              href="/advisories?block=4515&state=Maharashtra&district=Pune"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--ink)] text-white hover:opacity-90 transition-opacity"
            >
              <Sparkles size={14} />
              View Haveli (Pune) Advisories
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
      ) : (
        <>
          {/* Crop Selector Chips */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              Select Crop
            </label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Crop selector">
              {CROPS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleCropChange(c.id)}
                  type="button"
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    crop === c.id
                      ? 'bg-[var(--ink)] text-white shadow-sm'
                      : 'bg-[var(--surface-tile)] text-[var(--ink)] hover:bg-[var(--line)]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4 Weeks of Advisories */}
          <div className="flex flex-col gap-4">
            {([1, 2, 3, 4] as const).map((w) => {
              const adv = advisories[w];
              const meta = adv ? VERDICT_META[adv.verdict] : null;
              const text = adv ? (adv.textByLocale[locale as Locale] ?? adv.textByLocale.en) : null;

              return (
                <section
                  key={w}
                  className="bhumi-card p-4 transition-all"
                  aria-label={`Week ${w} advisory`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--surface-tile)] text-[var(--ink)]">
                        Week {w}
                      </span>
                      {adv && meta && (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: meta.bgColor, color: meta.color }}
                        >
                          {t(`verdicts.${adv.verdict}`)}
                        </span>
                      )}
                    </div>
                    {adv && (
                      <button
                        onClick={() => handleShare(w, adv)}
                        type="button"
                        className="text-xs font-medium inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--surface-tile)] text-[var(--ink)] hover:opacity-80 transition-opacity"
                        aria-label={`Share week ${w} advisory`}
                      >
                        {copiedWeek === w ? (
                          <>
                            <Check size={12} className="text-emerald-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Share2 size={12} />
                            Share
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {adv ? (
                    <div className="flex flex-col gap-2 mt-2">
                      <p className="text-sm font-semibold text-[var(--ink)] leading-snug">
                        {text}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-[var(--ink-muted)] mt-1 pt-2 border-t border-[var(--line)]">
                        <Link
                          href={`/?hazard=onset&week=${w}&block=${selectedBlockId}`}
                          className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--ink)] hover:underline"
                        >
                          View Map Layer
                          <ChevronRight size={12} />
                        </Link>
                      </div>
                    </div>
                  ) : loading ? (
                    <div className="p-4 text-xs text-[var(--ink-muted)] animate-pulse">
                      Loading advisory...
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--ink-muted)] mt-1">
                      No advisory data available for this week.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* Verdict Guide Legend */}
      <section className="bhumi-card" aria-label="Verdict legend">
        <h2 className="text-sm font-semibold text-[var(--ink)] mb-3">Verdict guide</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {VERDICTS.map((v) => (
            <div key={v.key} className="flex items-center gap-2 p-2 rounded-xl bg-[var(--surface-tile)]">
              <span
                className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium flex-shrink-0"
                style={{ background: v.bg, color: v.color }}
              >
                <span aria-hidden="true">{v.icon}</span>
              </span>
              <span className="text-xs font-medium text-[var(--ink)]">{v.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
