'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type {
  BlockRow,
  LivePredictionRow,
  TeleconnectionsHistoryRow,
  LiveWeatherBufferRow,
  AdvisoryRuleRow,
} from '@/lib/supabase/types';
import type { ModelMetadata, BlockMapFeatureProperties } from '@/lib/data';
import { ModelReadinessBanner } from '@/components/dashboard/ModelReadinessBanner';
import { MapContainerWrapper } from '@/components/map/MapContainerWrapper';
import { RiskLegend } from '@/components/dashboard/RiskLegend';
import { BlockForecastCard } from '@/components/dashboard/BlockForecastCard';
import { PanchayatOutlookView } from '@/components/dashboard/PanchayatOutlookView';
import { ExplainabilityPanel } from '@/components/dashboard/ExplainabilityPanel';
import { AdvisoryShell } from '@/components/advisory/AdvisoryShell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Compass, MapPin } from 'lucide-react';

interface BhumiDashboardClientProps {
  initialBlocks: BlockRow[];
  initialPredictions: LivePredictionRow[];
  initialGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Geometry, BlockMapFeatureProperties>;
  modelMetadata: ModelMetadata;
  teleconnections: TeleconnectionsHistoryRow[];
  initialAdvisoryRules?: AdvisoryRuleRow[];
}

export function BhumiDashboardClient({
  initialBlocks,
  initialPredictions,
  initialGeoJSON,
  modelMetadata,
  teleconnections,
  initialAdvisoryRules,
}: BhumiDashboardClientProps) {
  // Default to first block if available
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    initialBlocks.length > 0 ? initialBlocks[0].block_id : null
  );
  const [selectedWeek, setSelectedWeek] = useState<'week_1' | 'week_2' | 'week_3' | 'week_4'>('week_1');
  const [recentObservations, setRecentObservations] = useState<LiveWeatherBufferRow[]>([]);

  // Selected block entity
  const selectedBlock = useMemo(() => {
    return initialBlocks.find((b) => b.block_id === selectedBlockId) || null;
  }, [initialBlocks, selectedBlockId]);

  // Selected block predictions
  const blockPredictions = useMemo(() => {
    if (!selectedBlockId) return [];
    return initialPredictions.filter((p) => p.block_id === selectedBlockId);
  }, [initialPredictions, selectedBlockId]);

  // Prediction for active week
  const activeWeekPrediction = useMemo(() => {
    return blockPredictions.find((p) => p.lead_time_bucket === selectedWeek) || null;
  }, [blockPredictions, selectedWeek]);

  // Fetch observations when selected block changes
  useEffect(() => {
    if (!selectedBlockId) return;

    let isMounted = true;

    fetch(`/api/observations?block_id=${encodeURIComponent(selectedBlockId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (data.success && Array.isArray(data.records)) {
            setRecentObservations(data.records);
          } else {
            setRecentObservations([]);
          }
        }
      })
      .catch((err) => {
        console.warn('Could not load recent observations:', err);
        if (isMounted) {
          setRecentObservations([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedBlockId]);

  // Last sync timestamp from predictions or current date
  const lastSyncTime =
    initialPredictions.length > 0 ? initialPredictions[0].prediction_date : modelMetadata.trainedAt;

  return (
    <div className="space-y-6">
      {/* Authoritative Model Readiness Notice & Freshness */}
      <ModelReadinessBanner metadata={modelMetadata} lastSyncTime={lastSyncTime} />

      {/* Main Map Visualization Section */}
      <section aria-label="Interactive India Block Map" className="space-y-3">
        <MapContainerWrapper
          geojson={initialGeoJSON}
          blocks={initialBlocks}
          selectedBlockId={selectedBlockId}
          onSelectBlock={(bId) => setSelectedBlockId(bId)}
          isExperimentalModel={!modelMetadata.isProductionReady}
        />
        <RiskLegend />
      </section>

      {/* Quick Block Selector Pills (Touch-Friendly for Mobile) */}
      {initialBlocks.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
          <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Quick Select Block:
          </span>
          {initialBlocks.map((b) => (
            <button
              key={b.block_id}
              type="button"
              onClick={() => setSelectedBlockId(b.block_id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all whitespace-nowrap font-medium ${
                selectedBlockId === b.block_id
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs font-semibold'
                  : 'bg-muted/40 hover:bg-muted text-foreground border-border/60'
              }`}
            >
              {b.block_name} ({b.district_name})
            </button>
          ))}
        </div>
      )}

      {/* Forecast Details & Downscaled Panchayat View */}
      <section aria-label="Block Forecast and Downscaling" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Block Forecast (Week 1–4, Risk, Drivers) */}
        <div className="lg:col-span-7 space-y-6">
          <BlockForecastCard
            block={selectedBlock}
            predictions={blockPredictions}
            isModelProductionReady={modelMetadata.isProductionReady}
            selectedWeek={selectedWeek}
            onSelectWeek={(wk) => setSelectedWeek(wk)}
          />

          {/* Panchayat View directly beneath the block forecast */}
          <PanchayatOutlookView block={selectedBlock} prediction={activeWeekPrediction} />
        </div>

        {/* Right Column: Physical Teleconnections & Explainability */}
        <div className="lg:col-span-5 space-y-6">
          <ExplainabilityPanel
            prediction={activeWeekPrediction}
            teleconnections={teleconnections}
            recentObservations={recentObservations}
          />

          {/* Agro-Climatic Zone & Elevation Summary Card */}
          {selectedBlock && (
            <Card className="border-border/70 shadow-sm bg-card/60 backdrop-blur-xs">
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Compass className="h-3.5 w-3.5 text-primary" />
                    Block Environmental Context
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    LGD: {selectedBlock.block_id}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground font-mono">
                  <div className="p-2 rounded bg-muted/30">
                    <span className="text-[10px] block">Zone</span>
                    <span className="font-semibold text-foreground">
                      {selectedBlock.agro_climatic_zone || 'N/A'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-muted/30">
                    <span className="text-[10px] block">Mean Elevation</span>
                    <span className="font-semibold text-foreground">
                      {selectedBlock.elevation_m ? `${selectedBlock.elevation_m} m` : 'N/A'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-muted/30">
                    <span className="text-[10px] block">Mean Slope</span>
                    <span className="font-semibold text-foreground">
                      {selectedBlock.slope_deg ? `${selectedBlock.slope_deg}°` : 'N/A'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-muted/30">
                    <span className="text-[10px] block">Coast Distance</span>
                    <span className="font-semibold text-foreground">
                      {selectedBlock.distance_to_coast_km ? `${selectedBlock.distance_to_coast_km} km` : 'N/A'}
                    </span>
                  </div>
                </div>
                <p className="text-[10.5px] text-muted-foreground leading-tight pt-1">
                  Static topographical features sourced from SRTM DEM raster and Survey of India administrative boundaries.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* ICAR / KVK Multilingual Crop Advisory Section */}
      <section aria-label="Agronomic Crop Advisory">
        <AdvisoryShell
          prediction={activeWeekPrediction}
          block={selectedBlock}
          isModelProductionReady={modelMetadata.isProductionReady}
          advisoryRules={initialAdvisoryRules}
          selectedWeek={selectedWeek}
        />
      </section>
    </div>
  );
}
