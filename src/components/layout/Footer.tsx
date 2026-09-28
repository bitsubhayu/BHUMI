import React from 'react';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { CloudRain, ShieldCheck, Database, Cpu } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full border-t border-border/80 bg-background py-10 px-4 sm:px-6 lg:px-8 mt-auto">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Brand and attribution */}
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CloudRain className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold tracking-tight">{siteConfig.name}</span>
          </div>
          <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
            {siteConfig.acronym}. Developed under Smart India Hackathon (SIH 2026), Problem Statement 26086 for the
            Ministry of Earth Sciences (MoES) and National Centre for Medium Range Weather Forecasting (NCMRWF).
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <Cpu className="h-3 w-3" />
              Next.js 16 App Router
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <Database className="h-3 w-3" />
              Supabase PostGIS (500 MB Budget)
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              ₹0 Operational Cost Target
            </span>
          </div>
        </div>

        {/* Technical Architecture Quick Links */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-3">Architecture</h4>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li>
              <Link href="#architecture" className="hover:text-foreground transition-colors">
                Storage Design (Array-packed 12MB/yr)
              </Link>
            </li>
            <li>
              <Link href="#architecture" className="hover:text-foreground transition-colors">
                Vercel Serves, Actions Computes
              </Link>
            </li>
            <li>
              <Link href="#architecture" className="hover:text-foreground transition-colors">
                MapLibre GL + OpenStreetMap
              </Link>
            </li>
            <li>
              <Link href="#architecture" className="hover:text-foreground transition-colors">
                Static Multilingual Advisory Engine
              </Link>
            </li>
          </ul>
        </div>

        {/* References & Compliance */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-3">Governance & Data</h4>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li>
              <span className="text-foreground font-medium">IMD / NCMRWF</span> Ground Truth
            </li>
            <li>
              <span className="text-foreground font-medium">ERA5 / CHIRPS</span> Satellite Reanalysis
            </li>
            <li>
              <span className="text-foreground font-medium">NOAA / BOM</span> ENSO, IOD, MJO Indices
            </li>
            <li>
              <span className="text-foreground font-medium">ICAR / KVK</span> Agronomic Thresholds
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>© 2026 BHUMI Project. Open-Source Meteorological Intelligence Platform.</p>
        <p className="font-mono text-[11px]">Production Foundation — Step 1 Architecture Shell</p>
      </div>
    </footer>
  );
}
