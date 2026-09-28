'use client';

import { Suspense } from 'react';
import { NavRail } from './NavRail';
import { BottomTabs } from './BottomTabs';
import { DemoBadge } from '@/components/feedback/DemoBadge';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { I18nProvider } from '@/lib/i18n/useT';

interface AppShellProps {
  children: React.ReactNode;
  showDemoBadge?: boolean;
}

export function AppShell({ children, showDemoBadge }: AppShellProps) {
  return (
    <I18nProvider>
      {/* Skip to main content for keyboard/AT users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-[var(--ink)] focus:text-white focus:px-4 focus:py-2 focus:rounded-lg"
      >
        Skip to map
      </a>

      <div className="bhumi-page">
        <Suspense>
          <OfflineBanner />
        </Suspense>

        <div className="bhumi-shell">
          {/* Desktop rail — hidden on mobile via CSS */}
          <div className="hidden lg:flex">
            <Suspense>
              <NavRail />
            </Suspense>
          </div>

          {/* Main content */}
          <main
            id="main-content"
            className="bhumi-content"
            aria-label="BHUMI forecast dashboard"
          >
            {showDemoBadge && (
              <div className="absolute top-3 right-3 z-50">
                <DemoBadge />
              </div>
            )}
            {children}
          </main>
        </div>

        {/* Mobile/tablet bottom tabs — hidden on desktop */}
        <div className="lg:hidden">
          <Suspense>
            <BottomTabs />
          </Suspense>
        </div>
      </div>
    </I18nProvider>
  );
}
