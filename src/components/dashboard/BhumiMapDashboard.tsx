'use client';

import {
  useState,
  useCallback,
  useRef,
  useTransition,
  useEffect,
} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type {
  RegionRisk,
  Advisory,
  Region,
  ForecastMeta,
  Hazard,
  LeadWeek,
  Crop,
} from '@/lib/forecast/types';
import { getRepository } from '@/lib/forecast/repository';
import type { MapViewHandle } from '@/components/map/MapView';
import { StatChips } from '@/components/map/StatChips';
import { MapLegend } from '@/components/map/MapLegend';
import { HelpFab } from '@/components/map/HelpFab';
import { LayerSwitcher } from '@/components/controls/LayerSwitcher';
import { WeekTabs } from '@/components/controls/WeekTabs';
import { FilterCascade } from '@/components/controls/FilterCascade';
import { LocationCard } from '@/components/cards/LocationCard';
import { AdvisoryCard } from '@/components/cards/AdvisoryCard';
import { GaugeCard } from '@/components/cards/GaugeCard';
import { CardSkeleton } from '@/components/feedback/Skeletons';
import { DemoBadge } from '@/components/feedback/DemoBadge';
import type { GeoJSON } from 'geojson';

const MapView = dynamic(
  () => import('@/components/map/MapView').then((m) => m.MapView),
  { ssr: false, loading: () => <div className="map-area" style={{ background: 'var(--surface-tile)' }} /> },
);

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

function parseHazard(v: string | null): Hazard {
  if (v === 'onset' || v === 'dry_spell' || v === 'heavy_rain') return v;
  return 'onset';
}
function parseWeek(v: string | null): LeadWeek {
  const n = Number(v);
  if (n >= 1 && n <= 4) return n as LeadWeek;
  return 1;
}
function parseCrop(v: string | null): Crop {
  const crops: Crop[] = ['rice', 'maize', 'cotton', 'soybean', 'groundnut', 'pulses'];
  return crops.includes(v as Crop) ? (v as Crop) : 'rice';
}

export function BhumiMapDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const mapRef = useRef<MapViewHandle>(null);
  const repo = getRepository();

  const activeHazard = parseHazard(searchParams.get('hazard'));
  const activeWeek = parseWeek(searchParams.get('week'));
  const activeCrop = parseCrop(searchParams.get('crop'));
  const selectedBlockId = searchParams.get('block');

  const [geoJSON, setGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [risk, setRisk] = useState<RegionRisk | null>(null);
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [meta, setMeta] = useState<ForecastMeta | null>(null);
  const [selectedCentroid, setSelectedCentroid] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);

  // Load GeoJSON on mount
  useEffect(() => {
    repo.getRegionsGeoJSON(null).then(setGeoJSON);
    repo.getMeta().then(setMeta);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load risk + advisory when block / week / crop changes
  useEffect(() => {
    let active = true;
    if (!selectedBlockId) {
      queueMicrotask(() => {
        if (active) { setRisk(null); setAdvisory(null); setRegion(null); }
      });
      return () => { active = false; };
    }
    queueMicrotask(() => { if (active) setLoading(true); });
    Promise.all([
      repo.getRisk(selectedBlockId),
      repo.getAdvisory(selectedBlockId, activeCrop, activeWeek),
      repo.searchRegions(selectedBlockId, 1),
    ]).then(([r, a, regions]) => {
      if (!active) return;
      setRisk(r);
      setAdvisory(a);
      setRegion(regions[0] ?? null);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBlockId, activeCrop, activeWeek]);

  const handleRegionClick = useCallback((id: string, centroid: [number, number]) => {
    setSelectedCentroid(centroid);
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('block', id);
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  }, [searchParams, router]);

  const handleBoundsChange = useCallback((bbox: [number, number, number, number]) => {
    mapRef.current?.fitBounds(bbox);
  }, []);

  const getChipPosition = useCallback(() => {
    if (!selectedCentroid || !mapRef.current) return null;
    return mapRef.current.project(selectedCentroid);
  }, [selectedCentroid]);

  const validFrom = meta?.validFrom ?? new Date().toISOString();
  const updatedAt = meta?.issuedAt ?? new Date().toISOString();

  return (
    <>
      {/* Map area */}
      <div className="map-area relative">
        {/* Map */}
        <MapView
          ref={mapRef}
          geoJSON={geoJSON}
          activeHazard={activeHazard}
          activeWeek={activeWeek}
          selectedRegionId={selectedBlockId}
          onRegionClick={handleRegionClick}
        />

        {/* Top overlay: filters */}
        <div
          className="absolute top-3 left-3 right-3 z-10 flex flex-wrap gap-2 items-start"
          id="map-top-overlay"
        >
          <FilterCascade onBoundsChange={handleBoundsChange} />
        </div>

        {/* Demo badge */}
        {USE_MOCK && (
          <div className="absolute top-3 right-3 z-20">
            <DemoBadge />
          </div>
        )}

        {/* Stat chips anchored to selected centroid */}
        {risk && selectedCentroid && (
          <StatChips
            risk={risk}
            activeHazard={activeHazard}
            activeWeek={activeWeek}
            getPosition={getChipPosition}
          />
        )}

        {/* Bottom map controls */}
        <div className="absolute bottom-3 left-3 z-10">
          <MapLegend activeHazard={activeHazard} />
        </div>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
          <LayerSwitcher activeHazard={activeHazard} />
        </div>
        <div className="absolute bottom-3 right-3 z-10">
          <HelpFab />
        </div>
      </div>

      {/* Week tabs — shown above the cards row */}
      <div className="flex-shrink-0 hidden lg:flex justify-center">
        <WeekTabs activeWeek={activeWeek} validFrom={validFrom} />
      </div>

      {/* Cards row (desktop) */}
      <div className="cards-row" aria-label="Forecast details">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <LocationCard
              region={region}
              risk={risk}
              activeWeek={activeWeek}
              updatedAt={updatedAt}
            />
            <AdvisoryCard
              advisory={advisory}
              risk={risk}
              activeHazard={activeHazard}
              crop={activeCrop}
              regionName={region?.name ?? ''}
            />
            <GaugeCard
              risk={risk}
              activeHazard={activeHazard}
              activeWeek={activeWeek}
            />
          </>
        )}
      </div>
    </>
  );
}
