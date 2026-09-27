import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { siteConfig } from '@/config/site';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
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
    'ICAR',
  ],
  authors: [{ name: 'BHUMI Core Team' }],
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
