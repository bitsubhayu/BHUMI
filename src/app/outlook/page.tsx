import { Suspense } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import type { Metadata } from 'next';
import { OutlookClient } from './OutlookClient';

export const metadata: Metadata = {
  title: 'Outlook — BHUMI',
  description: '4-week outlook grid for all three hazards: monsoon start, dry spell, and heavy rain.',
};

export default function OutlookPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6 max-w-2xl mx-auto py-6 px-4 animate-pulse">
            <div className="h-8 bg-[var(--surface-tile)] rounded-xl w-48" />
            <div className="h-4 bg-[var(--surface-tile)] rounded-xl w-72" />
            <div className="h-48 bg-[var(--surface-tile)] rounded-2xl w-full" />
          </div>
        }
      >
        <OutlookClient />
      </Suspense>
    </AppShell>
  );
}
