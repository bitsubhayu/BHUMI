'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Map, BookOpen, BarChart3, FlaskConical, Globe, HelpCircle } from 'lucide-react';
import { useT } from '@/lib/i18n/useT';

interface NavItem {
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  labelKey: string;
  id: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', icon: Map, labelKey: 'nav.map', id: 'nav-map' },
  { href: '/advisories', icon: BookOpen, labelKey: 'nav.advisories', id: 'nav-advisories' },
  { href: '/outlook', icon: BarChart3, labelKey: 'nav.outlook', id: 'nav-outlook' },
  { href: '/methodology', icon: FlaskConical, labelKey: 'nav.methodology', id: 'nav-methodology' },
];

const UTIL_ITEMS: NavItem[] = [
  { href: '/?lang=en', icon: Globe, labelKey: 'nav.language', id: 'nav-language' },
  { href: '/?help=1', icon: HelpCircle, labelKey: 'nav.help', id: 'nav-help' },
];

function preserveParams(href: string, searchParams: URLSearchParams): string {
  const url = new URL(href, 'http://x');
  const preserved = ['state', 'district', 'block', 'crop', 'hazard', 'week', 'lang'];
  preserved.forEach((k) => {
    const v = searchParams.get(k);
    if (v) url.searchParams.set(k, v);
  });
  return url.pathname + (url.search !== '?' ? url.search : '');
}

export function NavRail() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();

  return (
    <nav className="nav-rail" aria-label="Main navigation">
      {/* Logo */}
      <div className="w-10 h-10 rounded-xl bg-[var(--ink)] flex items-center justify-center mb-4" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="white" strokeWidth="1.75" />
          <path d="M10 4 C7 7 7 13 10 16 C13 13 13 7 10 4Z" fill="white" />
          <path d="M4 10 C7 7.5 13 7.5 16 10" stroke="white" strokeWidth="1.5" fill="none" />
        </svg>
      </div>

      {/* Primary nav */}
      <div className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
          const href = preserveParams(item.href, searchParams);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              id={item.id}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              aria-label={t(item.labelKey as string)}
              title={t(item.labelKey as string)}
              className="nav-rail-item"
            >
              <Icon size={20} strokeWidth={1.75} />
            </Link>
          );
        })}
      </div>

      {/* Utility items */}
      <div className="flex flex-col gap-1 pb-2">
        {UTIL_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              id={item.id}
              href={item.href}
              aria-label={t(item.labelKey as string)}
              title={t(item.labelKey as string)}
              className="nav-rail-item"
            >
              <Icon size={20} strokeWidth={1.75} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
