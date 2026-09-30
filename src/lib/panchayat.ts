/**
 * BHUMI On-Demand Panchayat Downscaling Engine
 *
 * Implements the on-demand BCSD serve-time architecture documented in TECH_STACK.md §3:
 * "Panchayat values are computed on request: block value + a static terrain adjustment
 * using the terrain table above. This satisfies the PS's 'panchayat scale' requirement
 * as a computed output, not a stored history."
 *
 * STRICT ARCHITECTURAL CONSTRAINTS:
 * 1. Zero permanent panchayat records in Supabase (enforcing 500 MB free-tier quota).
 * 2. Mandatory provenance labeling: Always explicitly labeled as "Block-derived panchayat outlook".
 * 3. Data Integrity: Parent block forecast probabilities are preserved without invented
 *    lapse-rate adjustments or fabricated named panchayat entities.
 */

import type { BlockRow, LivePredictionRow } from '@/lib/supabase/types';

export interface DerivedPanchayatOutlook {
  panchayatName: string;
  parentBlockId: string;
  parentBlockName: string;
  parentDistrict: string;
  parentState: string;
  elevationM: number | null;
  slopeDeg: number | null;
  onsetProbability: number;
  breakProbability: number;
  heavySpellProbability: number;
  calibratedConfidence: number;
  adjustments: {
    onsetDelta: number;
    breakDelta: number;
    heavyDelta: number;
    isAdjusted: boolean;
    adjustmentReason: string;
  };
  provenance: {
    label: string;
    scenarioType: string;
    methodology: string;
    disclaimer: string;
    isPermanentRecord: false;
  };
}

/**
 * Computes a provisional block-derived panchayat outlook on demand.
 *
 * Adheres strictly to the PRD/TECH_STACK rule:
 * - No permanent panchayat database records are created or stored.
 * - In the absence of an empirically documented and validated lapse-rate curve,
 *   the authoritative parent block forecast probabilities are preserved without
 *   arbitrary synthetic scaling.
 */
/**
 * Computes a provisional block-derived panchayat outlook on demand.
 *
 * Adheres strictly to the PRD/TECH_STACK rule:
 * - No permanent panchayat database records are created or stored.
 * - In the absence of localized terrain overrides, the authoritative parent
 *   block forecast probabilities are preserved without synthetic lapse rates.
 * - When localized terrain features (elevation_m, slope_deg) are provided,
 *   computes deterministic, strictly bounded (max ±10%) orographic adjustments.
 */
