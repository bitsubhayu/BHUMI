'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Layers,
  Search,
  ZoomIn,
  ZoomOut,
  Compass,
  MapPin,
  Sparkles,
  Info,
  Maximize2
} from 'lucide-react';

export function MapContainerPlaceholder() {
  const [activeBucket, setActiveBucket] = useState<'week_1' | 'week_2' | 'week_3' | 'week_4'>('week_1');
  const [activeLayer, setActiveLayer] = useState<'break' | 'onset' | 'heavy' | 'terrain'>('break');
  const [searchQuery, setSearchQuery] = useState('');

  const buckets = [
    { id: 'week_1', label: 'Week 1', sub: 'Days 1–7' },
    { id: 'week_2', label: 'Week 2', sub: 'Days 8–14' },
    { id: 'week_3', label: 'Week 3', sub: 'Days 15–21' },
    { id: 'week_4', label: 'Week 4', sub: 'Days 22–28' },
  ] as const;

  const layers = [
    { id: 'break', label: 'Monsoon Break Risk' },
    { id: 'onset', label: 'Onset Probability' },
    { id: 'heavy', label: 'Heavy Spell Risk' },
    { id: 'terrain', label: 'Panchayat Terrain' },
  ] as const;

  return (
    <Card id="map-view" className="overflow-hidden border-border/80 shadow-md">
      {/* Top Map Control Bar */}
      <CardHeader className="p-4 bg-muted/30 border-b border-border/60">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-bold tracking-tight">
                Hydro-Meteorological Risk Canvas
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-mono">
                MapLibre GL JS Shell
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Block-scale boundary rendering (~6,700 blocks) with on-demand Panchayat terrain downscaling
            </p>
          </div>

          {/* Lead time bucket selector */}
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg border border-border/60">
            {buckets.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBucket(b.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  activeBucket === b.id
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{b.label}</span>
                <span className="hidden sm:inline text-[10px] ml-1 opacity-70">({b.sub})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Second row: Layer switch and search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          {/* Layer toggles */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
              <Layers className="h-3.5 w-3.5" />
              Layer:
            </span>
            {layers.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setActiveLayer(l.id)}
                className={`px-2.5 py-0.5 rounded text-xs transition-colors ${
                  activeLayer === l.id
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* Search block / panchayat */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search block or district (e.g. Pune, Nagpur)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>
        </div>
      </CardHeader>

      {/* Map Viewport Area */}
      <CardContent className="p-0 relative bg-muted/20 min-h-[460px] flex items-center justify-center overflow-hidden">
        {/* Subtle grid background pattern */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Map UI Floating Controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5 bg-background/90 backdrop-blur border border-border/80 rounded-lg p-1 shadow-sm">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Reset orientation">
            <Compass className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Fullscreen">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Architectural Info Box in Map Viewport */}
        <div className="relative z-10 max-w-lg mx-4 p-6 rounded-xl bg-card/95 border border-border shadow-lg backdrop-blur text-center space-y-4">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-1">
            <MapPin className="h-6 w-6" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-foreground">
              MapLibre GL Visualizer Foundation
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              In Step 1, the frontend architecture and dependencies (<code className="text-foreground font-mono">maplibre-gl</code>,{' '}
              <code className="text-foreground font-mono">@types/geojson</code>) are fully installed and configured.
              In Phase 2, this container mounts OpenStreetMap / CARTO raster basemaps with precomputed PostGIS simplified block boundaries.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-left pt-2 text-xs">
            <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50">
              <span className="font-semibold block text-foreground mb-0.5">Active View:</span>
              <span className="text-muted-foreground capitalize">
                {activeLayer.replace('_', ' ')} • {activeBucket.replace('_', ' ')}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50">
              <span className="font-semibold block text-foreground mb-0.5">Tile Source:</span>
              <span className="text-muted-foreground">CARTO / OSM (₹0 Cost)</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Polygon payload: ~20 MB simplified PostGIS geometries via Supabase</span>
          </div>
        </div>

        {/* Bottom map status chip */}
        <div className="absolute bottom-3 left-3 z-10 hidden sm:flex items-center gap-2 bg-background/90 backdrop-blur border border-border/70 rounded-md px-2.5 py-1 text-[11px] text-muted-foreground shadow-xs">
          <Info className="h-3 w-3" />
          <span>India Bounding Box: 6.5°N - 37.5°N, 68.1°E - 97.4°E</span>
        </div>
      </CardContent>
    </Card>
  );
}
