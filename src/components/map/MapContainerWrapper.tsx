'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import type { BlockRow } from '@/lib/supabase/types';
import type { BlockMapFeatureProperties } from '@/lib/data';
import { Compass, Loader2 } from 'lucide-react';

const DynamicRiskMap = dynamic(
  () => import('@/components/map/RiskMap').then((mod) => mod.RiskMap),
  {
    ssr: false,
    loading: () => (
      <div className="relative rounded-2xl border border-border/80 bg-muted/20 min-h-[460px] sm:min-h-[540px] flex flex-col items-center justify-center p-8 space-y-4">
        <div className="relative">
          <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center animate-pulse">
            <Compass className="h-8 w-8 text-primary" />
          </div>
          <Loader2 className="h-5 w-5 text-primary animate-spin absolute -bottom-1 -right-1" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-sm font-bold text-foreground">Loading India Monsoon Risk Map...</h3>
          <p className="text-xs text-muted-foreground font-mono">
            Initializing WebGL vector canvas &amp; administrative block boundaries
          </p>
        </div>
      </div>
    ),
  }
);

interface MapContainerWrapperProps {
  geojson: GeoJSON.FeatureCollection<GeoJSON.Geometry, BlockMapFeatureProperties> | null;
  blocks: BlockRow[];
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  isExperimentalModel?: boolean;
}

export function MapContainerWrapper(props: MapContainerWrapperProps) {
  return <DynamicRiskMap {...props} />;
}
