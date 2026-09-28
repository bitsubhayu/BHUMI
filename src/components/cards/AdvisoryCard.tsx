'use client';

import { useState } from 'react';
import { Share2, ChevronRight } from 'lucide-react';
import type { Advisory, Crop, Locale, Verdict } from '@/lib/forecast/types';
import { VERDICT_META } from '@/lib/forecast/types';
import { useT, useLocale } from '@/lib/i18n/useT';
import { DriversSheet } from './DriversSheet';
import type { RegionRisk, Hazard } from '@/lib/forecast/types';

interface AdvisoryCardProps {
  advisory: Advisory | null;
  risk: RegionRisk | null;
  activeHazard: Hazard;
  crop: Crop;
  regionName: string;
}

// Inline SVG illustration — no external assets
function AdvisoryIllustration({ verdict }: { verdict: Verdict }) {
  const illustrations: Record<Verdict, React.ReactNode> = {
    sow_now: (
      <svg viewBox="0 0 80 60" fill="none" aria-hidden="true">
        <circle cx="40" cy="45" r="12" fill="#E3F3EE" />
        <path d="M40 20 L40 38 M34 26 L40 20 L46 26" stroke="#3FA38E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="25" cy="18" r="6" fill="#F2A91F" opacity="0.7" />
        <path d="M25 10 L25 7 M17 14 L15 12 M33 14 L35 12" stroke="#F2A91F" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    wait: (
      <svg viewBox="0 0 80 60" fill="none" aria-hidden="true">
        <circle cx="40" cy="30" r="18" fill="#FBEBCB" />
        <circle cx="40" cy="30" r="14" stroke="#D9762B" strokeWidth="1.5" />
        <path d="M40 20 L40 31 L47 38" stroke="#D9762B" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    prepare_irrigation: (
      <svg viewBox="0 0 80 60" fill="none" aria-hidden="true">
        <path d="M30 40 Q40 15 50 40" fill="#E2ECFA" stroke="#4A73CC" strokeWidth="1.5" />
        <path d="M35 40 Q40 22 45 40" fill="#B5CDF1" />
        <circle cx="40" cy="44" r="3" fill="#4A73CC" />
      </svg>
    ),
    protect_from_rain: (
      <svg viewBox="0 0 80 60" fill="none" aria-hidden="true">
        <path d="M20 35 Q40 10 60 35 Z" fill="#E2ECFA" stroke="#2B449E" strokeWidth="1.5" />
        <path d="M40 35 L40 50" stroke="#2B449E" strokeWidth="2" strokeLinecap="round" />
        <path d="M36 50 Q40 54 44 50" stroke="#2B449E" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <circle cx="30" cy="42" r="1.5" fill="#7DA4E4" />
        <circle cx="38" cy="47" r="1.5" fill="#7DA4E4" />
        <circle cx="50" cy="43" r="1.5" fill="#7DA4E4" />
      </svg>
    ),
    switch_crop: (
      <svg viewBox="0 0 80 60" fill="none" aria-hidden="true">
        <path d="M25 40 L35 30 M35 30 L25 20 M55 20 L45 30 M45 30 L55 40" stroke="#5B6764" strokeWidth="2" strokeLinecap="round" />
        <path d="M35 30 L45 30" stroke="#5B6764" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  };
  return (
    <div className="w-20 h-14 flex-shrink-0">
      {illustrations[verdict]}
    </div>
  );
}

export function AdvisoryCard({ advisory, risk, activeHazard, crop, regionName }: AdvisoryCardProps) {
  const [driversOpen, setDriversOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = useT();
  const { locale } = useLocale();

  if (!advisory) {
    return (
      <div className="bhumi-card flex items-center justify-center" id="advisory-card">
        <p className="text-sm text-[var(--ink-muted)]">{t('select_region')}</p>
      </div>
    );
  }

  const meta = VERDICT_META[advisory.verdict];
  const verdictLabel = t(`verdicts.${advisory.verdict}`);
  const advisoryText = advisory.textByLocale[locale as Locale] ?? advisory.textByLocale.en;

  async function handleShare() {
    const text = t('share.text', { block: regionName, advice: advisoryText });
    if (navigator.share) {
      await navigator.share({ text, title: 'BHUMI Forecast Advisory' });
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="bhumi-card" id="advisory-card">
      <div className="flex items-start justify-between mb-3">
        {/* Verdict badge */}
        <span
          className="verdict-badge"
          style={{ background: meta.bgColor, color: meta.color }}
          aria-label={`Advisory verdict: ${verdictLabel}`}
        >
          <span aria-hidden="true">{meta.icon}</span>
          {verdictLabel}
        </span>
        {/* Illustration */}
        <AdvisoryIllustration verdict={advisory.verdict} />
      </div>

      {/* Advisory text */}
      <p
        className="text-sm text-[var(--ink)] leading-relaxed flex-1"
        aria-live="polite"
        style={{ WebkitLineClamp: 4, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {advisoryText}
      </p>

      {/* Crop chip */}
      <div className="mt-2">
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-[var(--surface-tile)] text-[var(--ink-muted)]">
          {t(`crops.${crop}`)}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--line)]">
        <button
          onClick={() => setDriversOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
          type="button"
          aria-haspopup="dialog"
          id="why-this-advice-btn"
        >
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
          {t('cards.advisory.why')}
        </button>
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors ml-auto"
          type="button"
          aria-label={t('cards.advisory.share')}
          id="share-advisory-btn"
        >
          {copied ? (
            <span className="text-[#3FA38E]">{t('share.copied')}</span>
          ) : (
            <>
              <Share2 size={14} strokeWidth={1.75} aria-hidden="true" />
              {t('cards.advisory.share')}
            </>
          )}
        </button>
      </div>

      {/* Drivers sheet */}
      {driversOpen && risk && (
        <DriversSheet
          risk={risk}
          activeHazard={activeHazard}
          onClose={() => setDriversOpen(false)}
        />
      )}
    </div>
  );
}
