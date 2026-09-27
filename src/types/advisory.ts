/**
 * Agronomic Advisory Domain Types
 * Based on ICAR / KVK threshold rules for Kharif crop management
 */

export type AgronomicAction = 'safe_to_sow' | 'delay_sowing' | 'prepare_irrigation' | 'drainage_alert' | 'monitor_conditions';

export type CropType = 'paddy' | 'soybean' | 'cotton' | 'maize' | 'pulses' | 'groundnut' | 'general';

export interface CropAdvisory {
  id: string;
  blockId: string;
  panchayatId?: string;
  crop: CropType;
  action: AgronomicAction;
  title: string;
  rationale: string;
  suggestedMeasures: string[];
  issuedAt: string;
  validUntil: string;
  icarReferenceCode?: string;
  languageCode: string;
}

export interface AdvisoryTemplate {
  templateId: string;
  action: AgronomicAction;
  englishTemplate: string;
  localizedTemplates: Record<string, string>;
}
