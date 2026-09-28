'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import type { Hazard } from '@/lib/forecast/types';
import { useT } from '@/lib/i18n/useT';

interface LayerSwitcherProps {
  activeHazard: Hazard;
}

const HAZARDS: { key: Hazard; labelKey: string }[] = [
  { key: 'onset', labelKey: 'hazards.onset' },
  { key: 'dry_spell', labelKey: 'hazards.dry_spell' },
  { key: 'heavy_rain', labelKey: 'hazards.heavy_rain' },
];

export function LayerSwitcher({ activeHazard }: LayerSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const t = useT();

  const setHazard = useCallback((hazard: Hazard) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('hazard', hazard);
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  }, [router, searchParams]);

  return (
    <div
      className="layer-switcher"
      role="group"
      aria-label="Select forecast type"
      id="layer-switcher"
    >
      {HAZARDS.map(({ key, labelKey }) => (
        <button
          key={key}
          onClick={() => setHazard(key)}
          aria-pressed={activeHazard === key}
          className={`layer-btn${activeHazard === key ? ' active' : ''}`}
          type="button"
          id={`layer-btn-${key}`}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}
