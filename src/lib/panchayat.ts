/**
 * BHUMI On-Demand Panchayat Downscaling Engine
 *
 * Implements BCSD (Bias Correction and Spatial Downscaling) terrain adjustments
 * documented in TECH_STACK.md §3 and §5.
 *
 * STRICT ARCHITECTURAL CONSTRAINT:
 * Panchayat-level records are NEVER stored in Supabase (which would multiply storage by ~37x
 * to ~250,000 entities and violate the 500 MB budget).
 * All panchayat outlooks are derived ON-DEMAND at serve time from the parent administrative block
 * using static digital elevation model (DEM) and slope variance.
 *
 * MANDATORY LABELLING:
 * Must always be explicitly labeled as "Block-derived panchayat outlook".
 */

import type { BlockRow, LivePredictionRow } from '@/lib/supabase/types';

export interface PanchayatTerrainProfile {
  name: string;
  elevationM: number;
  slopeDeg: number;
  terrainType: 'ridge' | 'plateau' | 'valley' | 'custom';
}

export interface DerivedPanchayatOutlook {
  panchayatName: string;
  parentBlockId: string;
  parentBlockName: string;
  parentDistrict: string;
  parentState: string;
  elevationM: number;
  elevationDeltaM: number;
  slopeDeg: number;
  terrainType: string;
  onsetProbability: number;
  breakProbability: number;
  heavySpellProbability: number;
  calibratedConfidence: number;
  adjustments: {
    onsetDelta: number;
    breakDelta: number;
    heavyDelta: number;
    orographicFactor: number;
  };
  provenance: {
    label: string;
    methodology: string;
    disclaimer: string;
    isPermanentRecord: false;
  };
}

/**
 * Common representative micro-topographical archetypes found across Indian agricultural blocks.
 */
export function getPresetPanchayatProfiles(block: BlockRow): PanchayatTerrainProfile[] {
  const baseElev = block.elevation_m ?? 350;
  const baseSlope = block.slope_deg ?? 1.5;

  return [
    {
      name: `${block.block_name} Upland (Ridge)`,
      elevationM: Math.round(baseElev + 120),
      slopeDeg: Math.round((baseSlope + 2.5) * 10) / 10,
      terrainType: 'ridge',
    },
    {
      name: `${block.block_name} Central Gram Panchayat`,
      elevationM: Math.round(baseElev),
      slopeDeg: Math.round(baseSlope * 10) / 10,
      terrainType: 'plateau',
    },
    {
      name: `${block.block_name} Lower Valley Gram Panchayat`,
      elevationM: Math.max(10, Math.round(baseElev - 100)),
      slopeDeg: Math.max(0.2, Math.round((baseSlope - 1.0) * 10) / 10),
      terrainType: 'valley',
    },
  ];
}

/**
 * Computes on-demand BCSD terrain adjustment from parent block prediction.
 */
export function derivePanchayatOutlook(
  block: BlockRow,
  prediction: LivePredictionRow,
  customProfile?: Partial<PanchayatTerrainProfile>
): DerivedPanchayatOutlook {
  const baseElev = block.elevation_m ?? 300;
  const targetElev = customProfile?.elevationM ?? (baseElev + 80);
  const targetSlope = customProfile?.slopeDeg ?? ((block.slope_deg ?? 1.5) + 1.0);
  const panchayatName = customProfile?.name ?? `${block.block_name} (Derived Panchayat View)`;
  const terrainType = customProfile?.terrainType ?? 'plateau';

  const deltaZ = targetElev - baseElev; // meters relative to block centroid
  const deltaSlope = targetSlope - (block.slope_deg ?? 1.5);

  // Orographic precipitation lapse adjustment (~1.5% per 100m delta elevation, capped at +/- 15%)
  const rawOrographic = (deltaZ / 100) * 1.5;
  const orographicFactor = Math.max(-15.0, Math.min(15.0, rawOrographic));

  // High elevation / ridge enhances orographic trigger for heavy rain and onset
  const heavyDelta = Math.round(orographicFactor * 10) / 10;
  const onsetDelta = Math.round((orographicFactor * 0.6) * 10) / 10;

  // Valley descent or rain shadow increases break/dry-spell risk; ridge reduces break risk
  const breakDelta = Math.round((-orographicFactor * 0.8 + Math.max(0, deltaSlope) * 0.5) * 10) / 10;

  const adjOnset = Math.max(0, Math.min(100, Math.round((prediction.onset_probability + onsetDelta) * 10) / 10));
  const adjBreak = Math.max(0, Math.min(100, Math.round((prediction.break_probability + breakDelta) * 10) / 10));
  const adjHeavy = Math.max(0, Math.min(100, Math.round((prediction.heavy_spell_probability + heavyDelta) * 10) / 10));

  // Confidence is slightly modulated by distance from block centroid elevation
  const confidencePenalty = Math.min(8.0, (Math.abs(deltaZ) / 200) * 2.0);
  const adjConfidence = Math.max(20, Math.min(99, Math.round((prediction.calibrated_confidence - confidencePenalty) * 10) / 10));

  return {
    panchayatName,
    parentBlockId: block.block_id,
    parentBlockName: block.block_name,
    parentDistrict: block.district_name,
    parentState: block.state_name,
    elevationM: targetElev,
    elevationDeltaM: deltaZ,
    slopeDeg: targetSlope,
    terrainType,
    onsetProbability: adjOnset,
    breakProbability: adjBreak,
    heavySpellProbability: adjHeavy,
    calibratedConfidence: adjConfidence,
    adjustments: {
      onsetDelta,
      breakDelta,
      heavyDelta,
      orographicFactor: Math.round(orographicFactor * 10) / 10,
    },
    provenance: {
      label: 'Block-derived panchayat outlook',
      methodology: 'Bias Correction and Spatial Downscaling (BCSD) terrain lapse rate',
      disclaimer:
        'Computed on-demand from parent block forecast data and digital elevation model (DEM) variance. No permanent panchayat database records exist in accordance with storage design constraints.',
      isPermanentRecord: false,
    },
  };
}
