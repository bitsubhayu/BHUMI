import type { Metadata, Viewport } from 'next';
import { Urbanist, Geist_Mono, Noto_Sans_Devanagari, Noto_Sans_Bengali } from 'next/font/google';
import './globals.css';
import { siteConfig } from '@/config/site';

// Latin display font — Urbanist (geometric sans per UI brief)
const urbanist = Urbanist({
  variable: '--font-urbanist',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

// Monospace (for code/data display only)
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

// Indic fonts — loaded lazily (preload: false) and only applied when locale is active
const notoDevanagari = Noto_Sans_Devanagari({
  variable: '--font-noto-devanagari',
  subsets: ['devanagari'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
});

const notoBengali = Noto_Sans_Bengali({
  variable: '--font-noto-bengali',
  subsets: ['bengali'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: `${siteConfig.acronym}. ${siteConfig.description} (SIH 2026 PS ${siteConfig.sih.problemStatementId}, ${siteConfig.sih.ministry} / ${siteConfig.sih.organization})`,
  keywords: [
    'BHUMI',
    'Monsoon',
    'Onset Prediction',
    'Break Prediction',
    'Block Level Weather',
    'Micro-climate Intelligence',
    'NCMRWF',
    'MoES',
    'SIH 2026',
    'Agri-meteorology',
  ],
  authors: [{ name: 'BHUMI Core Team' }],
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.ico',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'BHUMI',
  },
};

export const viewport: Viewport = {
  // Teal-grey page background on desktop, shell white on mobile
  themeColor: [
    { media: '(min-width: 1024px)', color: '#9DBFC3' },
    { media: '(max-width: 1023px)', color: '#F7F6F2' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${urbanist.variable} ${geistMono.variable} ${notoDevanagari.variable} ${notoBengali.variable} h-full antialiased`}
    >
      {/* preconnect to tile server */}
      <head>
        <link rel="preconnect" href="https://tiles.openfreemap.org" />
      </head>
      <body className="min-h-dvh flex flex-col">
        {children}
      </body>
    </html>
  );
}
