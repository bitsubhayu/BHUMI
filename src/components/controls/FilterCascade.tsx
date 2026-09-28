'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, ChevronDown, X } from 'lucide-react';
import type { Region } from '@/lib/forecast/types';
import { getRepository } from '@/lib/forecast/repository';
import { useT } from '@/lib/i18n/useT';

interface FilterCascadeProps {
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
}

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function FilterCascade({ onBoundsChange }: FilterCascadeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const t = useT();

  // URL-driven state
  const selectedState = searchParams.get('state') ?? '';
  const selectedDistrict = searchParams.get('district') ?? '';
  const selectedBlock = searchParams.get('block') ?? '';

  // Lazy-loaded region options
  const [states, setStates] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<Region[]>([]);
  const [blocks, setBlocks] = useState<Region[]>([]);

  // Search
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Region[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 150);
  const searchRef = useRef<HTMLDivElement>(null);

  const repo = getRepository();

  // Load states on mount
  useEffect(() => {
    repo.listRegions(null).then(setStates);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load districts when state changes
  useEffect(() => {
    let active = true;
    if (!selectedState) {
      queueMicrotask(() => { if (active) setDistricts([]); });
      return () => { active = false; };
    }
    repo.listRegions(selectedState).then((r) => { if (active) setDistricts(r); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState]);

  // Load blocks when district changes
  useEffect(() => {
    let active = true;
    if (!selectedDistrict) {
      queueMicrotask(() => { if (active) setBlocks([]); });
      return () => { active = false; };
    }
    repo.listRegions(selectedDistrict).then((r) => { if (active) setBlocks(r); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDistrict]);

  // Search on debounced query
  useEffect(() => {
    let active = true;
    if (!debouncedQuery) {
      queueMicrotask(() => { if (active) setSearchResults([]); });
      return () => { active = false; };
    }
    repo.searchRegions(debouncedQuery, 8).then((r) => { if (active) setSearchResults(r); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  function updateParam(key: string, value: string, clearChildren?: string[]) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      clearChildren?.forEach((c) => params.delete(c));
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  }

  function handleStateChange(id: string) {
    updateParam('state', id, ['district', 'block']);
  }
  function handleDistrictChange(id: string) {
    updateParam('district', id, ['block']);
    // fitBounds to district
    const d = districts.find((r) => r.id === id);
    if (d) onBoundsChange?.(d.bbox);
  }
  function handleBlockChange(id: string) {
    updateParam('block', id);
    const b = blocks.find((r) => r.id === id);
    if (b) onBoundsChange?.(b.bbox);
  }

  function handleSearchSelect(region: Region) {
    setQuery('');
    setSearchOpen(false);
    if (region.level === 'state') {
      updateParam('state', region.id, ['district', 'block']);
    } else if (region.level === 'district') {
      updateParam('district', region.id, ['block']);
    } else {
      updateParam('block', region.id);
    }
    onBoundsChange?.(region.bbox);
  }

  function handleClear() {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      ['state', 'district', 'block'].forEach((k) => params.delete(k));
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  }

  // Close search on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="flex items-center gap-2 flex-wrap" role="search" aria-label="Filter by location">
      {/* Search combobox */}
      <div ref={searchRef} className="relative">
        <div className="map-overlay flex items-center gap-2 px-3 py-2 min-w-[220px]">
          <Search size={14} strokeWidth={1.75} className="text-[var(--ink-muted)] flex-shrink-0" aria-hidden="true" />
          <input
            type="search"
            placeholder={t('filters.search')}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            className="flex-1 bg-transparent text-[var(--ink)] text-sm outline-none placeholder:text-[var(--ink-muted)]"
            aria-label={t('filters.search')}
            aria-autocomplete="list"
            aria-controls="search-results"
            id="block-search"
            style={{ fontSize: '16px' }}
          />
        </div>
        {searchOpen && searchResults.length > 0 && (
          <ul
            id="search-results"
            role="listbox"
            aria-label="Search results"
            className="absolute top-full left-0 right-0 mt-1 map-overlay py-1 max-h-48 overflow-y-auto z-30"
          >
            {searchResults.map((r) => (
              <li key={r.id} role="option" aria-selected="false">
                <button
                  onClick={() => handleSearchSelect(r)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-tile)] text-[var(--ink)]"
                  type="button"
                >
                  <span className="font-medium">{r.name}</span>
                  {r.parentId && (
                    <span className="ml-1 text-[var(--ink-muted)] text-xs">
                      · {r.level}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {debouncedQuery && searchResults.length === 0 && (
              <li className="px-3 py-2 text-sm text-[var(--ink-muted)]">{t('filters.no_match')}</li>
            )}
          </ul>
        )}
      </div>

      {/* State select */}
      <div className="map-overlay">
        <label className="sr-only" htmlFor="filter-state">{t('filters.state')}</label>
        <select
          id="filter-state"
          value={selectedState}
          onChange={(e) => handleStateChange(e.target.value)}
          className="bg-transparent text-[var(--ink)] text-sm px-3 py-2 pr-7 outline-none appearance-none cursor-pointer min-w-[120px]"
          aria-label={t('filters.state')}
        >
          <option value="">{t('filters.state')}</option>
          {states.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
      </div>

      {/* District select */}
      <div className="map-overlay relative">
        <label className="sr-only" htmlFor="filter-district">{t('filters.district')}</label>
        <select
          id="filter-district"
          value={selectedDistrict}
          onChange={(e) => handleDistrictChange(e.target.value)}
          disabled={!selectedState}
          className="bg-transparent text-[var(--ink)] text-sm px-3 py-2 pr-7 outline-none appearance-none cursor-pointer min-w-[130px] disabled:opacity-40"
          aria-label={t('filters.district')}
        >
          <option value="">{t('filters.district')}</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
      </div>

      {/* Block select */}
      <div className="map-overlay relative">
        <label className="sr-only" htmlFor="filter-block">{t('filters.block')}</label>
        <select
          id="filter-block"
          value={selectedBlock}
          onChange={(e) => handleBlockChange(e.target.value)}
          disabled={!selectedDistrict}
          className="bg-transparent text-[var(--ink)] text-sm px-3 py-2 pr-7 outline-none appearance-none cursor-pointer min-w-[120px] disabled:opacity-40"
          aria-label={t('filters.block')}
        >
          <option value="">{t('filters.block')}</option>
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
      </div>

      {/* Clear */}
      {(selectedState || selectedDistrict || selectedBlock) && (
        <button
          onClick={handleClear}
          className="map-overlay px-3 py-2 text-sm text-[var(--ink-muted)] flex items-center gap-1 hover:text-[var(--ink)]"
          type="button"
          aria-label={t('filters.clear')}
          id="filter-clear"
        >
          <X size={12} strokeWidth={1.75} aria-hidden="true" />
          {t('filters.clear')}
        </button>
      )}
    </div>
  );
}
