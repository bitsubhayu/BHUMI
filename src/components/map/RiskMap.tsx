'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { Layers, ZoomIn, ZoomOut, Compass, Search, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { BlockRow } from '@/lib/supabase/types';
import type { BlockMapFeatureProperties } from '@/lib/data';
import { RISK_LEVELS } from '@/lib/risk';

export type LeadBucket = 'week_1' | 'week_2' | 'week_3' | 'week_4';
export type RiskMetric = 'break' | 'onset' | 'heavy';

interface RiskMapProps {
  geojson: GeoJSON.FeatureCollection<GeoJSON.Geometry, BlockMapFeatureProperties> | null;
  blocks: BlockRow[];
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  isExperimentalModel?: boolean;
}

const BUCKETS: { id: LeadBucket; label: string; sub: string }[] = [
  { id: 'week_1', label: 'Week 1', sub: 'Days 1–7' },
  { id: 'week_2', label: 'Week 2', sub: 'Days 8–14' },
  { id: 'week_3', label: 'Week 3', sub: 'Days 15–21' },
  { id: 'week_4', label: 'Week 4', sub: 'Days 22–28' },
];

const METRICS: { id: RiskMetric; label: string; tooltip: string }[] = [
  { id: 'break', label: 'Break Risk', tooltip: 'Probability of dry spell / monsoon hiatus' },
  { id: 'onset', label: 'Onset Probability', tooltip: 'Probability of monsoon onset transition' },
  { id: 'heavy', label: 'Heavy-Rain Risk', tooltip: 'Probability of extreme precipitation event' },
];

