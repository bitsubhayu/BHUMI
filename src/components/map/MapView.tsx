'use client';

import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import dynamic from 'next/dynamic';
import type {
  Map as MapLibreMap,
  MapMouseEvent,
  GeoJSONSource,
  MapGeoJSONFeature,
} from 'maplibre-gl';
import type { GeoJSON } from 'geojson';
import type { Hazard, LeadWeek, RegionFeatureProperties } from '@/lib/forecast/types';
import { RISK_COLORS, riskKey } from '@/lib/forecast/types';
import { MapSkeleton } from '@/components/feedback/Skeletons';
import { ErrorState } from '@/components/feedback/Skeletons';

export interface MapViewHandle {
  fitBounds: (bbox: [number, number, number, number]) => void;
  project: (lngLat: [number, number]) => { x: number; y: number };
}

interface MapViewProps {
  geoJSON: GeoJSON.FeatureCollection | null;
  activeHazard: Hazard;
  activeWeek: LeadWeek;
  selectedRegionId: string | null;
  onRegionClick: (id: string, centroid: [number, number]) => void;
  onMapMove?: () => void;
}

const POSITRON_URL = 'https://tiles.openfreemap.org/styles/positron';
const LIBERTY_URL = 'https://tiles.openfreemap.org/styles/liberty';
const LOAD_TIMEOUT_MS = 5000;

// Risk color step expression for MapLibre
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildColorExpression(hazard: Hazard, week: LeadWeek): any {
  const key = riskKey(hazard, week);
  const colors = RISK_COLORS[hazard];
  return [
    'step',
    ['coalesce', ['get', key], 0],
    colors[0],
    20, colors[1],
    40, colors[2],
    60, colors[3],
    80, colors[4],
  ];
}

