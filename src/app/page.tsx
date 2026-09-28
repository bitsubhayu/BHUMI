import React from 'react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/env';
import { siteConfig } from '@/config/site';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { SystemStatusBanner } from '@/components/common/SystemStatusBanner';
import { OverviewStats } from '@/components/dashboard/OverviewStats';
import { BhumiDashboardClient } from '@/components/dashboard/BhumiDashboardClient';
import { ArchitectureOverview } from '@/components/dashboard/ArchitectureOverview';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ArrowRight, Compass, ShieldCheck } from 'lucide-react';
import {
  getBlocks,
  getLivePredictions,
  getModelMetadata,
  getRecentTeleconnections,
  buildBlockGeoJSON,
  getAdvisoryRules,
} from '@/lib/data';

export const revalidate = 60;

export default async function HomePage() {
  const isConfigured = isSupabaseConfigured();

  // Fetch precomputed data server-side
  const [blocks, predictions, modelMetadata, teleconnections, advisoryRules] = await Promise.all([
    getBlocks(),
    getLivePredictions(),
    getModelMetadata(),
    getRecentTeleconnections(14),
    getAdvisoryRules(),
  ]);

  const blockGeoJSON = buildBlockGeoJSON(blocks, predictions);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Configuration detection banner */}
      <SystemStatusBanner isConfigured={isConfigured} />

      {/* Main navigation */}
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Section */}
        <section className="space-y-4 pt-2 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1 font-mono text-xs px-2.5 py-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              SIH 2026 PS {siteConfig.sih.problemStatementId}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {siteConfig.sih.ministry} / {siteConfig.sih.organization}
            </Badge>
          </div>

          <div className="space-y-2 max-w-3xl">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground">
              Hyperlocal Monsoon Onset &amp; Break Prediction System
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              {siteConfig.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="#map-view"
              className={cn(buttonVariants({ variant: 'default', size: 'default' }), 'gap-2 font-medium')}
            >
              <Compass className="h-4 w-4" />
              <span>Launch Risk Map</span>
            </Link>
            <Link
              href="#architecture"
              className={cn(buttonVariants({ variant: 'outline', size: 'default' }), 'gap-2 font-medium')}
            >
              <span>View Architecture</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* High-level system design parameters */}
        <section aria-label="System Metrics">
          <OverviewStats />
        </section>

        {/* Full Interactive Dashboard (Map, Forecast, Panchayat, Explainability) */}
        <section aria-label="Dashboard Experience">
          <BhumiDashboardClient
            initialBlocks={blocks}
            initialPredictions={predictions}
            initialGeoJSON={blockGeoJSON}
            modelMetadata={modelMetadata}
            teleconnections={teleconnections}
            initialAdvisoryRules={advisoryRules}
          />
        </section>

        {/* Production architecture breakdown */}
        <section aria-label="Technical Architecture">
          <ArchitectureOverview />
        </section>
      </main>

      <Footer />
    </div>
  );
}

