/**
 * Probabilistic Risk & Model Explainability Types
 * 
 * Satisfies the PRD requirement for 1-4 week lead-time probabilistic outlooks
 * and explainability drivers behind every block-level forecast.
 */

import type { LeadTimeBucket } from './weather';

export type RiskCategory = 'onset' | 'break' | 'heavy_spell';

export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe';

export interface ProbabilisticRiskOutlook {
  blockId: string;
  leadTime: LeadTimeBucket;
  /** Calibrated probability percentage (0 - 100) */
  probability: number;
  level: RiskLevel;
  confidenceScore: number;
}

export interface BlockRiskSummary {
  blockId: string;
  blockName: string;
  districtName: string;
  stateName: string;
  outlookWeek1: ProbabilisticRiskOutlook;
  outlookWeek2: ProbabilisticRiskOutlook;
  outlookWeek3: ProbabilisticRiskOutlook;
  outlookWeek4: ProbabilisticRiskOutlook;
  /** Explainability: dominant physical teleconnection drivers */
  primaryDriver: string;
  secondaryDriver?: string | null;
  /** Last updated date in ISO format */
  forecastDate: string;
}

export interface RiskThresholdBand {
  min: number;
  max: number;
  label: string;
  colorHex: string;
  tailwindClass: string;
  description: string;
}
