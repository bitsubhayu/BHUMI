'use client';

import { useT } from '@/lib/i18n/useT';

export function DemoBadge() {
  const t = useT();
  return (
    <span className="demo-badge" role="status" aria-label={t('demo.badge')}>
      {t('demo.badge')}
    </span>
  );
}
