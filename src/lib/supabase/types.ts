/**
 * BHUMI Supabase Database & PostGIS TypeScript Definitions
 *
 * Implements the schema designed in TECH_STACK.md §3 & Step 2 migrations:
 * - blocks: ~6,700 administrative blocks with PostGIS geometry & terrain features
 *   (elevation_m, slope_deg used for on-demand BCSD panchayat downscaling)
 * - seasonal_archives: Compact 214-day smallint[] array-packed season rows (~12 MB/yr)
 * - live_weather_buffer: Rolling 90-day live weather buffer (~30 MB)
 * - teleconnections_history: 40+ years ENSO/IOD/MJO trajectory (~1 MB)
 * - live_predictions: Precomputed block probabilities and driver explainability
 * - advisory_rules: ICAR/KVK threshold-driven rule engine and localized templates
 *
 * NOTE: Panchayat data is computed at serve time from block data + terrain features,
 * and is NEVER stored as permanent rows in the database.
 */

export type LeadTimeBucket = 'week_1' | 'week_2' | 'week_3' | 'week_4';
export type AgronomicActionType = 'safe_to_sow' | 'delay_sowing' | 'prepare_irrigation' | 'drainage_alert' | 'monitor_conditions';

export interface BlockRow {
  block_id: string; // Local Government Directory (LGD) block code
  block_name: string;
  district_name: string;
  state_name: string;
  centroid_lat: number;
  centroid_lon: number;
  elevation_m: number | null;
  slope_deg: number | null;
  distance_to_coast_km: number | null;
  agro_climatic_zone: string | null;
  boundary_geom: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface SeasonalArchiveRow {
  id: number;
  block_id: string;
  season_year: number;
  season_start_date: string;
  season_end_date: string;
  rainfall_x10: number[]; // 214 scaled integers (mm * 10)
  max_temp_x10: number[]; // 214 scaled integers (°C * 10)
  soil_moisture_idx: number[]; // 214 scaled integers
  weather_state_code: number[]; // 214 state codes (0: Normal, 1: Onset, 2: Active, 3: Break, 4: Heavy)
  created_at: string;
  updated_at: string;
}

export interface LiveWeatherBufferRow {
  block_id: string;
  observation_date: string;
  rainfall_mm: number;
  max_temp_c: number | null;
  min_temp_c: number | null;
  soil_moisture_idx: number | null;
  data_source: string;
  is_preliminary: boolean;
  created_at: string;
}

export interface TeleconnectionsHistoryRow {
  observation_date: string;
  enso_oni: number | null;
  iod_dmi: number | null;
  mjo_phase: number | null;
  mjo_amplitude: number | null;
  source_agency: string;
  created_at: string;
}

export interface LivePredictionRow {
  id: number;
  block_id: string;
  prediction_date: string;
  lead_time_bucket: LeadTimeBucket;
  onset_probability: number; // 0 - 100%
  break_probability: number; // 0 - 100%
  heavy_spell_probability: number; // 0 - 100%
  calibrated_confidence: number; // 0 - 100%
  primary_driver: string; // e.g. "IOD negative + MJO phase 3"
  secondary_driver: string | null;
  teleconnection_analog_year: number | null;
  advisory_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdvisoryRuleRow {
  rule_code: string;
  action_type: AgronomicActionType;
  crop_category: string;
  trigger_condition: string;
  english_title: string;
  english_recommendation: string;
  suggested_measures: string[];
  icar_reference_code: string | null;
  localized_templates: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Supabase Database interface for client type safety
 */
export type Database = {
  public: {
    Tables: {
      blocks: {
        Row: BlockRow;
        Insert: Omit<BlockRow, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string };
        Update: Partial<BlockRow>;
      };
      seasonal_archives: {
        Row: SeasonalArchiveRow;
        Insert: Omit<SeasonalArchiveRow, 'id' | 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string };
        Update: Partial<SeasonalArchiveRow>;
      };
      live_weather_buffer: {
        Row: LiveWeatherBufferRow;
        Insert: Omit<LiveWeatherBufferRow, 'created_at'> & { created_at?: string };
        Update: Partial<LiveWeatherBufferRow>;
      };
      teleconnections_history: {
        Row: TeleconnectionsHistoryRow;
        Insert: Omit<TeleconnectionsHistoryRow, 'created_at'> & { created_at?: string };
        Update: Partial<TeleconnectionsHistoryRow>;
      };
      live_predictions: {
        Row: LivePredictionRow;
        Insert: Omit<LivePredictionRow, 'id' | 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string };
        Update: Partial<LivePredictionRow>;
      };
      advisory_rules: {
        Row: AdvisoryRuleRow;
        Insert: Omit<AdvisoryRuleRow, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string };
        Update: Partial<AdvisoryRuleRow>;
      };
    };
  };
};
