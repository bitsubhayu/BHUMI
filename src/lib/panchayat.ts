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
export function derivePanchayatOutlook(
  block: BlockRow,
  prediction: LivePredictionRow
): DerivedPanchayatOutlook {
  return {
    panchayatName: `Provisional Panchayat Outlook (${block.block_name})`,
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
