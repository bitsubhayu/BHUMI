'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Map, BookOpen, BarChart3, FlaskConical } from 'lucide-react';
import { useT } from '@/lib/i18n/useT';

const TABS = [
  { href: '/', icon: Map, labelKey: 'nav.map', id: 'tab-map' },
  { href: '/advisories', icon: BookOpen, labelKey: 'nav.advisories', id: 'tab-advisories' },
  { href: '/outlook', icon: BarChart3, labelKey: 'nav.outlook', id: 'tab-outlook' },
  { href: '/methodology', icon: FlaskConical, labelKey: 'nav.methodology', id: 'tab-methodology' },
] as const;

function preserveParams(href: string, searchParams: URLSearchParams): string {
  const url = new URL(href, 'http://x');
  const preserved = ['state', 'district', 'block', 'crop', 'hazard', 'week', 'lang'];
  preserved.forEach((k) => {
    const v = searchParams.get(k);
    if (v) url.searchParams.set(k, v);
  });
  return url.pathname + (url.search !== '?' ? url.search : '');
}

export function BottomTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();

  return (
    <nav className="bottom-tabs" aria-label="Main navigation">
      {TABS.map((tab) => {
        const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        const href = preserveParams(tab.href, searchParams);
        const Icon = tab.icon;
        const label = t(tab.labelKey);
        return (
          <Link
            key={tab.id}
            id={tab.id}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className="bottom-tab-item"
          >
            <span className="bottom-tab-icon">
              <Icon size={18} strokeWidth={1.75} />
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
