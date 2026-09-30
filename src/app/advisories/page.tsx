import { Suspense } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import type { Metadata } from 'next';
import { AdvisoriesClient } from './AdvisoriesClient';

export const metadata: Metadata = {
  title: 'Advisories — BHUMI',
  description: 'Weekly crop advisories for your selected block, 1 to 4 weeks ahead.',
};

export default function AdvisoriesPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6 max-w-2xl mx-auto py-6 px-4 animate-pulse">
            <div className="h-8 bg-[var(--surface-tile)] rounded-xl w-48" />
            <div className="h-4 bg-[var(--surface-tile)] rounded-xl w-72" />
            <div className="h-32 bg-[var(--surface-tile)] rounded-2xl w-full" />
            <div className="h-32 bg-[var(--surface-tile)] rounded-2xl w-full" />
          </div>
        }
      >
        <AdvisoriesClient />
      </Suspense>
    </AppShell>
  );
}