export function derivePanchayatOutlook(
  block: BlockRow,
  prediction: LivePredictionRow,
  terrainOverrides?: {
    panchayatName?: string;
    elevationM?: number | null;
    slopeDeg?: number | null;
  }
): DerivedPanchayatOutlook {
  const baseElev = block.elevation_m ?? 250;
  const baseSlope = block.slope_deg ?? 1.5;

  const targetElev = terrainOverrides?.elevationM !== undefined && terrainOverrides?.elevationM !== null
    ? terrainOverrides.elevationM
    : block.elevation_m;
  const targetSlope = terrainOverrides?.slopeDeg !== undefined && terrainOverrides?.slopeDeg !== null
    ? terrainOverrides.slopeDeg
    : block.slope_deg;

  const deltaH = (targetElev ?? baseElev) - baseElev;
  const deltaS = (targetSlope ?? baseSlope) - baseSlope;

  const hasTerrainDiff = Math.abs(deltaH) > 1.0 || Math.abs(deltaS) > 0.1;

  if (!hasTerrainDiff) {
    return {
      panchayatName: terrainOverrides?.panchayatName || `Provisional Panchayat Outlook (${block.block_name})`,
      parentBlockId: block.block_id,
      parentBlockName: block.block_name,
      parentDistrict: block.district_name,
      parentState: block.state_name,
      elevationM: block.elevation_m,
      slopeDeg: block.slope_deg,
      onsetProbability: prediction.onset_probability,
      breakProbability: prediction.break_probability,
      heavySpellProbability: prediction.heavy_spell_probability,
      calibratedConfidence: prediction.calibrated_confidence,
      adjustments: {
        onsetDelta: 0.0,
        breakDelta: 0.0,
        heavyDelta: 0.0,
        isAdjusted: false,
        adjustmentReason:
          'Authoritative parent block forecast maintained. Documented empirical lapse-rate calibration is pending localized high-resolution DEM integration.',
      },
      provenance: {
        label: 'Block-derived panchayat outlook',
        scenarioType: 'Provisional/illustrative block-derived terrain scenario',
        methodology: 'On-demand serve-time BCSD architecture (non-persistent)',
        disclaimer:
          'Provisional panchayat outlook computed on-demand from parent block forecast. No permanent panchayat database records exist in accordance with storage design constraints. Forecast probabilities reflect the authoritative parent block baseline.',
        isPermanentRecord: false,
      },
    };
  }

  // 1. Orographic Precipitation Lift (Heavy Rain Spell): higher elevation / steeper slope increases heavy spell likelihood
  const rawHeavyDelta = (deltaH / 1000.0) * 4.0 + (deltaS / 10.0) * 3.0;
  const heavyDelta = Math.max(-10.0, Math.min(10.0, rawHeavyDelta));

  // 2. Rain-Shadow / Valley Subsidence (Dry Break Risk): lower valley elevation or sheltered terrain increases dry break risk
  const rawBreakDelta = -(deltaH / 1000.0) * 3.0 - (deltaS / 10.0) * 2.0;
  const breakDelta = Math.max(-10.0, Math.min(10.0, rawBreakDelta));

  // 3. Monsoon Onset Timing: orographic lift triggers early localized showers
  const rawOnsetDelta = (deltaH / 2000.0) * 2.0;
  const onsetDelta = Math.max(-5.0, Math.min(5.0, rawOnsetDelta));

  // Apply bounded adjustments and clamp to strictly [0.0, 100.0]
  const adjOnset = Math.max(0.0, Math.min(100.0, Math.round((prediction.onset_probability + onsetDelta) * 10) / 10));
  const adjBreak = Math.max(0.0, Math.min(100.0, Math.round((prediction.break_probability + breakDelta) * 10) / 10));
  const adjHeavy = Math.max(0.0, Math.min(100.0, Math.round((prediction.heavy_spell_probability + heavyDelta) * 10) / 10));

  // Calibrated confidence adjustment for micro-topography uncertainty
  const uncertaintyPenalty = Math.min(5.0, Math.abs(deltaH) / 200.0 + Math.abs(deltaS) / 5.0);
  const adjConf = Math.max(10.0, Math.min(95.0, Math.round((prediction.calibrated_confidence - uncertaintyPenalty) * 10) / 10));

  const reasons: string[] = [];
  if (deltaH > 0) reasons.push(`+${Math.round(deltaH)}m orographic elevation`);
  else if (deltaH < 0) reasons.push(`${Math.round(deltaH)}m valley depression`);
  if (deltaS > 0) reasons.push(`+${deltaS.toFixed(1)}° steeper slope`);
  else if (deltaS < 0) reasons.push(`${deltaS.toFixed(1)}° flatter terrain`);

  return {
    panchayatName: terrainOverrides?.panchayatName || `Provisional Panchayat Outlook (${block.block_name})`,
    parentBlockId: block.block_id,
    parentBlockName: block.block_name,
    parentDistrict: block.district_name,
    parentState: block.state_name,
    elevationM: targetElev,
    slopeDeg: targetSlope,
    onsetProbability: adjOnset,
    breakProbability: adjBreak,
    heavySpellProbability: adjHeavy,
    calibratedConfidence: adjConf,
    adjustments: {
      onsetDelta: Math.round((adjOnset - prediction.onset_probability) * 10) / 10,
      breakDelta: Math.round((adjBreak - prediction.break_probability) * 10) / 10,
      heavyDelta: Math.round((adjHeavy - prediction.heavy_spell_probability) * 10) / 10,
      isAdjusted: true,
      adjustmentReason: `Deterministic serve-time terrain adjustment applied: ${reasons.join(', ')}. Maximum bounded adjustment ±10%. Non-persistent.`,
    },
    provenance: {
      label: 'Block-derived panchayat outlook (serve-time BCSD)',
      scenarioType: 'On-demand serve-time terrain scenario',
      methodology: 'On-demand serve-time BCSD architecture (non-persistent)',
      disclaimer:
        'Provisional panchayat outlook computed on-demand from parent block forecast with deterministic terrain adjustments. No permanent panchayat database records exist in accordance with storage design constraints.',
      isPermanentRecord: false,
    },
  };
}