function MapViewInner(
  { geoJSON, activeHazard, activeWeek, selectedRegionId, onRegionClick, onMapMove }: MapViewProps,
  ref: React.Ref<MapViewHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);

  // Expose imperative handle
  useImperativeHandle(ref, () => ({
    fitBounds(bbox: [number, number, number, number]) {
      mapRef.current?.fitBounds(
        [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        { padding: 40, duration: 600 },
      );
    },
    project(lngLat: [number, number]) {
      const pt = mapRef.current?.project(lngLat);
      return pt ?? { x: 0, y: 0 };
    },
  }));

  // Initialize map
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function init() {
      if (!containerRef.current) return;
      try {
        // maplibre-gl exports its classes as named exports
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const maplibregl = await import('maplibre-gl') as any;

        // Test basemap availability
        let styleUrl = POSITRON_URL;
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 3000),
          ) as Promise<Response>;
          const probe = await Promise.race([
            fetch(POSITRON_URL, { method: 'HEAD' }),
            timeoutPromise,
          ]);
          if (!probe.ok) styleUrl = LIBERTY_URL;
        } catch {
          styleUrl = LIBERTY_URL;
        }

        if (cancelled) return;

        const map = new maplibregl.Map({
          container: containerRef.current!,
          style: styleUrl,
          center: [78.9629, 20.5937], // India center
          zoom: 4.5,
          minZoom: 3,
          maxZoom: 14,
          renderWorldCopies: false,
          fadeDuration: 100,
          pitchWithRotate: false,
          dragRotate: false,
          touchPitch: false,
          pixelRatio: Math.min(window.devicePixelRatio, 2),
        });

        mapRef.current = map;

        // Fallback timeout
        timeoutId = setTimeout(() => {
          if (!ready) setFallback(true);
        }, LOAD_TIMEOUT_MS);

        map.on('load', () => {
          clearTimeout(timeoutId);
          if (cancelled) return;
          setReady(true);

          // ── Add initial layers ────────────────────────────────────
          // Background
          if (!map.getLayer('background-fallback')) {
            map.addLayer(
              { id: 'background-fallback', type: 'background', paint: { 'background-color': '#F0F4F8' } },
              map.getStyle()?.layers?.[0]?.id,
            );
          }
          // GeoJSON source
          if (!map.getSource('risk')) {
            map.addSource('risk', {
              type: 'geojson',
              data: geoJSON ?? { type: 'FeatureCollection', features: [] },
            });
          }
          // Fill layer
          if (!map.getLayer('risk-fill')) {
            map.addLayer({
              id: 'risk-fill',
              type: 'fill',
              source: 'risk',
              paint: {
                'fill-color': buildColorExpression(activeHazard, activeWeek),
                'fill-opacity': 0.75,
              },
            });
          }
          // Outline layer
          if (!map.getLayer('risk-outline')) {
            map.addLayer({
              id: 'risk-outline',
              type: 'line',
              source: 'risk',
              paint: {
                'line-color': [
                  'case',
                  ['==', ['get', 'id'], selectedRegionId ?? ''],
                  '#101413',
                  'rgba(16,20,19,0.15)',
                ],
                'line-width': [
                  'case',
                  ['==', ['get', 'id'], selectedRegionId ?? ''],
                  2,
                  0.5,
                ],
              },
            });
          }

          // Circle layer for Point / centroid-fallback features
          if (!map.getLayer('risk-circle')) {
            map.addLayer({
              id: 'risk-circle',
              type: 'circle',
              source: 'risk',
              filter: ['==', ['geometry-type'], 'Point'],
              paint: {
                'circle-color': buildColorExpression(activeHazard, activeWeek),
                'circle-radius': [
                  'case',
                  ['==', ['get', 'id'], selectedRegionId ?? ''],
                  12,
                  8,
                ],
                'circle-stroke-color': '#101413',
                'circle-stroke-width': [
                  'case',
                  ['==', ['get', 'id'], selectedRegionId ?? ''],
                  2.5,
                  1,
                ],
              },
            });
          }
        });

        map.on('error', (e: { error?: { message?: string } }) => {
          console.warn('[MapView] MapLibre error:', e.error?.message);
          // Don't surface basemap errors — risk layer renders anyway
        });

        // Move handler — throttled with RAF
        let rafId: number;
        map.on('move', () => {
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => onMapMove?.());
        });

        // Click handler
        const handleFeatureClick = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
          if (!e.features?.[0]) return;
          const props = e.features[0].properties as RegionFeatureProperties;
          const centroid: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          onRegionClick(String(props.id), centroid);
        };

        map.on('click', 'risk-fill', handleFeatureClick);
        map.on('click', 'risk-circle', handleFeatureClick);

        // Hover effect
        map.on('mouseenter', 'risk-fill', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'risk-fill', () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('mouseenter', 'risk-circle', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'risk-circle', () => {
          map.getCanvas().style.cursor = '';
        });

      } catch (err) {
        console.error('[MapView] Failed to init:', err);
        if (!cancelled) {
          setError('Map failed to initialize. Showing list view.');
          setFallback(true);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Update GeoJSON data when it changes
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const src = mapRef.current.getSource('risk') as GeoJSONSource | undefined;
    if (src && geoJSON) src.setData(geoJSON);
  }, [geoJSON, ready]);

  // Update color expression when hazard/week changes
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    if (map.getLayer('risk-fill')) {
      map.setPaintProperty(
        'risk-fill',
        'fill-color',
        buildColorExpression(activeHazard, activeWeek),
      );
    }
    if (map.getLayer('risk-circle')) {
      map.setPaintProperty(
        'risk-circle',
        'circle-color',
        buildColorExpression(activeHazard, activeWeek),
      );
    }
  }, [activeHazard, activeWeek, ready]);

  // Update selected outline
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    if (map.getLayer('risk-outline')) {
      map.setPaintProperty('risk-outline', 'line-color', [
        'case',
        ['==', ['get', 'id'], selectedRegionId ?? ''],
        '#101413',
        'rgba(16,20,19,0.15)',
      ]);
      map.setPaintProperty('risk-outline', 'line-width', [
        'case',
        ['==', ['get', 'id'], selectedRegionId ?? ''],
        2,
        0.5,
      ]);
    }
    if (map.getLayer('risk-circle')) {
      map.setPaintProperty('risk-circle', 'circle-radius', [
        'case',
        ['==', ['get', 'id'], selectedRegionId ?? ''],
        12,
        8,
      ]);
      map.setPaintProperty('risk-circle', 'circle-stroke-width', [
        'case',
        ['==', ['get', 'id'], selectedRegionId ?? ''],
        2.5,
        1,
      ]);
    }
  }, [selectedRegionId, ready]);

  if (fallback && error) {
    return (
      <div className="map-area flex items-center justify-center bg-[var(--surface-tile)]">
        <ErrorState message={error} />
      </div>
    );
  }

  return (
    <div className="map-area" style={{ position: 'relative' }}>
      {!ready && <MapSkeleton />}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          opacity: ready ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
        aria-label="India monsoon risk map"
        role="application"
      />
    </div>
  );
}

export const MapView = dynamic(
  () =>
    Promise.resolve(
      forwardRef<MapViewHandle, MapViewProps>(MapViewInner),
    ),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  },
);