export function RiskMap({
  geojson,
  blocks,
  selectedBlockId,
  onSelectBlock,
  isExperimentalModel = true,
}: RiskMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const [activeBucket, setActiveBucket] = useState<LeadBucket>('week_1');
  const [activeMetric, setActiveMetric] = useState<RiskMetric>('break');
  const [searchQuery, setSearchQuery] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);

  // Property name in geojson features corresponding to active selection
  const activePropertyKey = `${activeBucket}_${activeMetric}`;

  // Build MapLibre color expression based on the 5-level risk thresholds with neutral slate for uncovered blocks
  const getColorExpression = useCallback(
    (propKey: string): maplibregl.ExpressionSpecification => {
      return [
        'case',
        ['==', ['get', 'is_data_available'], false],
        '#94a3b8', // Neutral slate for blocks with insufficient historical data
        [
          'step',
          ['coalesce', ['get', propKey], 0],
          RISK_LEVELS.low.hexColor,      // < 20%
          20,
          RISK_LEVELS.moderate.hexColor, // 20 - 39%
          40,
          RISK_LEVELS.elevated.hexColor, // 40 - 59%
          60,
          RISK_LEVELS.high.hexColor,     // 60 - 79%
          80,
          RISK_LEVELS.very_high.hexColor // >= 80%
        ]
      ];
    },
    []
  );

  // Initialize MapLibre GL
  useEffect(() => {
    if (typeof maplibregl.setWorkerUrl === 'function') {
      maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
    }
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'carto-voyager': {
            type: 'raster',
            tiles: [
              'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [
          {
            id: 'carto-basemap',
            type: 'raster',
            source: 'carto-voyager',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [79.0, 22.5], // Center of India
      zoom: 4.3,
      minZoom: 3.5,
      maxZoom: 12,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update GeoJSON source & layers when map is ready or data updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !geojson) return;

    const source = map.getSource('blocks-source') as maplibregl.GeoJSONSource;

    if (!source) {
      // Add GeoJSON source
      map.addSource('blocks-source', {
        type: 'geojson',
        data: geojson,
      });

      // Layer 1: Fill layer for Polygons/MultiPolygons with dynamic risk color
      map.addLayer({
        id: 'blocks-fill',
        type: 'fill',
        source: 'blocks-source',
        filter: ['any', ['==', '$type', 'Polygon'], ['==', '$type', 'MultiPolygon']],
        paint: {
          'fill-color': getColorExpression(activePropertyKey),
          'fill-opacity': 0.72,
        },
      });

      // Layer 2: Subtle outline for Polygons
      map.addLayer({
        id: 'blocks-outline',
        type: 'line',
        source: 'blocks-source',
        filter: ['any', ['==', '$type', 'Polygon'], ['==', '$type', 'MultiPolygon']],
        paint: {
          'line-color': '#0f172a',
          'line-width': 1.2,
          'line-opacity': 0.65,
        },
      });

      // Layer 3: Selected block highlight for Polygons
      map.addLayer({
        id: 'blocks-selected',
        type: 'line',
        source: 'blocks-source',
        filter: [
          'all',
          ['any', ['==', '$type', 'Polygon'], ['==', '$type', 'MultiPolygon']],
          ['==', ['get', 'block_id'], selectedBlockId || ''],
        ],
        paint: {
          'line-color': '#4f46e5', // Deep indigo
          'line-width': 3.5,
          'line-opacity': 1.0,
        },
      });

      // Layer 4: Circle markers for fallback Centroid Points (when boundary_geom is not yet stored)
      map.addLayer({
        id: 'blocks-point',
        type: 'circle',
        source: 'blocks-source',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-color': getColorExpression(activePropertyKey),
          'circle-radius': 9,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
      });

      // Layer 5: Selected block highlight for Points
      map.addLayer({
        id: 'blocks-point-selected',
        type: 'circle',
        source: 'blocks-source',
        filter: [
          'all',
          ['==', '$type', 'Point'],
          ['==', ['get', 'block_id'], selectedBlockId || ''],
        ],
        paint: {
          'circle-color': '#4f46e5',
          'circle-radius': 13,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 1.0,
        },
      });

      // Layer 6: Text label for block names
      map.addLayer({
        id: 'blocks-labels',
        type: 'symbol',
        source: 'blocks-source',
        minzoom: 5.5,
        layout: {
          'text-field': ['get', 'block_name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 11,
          'text-offset': [
            'case',
            ['==', '$type', 'Point'],
            ['literal', [0, 1.4]],
            ['literal', [0, 0]],
          ],
          'text-anchor': 'center',
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });

      // Interactions: Hover Tooltip
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
      });
      popupRef.current = popup;

      const handleMouseMove = (e: maplibregl.MapLayerMouseEvent) => {
        if (!e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = 'pointer';

        const feature = e.features[0];
        const props = feature.properties as BlockMapFeatureProperties;
        const coordinates = e.lngLat;

        const isUnavailable = props.is_data_available === false;
        const val = props[activePropertyKey as keyof BlockMapFeatureProperties];
        const valText = isUnavailable
          ? 'Data Insufficient'
          : typeof val === 'number'
            ? `${Math.round(val * 10) / 10}%`
            : 'N/A';
        const metricName =
          activeMetric === 'break'
            ? 'Break Risk'
            : activeMetric === 'onset'
              ? 'Onset Prob'
              : 'Heavy Rain Risk';

        const repNotice = props.is_centroid_fallback
          ? '<div style="font-size: 10px; color: #64748b; margin-top: 3px; font-style: italic;">• Centroid representation (boundary geom pending)</div>'
          : '<div style="font-size: 10px; color: #059669; margin-top: 3px; font-weight: 500;">• PostGIS Boundary Polygon</div>';

        const statusNotice = isUnavailable
          ? '<div style="font-size: 10px; color: #64748b; margin-top: 4px; padding: 2px 4px; background: #f1f5f9; border-radius: 3px;">Forecast Unavailable: Meteorological archive insufficient for downscaling</div>'
          : props.is_experimental
            ? '<div style="font-size: 9px; color: #d97706; margin-top: 4px; font-weight: 500;">Experimental Tier</div>'
            : '';

        const html = `
          <div style="font-family: inherit; padding: 4px 6px; min-width: 140px;">
            <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${props.block_name}</div>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">${props.district_name}, ${props.state_name}</div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; padding: 4px 6px; background: #f8fafc; border-radius: 4px;">
              <span>${metricName} (${activeBucket.replace('_', ' ')}):</span>
              <span style="color: ${isUnavailable ? '#64748b' : '#0f172a'}; margin-left: 8px;">${valText}</span>
            </div>
            ${statusNotice}
            ${repNotice}
          </div>
        `;

        popup.setLngLat(coordinates).setHTML(html).addTo(map);
      };

      const handleMouseLeave = () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      };

      const handleBlockClick = (e: maplibregl.MapLayerMouseEvent) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const bId = feature.properties?.block_id;
        if (bId) {
          onSelectBlock(bId);
        }
      };

      map.on('mousemove', 'blocks-fill', handleMouseMove);
      map.on('mousemove', 'blocks-point', handleMouseMove);
      map.on('mouseleave', 'blocks-fill', handleMouseLeave);
      map.on('mouseleave', 'blocks-point', handleMouseLeave);
      map.on('click', 'blocks-fill', handleBlockClick);
      map.on('click', 'blocks-point', handleBlockClick);
    } else {
      source.setData(geojson);
      // Update color expression for active metric & bucket
      if (map.getLayer('blocks-fill')) {
        map.setPaintProperty('blocks-fill', 'fill-color', getColorExpression(activePropertyKey));
      }
      if (map.getLayer('blocks-point')) {
        map.setPaintProperty('blocks-point', 'circle-color', getColorExpression(activePropertyKey));
      }
    }
  }, [geojson, mapLoaded, activePropertyKey, getColorExpression, onSelectBlock, selectedBlockId, activeMetric, activeBucket]);

  // Update selection highlight when selectedBlockId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (map.getLayer('blocks-selected')) {
      map.setFilter('blocks-selected', [
        'all',
        ['any', ['==', '$type', 'Polygon'], ['==', '$type', 'MultiPolygon']],
        ['==', ['get', 'block_id'], selectedBlockId || ''],
      ]);
    }
    if (map.getLayer('blocks-point-selected')) {
      map.setFilter('blocks-point-selected', [
        'all',
        ['==', '$type', 'Point'],
        ['==', ['get', 'block_id'], selectedBlockId || ''],
      ]);
    }


    if (selectedBlockId) {
      const match = blocks.find((b) => b.block_id === selectedBlockId);
      if (match) {
        map.flyTo({
          center: [match.centroid_lon, match.centroid_lat],
          zoom: Math.max(map.getZoom(), 6.5),
          duration: 1000,
        });
      }
    }
  }, [selectedBlockId, mapLoaded, blocks]);

  // Search filter handler
  const filteredBlocks = searchQuery.trim()
    ? blocks.filter(
        (b) =>
          b.block_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.district_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.state_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div id="map-view" className="relative rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
      {/* Top Map Control Bar */}
      <div className="p-4 bg-muted/40 border-b border-border/60 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold tracking-tight text-foreground">
              National Monsoon Risk Canvas
            </h2>
            {isExperimentalModel && (
              <Badge variant="secondary" className="text-[10px] uppercase font-mono px-2 py-0 border-amber-500/40 text-amber-700 dark:text-amber-300">
                Experimental Model
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Interactive multi-week probabilistic risk across administrative blocks. Select a block to inspect downscaled farm advisories.
          </p>
        </div>

        {/* Lead Week Selector */}
        <div className="flex items-center gap-1 bg-background/80 p-1 rounded-xl border border-border/60 shadow-xs">
          {BUCKETS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveBucket(b.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeBucket === b.id
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{b.label}</span>
              <span className="hidden sm:inline text-[10px] ml-1 opacity-80">({b.sub})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Layer Toggles & Search Bar */}
      <div className="px-4 py-2.5 bg-muted/20 border-b border-border/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Risk Metric:
          </span>
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveMetric(m.id)}
              className={`px-3 py-1 rounded-lg text-xs transition-colors font-medium ${
                activeMetric === m.id
                  ? 'bg-foreground text-background shadow-xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              title={m.tooltip}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Block Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search block, district, state..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-background"
          />

          {filteredBlocks.length > 0 && searchQuery.trim() && (
            <div className="absolute top-9 left-0 right-0 z-30 max-h-48 overflow-y-auto rounded-lg bg-popover border border-border shadow-lg p-1 text-xs">
              {filteredBlocks.map((b) => (
                <button
                  key={b.block_id}
                  type="button"
                  onClick={() => {
                    onSelectBlock(b.block_id);
                    setSearchQuery('');
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted transition-colors flex items-center justify-between"
                >
                  <span className="font-semibold text-foreground">{b.block_name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {b.district_name}, {b.state_name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map Canvas Viewport */}
      <div className="relative min-h-[460px] sm:min-h-[540px] w-full bg-slate-100 dark:bg-slate-900">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

        {/* Floating Zoom / Orientation Controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5 bg-background/90 backdrop-blur border border-border/80 rounded-xl p-1 shadow-md">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => mapRef.current?.zoomIn()}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => mapRef.current?.zoomOut()}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              mapRef.current?.flyTo({ center: [79.0, 22.5], zoom: 4.3, duration: 1200 });
            }}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Reset India View"
          >
            <Compass className="h-4 w-4" />
          </Button>
        </div>

        {/* Selected Block Info Badge on Map */}
        {selectedBlockId && (
          <div className="absolute top-4 left-4 z-10 bg-background/95 backdrop-blur border border-border/90 rounded-xl p-2.5 px-3.5 shadow-md flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse" />
            <div>
              <div className="text-xs font-bold text-foreground">
                {blocks.find((b) => b.block_id === selectedBlockId)?.block_name || selectedBlockId}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {blocks.find((b) => b.block_id === selectedBlockId)?.district_name}, {blocks.find((b) => b.block_id === selectedBlockId)?.state_name}
              </div>
            </div>
          </div>
        )}

        {/* Floating Risk Scale & Coverage Legend */}
        <div className="absolute bottom-4 left-4 z-10 bg-background/95 backdrop-blur border border-border/80 rounded-xl p-2.5 px-3 shadow-md hidden sm:block">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Risk &amp; Coverage Scale</div>
          <div className="flex items-center gap-2.5 text-[11px] font-medium text-foreground">
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_LEVELS.low.hexColor }} /> &lt;20%</div>
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_LEVELS.moderate.hexColor }} /> 20–39%</div>
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_LEVELS.elevated.hexColor }} /> 40–59%</div>
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_LEVELS.high.hexColor }} /> 60–79%</div>
            <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_LEVELS.very_high.hexColor }} /> ≥80%</div>
            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 border-l border-border/60 pl-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Data Insufficient
            </div>
          </div>
        </div>

        {/* Empty state overlay if no blocks available */}
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur z-20">
            <div className="max-w-md p-6 bg-card border border-border rounded-2xl shadow-lg text-center space-y-3">
              <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
              <h3 className="text-base font-bold text-foreground">No Blocks Available</h3>
              <p className="text-xs text-muted-foreground">
                Database returned zero registered administrative blocks. Run synchronization pipeline or verify database connectivity.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
