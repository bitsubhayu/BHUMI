/**
 * Regional Language Configuration for BHUMI
 * 
 * Multilingual configuration for BHUMI regional advisory delivery (IndicTrans2 designated open-source fallback).
 */

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  scriptDirection: 'ltr' | 'rtl';
}

export const supportedLanguages: SupportedLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', scriptDirection: 'ltr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', scriptDirection: 'ltr' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', scriptDirection: 'ltr' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', scriptDirection: 'ltr' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', scriptDirection: 'ltr' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', scriptDirection: 'ltr' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', scriptDirection: 'ltr' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', scriptDirection: 'ltr' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', scriptDirection: 'ltr' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', scriptDirection: 'ltr' },
];

export const defaultLanguage = supportedLanguages[0];
