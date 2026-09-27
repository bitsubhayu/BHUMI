/**
 * Weather & Hydro-meteorological Domain Types
 * Based on MoES / NCMRWF problem statement requirements (SIH 2026 - PS 26086)
 */

export type SeasonPhase = 'pre_monsoon' | 'onset_window' | 'active_monsoon' | 'break_monsoon' | 'withdrawal';

export type LeadTimeBucket = 'week_1' | 'week_2' | 'week_3' | 'week_4';

export interface TeleconnectionIndices {
  /** Oceanic Niño Index (ENSO indicator) */
  ensoOni: number | null;
  /** Dipole Mode Index (Indian Ocean Dipole indicator) */
  iodDmi: number | null;
  /** Madden-Julian Oscillation phase (1-8) */
  mjoPhase: number | null;
  /** Madden-Julian Oscillation amplitude */
  mjoAmplitude: number | null;
  lastUpdated: string;
}

export interface BlockWeatherData {
  blockId: string;
  blockName: string;
  districtName: string;
  stateName: string;
  /** Daily rainfall in millimeters */
  rainfallMm: number;
  /** Daily maximum temperature in Celsius */
  maxTempC: number;
  /** Root-zone soil moisture wetness index (0-100) */
  soilMoistureIndex: number;
  observationDate: string;
}
