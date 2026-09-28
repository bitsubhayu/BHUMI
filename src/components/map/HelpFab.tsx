'use client';

import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';

export function HelpFab() {
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <div className="relative" id="help-fab-container">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('nav.help')}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="w-11 h-11 rounded-full flex items-center justify-center"
        style={{ background: 'var(--ink)', color: 'white', boxShadow: 'var(--shadow-float)' }}
        type="button"
        id="help-fab-btn"
      >
        <HelpCircle size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Help: how to read this map"
          aria-modal="true"
          className="absolute bottom-14 right-0 map-overlay p-4 w-72"
          id="help-fab-dialog"
        >
          <div className="flex items-start justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--ink)]">{t('help.title')}</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close help"
              className="p-0.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
              type="button"
            >
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-col gap-2 text-xs text-[var(--ink-muted)] leading-relaxed">
            <p>{t('help.colours')}</p>
            <p>{t('help.probability')}</p>
            <p className="italic">{t('help.disclaimer')}</p>
          </div>
          <Link
            href="/methodology"
            className="mt-3 block text-xs font-medium text-[var(--ink)] underline underline-offset-2"
          >
            {t('help.methodology_link')}
          </Link>
        </div>
      )}
    </div>
  );
}
