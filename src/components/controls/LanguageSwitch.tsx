'use client';

import { Globe } from 'lucide-react';
import { useState } from 'react';
import { useLocale, LOCALE_LABELS, type Locale } from '@/lib/i18n/useT';
import { useT } from '@/lib/i18n/useT';

export function LanguageSwitch() {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const t = useT();

  const locales: Locale[] = ['en', 'hi', 'bn'];

  return (
    <div className="relative" id="language-switch-container">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('nav.language')}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="nav-rail-item"
        type="button"
        id="language-switch-btn"
      >
        <Globe size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select language"
          className="absolute bottom-0 left-full ml-2 map-overlay py-1 min-w-[140px] z-50"
          id="language-menu"
        >
          {locales.map((l) => (
            <button
              key={l}
              role="option"
              aria-selected={locale === l}
              onClick={() => { setLocale(l); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-tile)] text-[var(--ink)] flex items-center gap-2 ${locale === l ? 'font-semibold' : ''}`}
              type="button"
              lang={l}
            >
              {locale === l && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--ink)] flex-shrink-0" aria-hidden="true" />
              )}
              {!( locale === l) && (
                <span className="w-1.5 h-1.5 flex-shrink-0" aria-hidden="true" />
              )}
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
