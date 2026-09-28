'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CloudRain, Globe, Layers, Activity, Menu, X } from 'lucide-react';
import { siteConfig } from '@/config/site';
import { supportedLanguages } from '@/config/languages';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Navbar() {
  const [selectedLang, setSelectedLang] = useState('en');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0">
            <CloudRain className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-foreground">{siteConfig.name}</span>
              <Badge variant="outline" className="hidden sm:inline-flex text-[10px] uppercase font-mono tracking-wider">
                MoES / NCMRWF
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground hidden md:block">
              {siteConfig.acronym}
            </p>
          </div>
        </div>

        {/* Center navigation links (Desktop) */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
          {siteConfig.navItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Action controls & language selector */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Regional language dropdown selector */}
          <div className="flex items-center gap-1 bg-muted/60 border border-border/70 rounded-lg px-2 py-1">
            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              aria-label="Select regional language"
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="bg-transparent text-xs font-medium text-foreground focus:outline-none cursor-pointer max-w-[90px] sm:max-w-none"
            >
              {supportedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code} className="bg-popover text-popover-foreground">
                  {lang.name} ({lang.nativeName})
                </option>
              ))}
            </select>
          </div>

          <Link
            href="#architecture"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'hidden sm:inline-flex gap-1.5 text-xs')}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Stack Info</span>
          </Link>

          <Link
            href="#map-view"
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'hidden sm:inline-flex gap-1.5 text-xs font-semibold')}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Explore Map</span>
          </Link>

          {/* Mobile menu hamburger button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-border/80 bg-background/98 px-4 py-4 space-y-3">
          <nav className="flex flex-col space-y-2">
            {siteConfig.navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-md text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="pt-2 border-t border-border/60 flex items-center gap-2">
            <Link
              href="#map-view"
              onClick={() => setMobileMenuOpen(false)}
              className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'w-full gap-1.5 text-xs font-semibold')}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Explore Risk Map</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

