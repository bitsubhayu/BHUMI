/**
 * BHUMI i18n — minimal useT hook
 * Messages are loaded dynamically by locale. Only the active locale's JSON is loaded.
 * Adding a new locale = one JSON file + one font entry in layout.tsx.
 *
 * Usage:
 *   const t = useT();
 *   t('hazards.onset')            → "Monsoon start"
 *   t('cards.gauge.week_label', { n: '2' }) → "Week 2"
 */

'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import type en from './messages/en.json';

export type Locale = 'en' | 'hi' | 'bn';
export type Messages = typeof en;

// Dot-notation key type for type-safe translation keys
type PathsToStringProps<T> = T extends string
  ? []
  : {
      [K in Extract<keyof T, string>]: [K, ...PathsToStringProps<T[K]>];
    }[Extract<keyof T, string>];
type Join<T extends string[], D extends string> = T extends []
  ? never
  : T extends [infer F]
  ? F
  : T extends [infer F, ...infer R]
  ? F extends string
    ? R extends string[]
      ? `${F}${D}${Join<R, D>}`
      : never
    : never
  : string;
export type TranslationKey = Join<PathsToStringProps<Messages>, '.'>;

// Context
interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  messages: Record<string, unknown> | null;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  messages: null,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [messages, setMessages] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    // Read from cookie or URL param on mount — deferred to avoid cascade
    queueMicrotask(() => {
      const cookieLocale = document.cookie
        .split('; ')
        .find((r) => r.startsWith('bhumi_lang='))
        ?.split('=')[1] as Locale | undefined;
      if (cookieLocale && ['en', 'hi', 'bn'].includes(cookieLocale)) {
        setLocaleState(cookieLocale);
      }
    });
  }, []);

  useEffect(() => {
    async function loadMessages() {
      const mod = await import(`./messages/${locale}.json`);
      setMessages(mod.default);
      document.documentElement.lang = locale;
    }
    loadMessages();
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.cookie = `bhumi_lang=${l}; path=/; max-age=31536000; SameSite=Lax`;
    // Update URL without full reload
    const url = new URL(window.location.href);
    url.searchParams.set('lang', l);
    window.history.replaceState({}, '', url);
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale, messages }}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * Returns a translation function for the active locale.
 * Interpolates {key} placeholders with values.
 */
export function useT() {
  const { messages } = useContext(I18nContext);

  return useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      if (!messages) return key;
      const parts = key.split('.');
      let cur: unknown = messages;
      for (const part of parts) {
        if (cur == null || typeof cur !== 'object') return key;
        cur = (cur as Record<string, unknown>)[part];
      }
      if (typeof cur !== 'string') return key;
      if (!vars) return cur;
      return cur.replace(/{(\w+)}/g, (_, k) => String(vars[k] ?? `{${k}}`));
    },
    [messages],
  );
}

export function useLocale() {
  return useContext(I18nContext);
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  hi: 'हिन्दी',
  bn: 'বাংলা',
};
