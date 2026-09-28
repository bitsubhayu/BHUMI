'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useT } from '@/lib/i18n/useT';

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const t = useT();

  useEffect(() => {
    const handleOffline = () => setOffline(true);
    const handleOnline = () => setOffline(false);
    queueMicrotask(() => setOffline(!navigator.onLine));
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!offline) return null;

  const time = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[200] bg-[var(--ink)] text-white text-sm flex items-center justify-center gap-2 py-2 px-4"
    >
      <WifiOff size={14} strokeWidth={1.75} aria-hidden="true" />
      <span>{t('offline.banner', { time })}</span>
    </div>
  );
}
