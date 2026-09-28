import { Suspense } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { BhumiMapDashboard } from '@/components/dashboard/BhumiMapDashboard';
import { CardSkeleton, MapSkeleton } from '@/components/feedback/Skeletons';

// ISR: refresh every 30 minutes for static shell metadata
export const revalidate = 1800;

export default function HomePage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

  return (
    <AppShell showDemoBadge={useMock}>
      <Suspense
        fallback={
          <>
            <MapSkeleton />
            <div className="cards-row">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </>
        }
      >
        <BhumiMapDashboard />
      </Suspense>
    </AppShell>
  );
}
