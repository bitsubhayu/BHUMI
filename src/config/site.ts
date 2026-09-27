/**
 * BHUMI Site Configuration & Metadata
 * 
 * Official details:
 * SIH 2026 Problem Statement 26086:
 * Hyperlocal Monsoon Onset & Break Prediction System (Block/Village Scale)
 * Ministry of Earth Sciences (MoES) / NCMRWF
 */

export const siteConfig = {
  name: 'BHUMI',
  acronym: 'Block-level Hydro-meteorological Updates for Micro-climate Intelligence',
  tagline: 'Hyperlocal Monsoon Onset & Break Prediction System',
  description:
    'A high-resolution hydro-meteorological intelligence platform translating global climate teleconnections into block-level probabilistic onset and break predictions with plain-language agronomic advisories.',
  sih: {
    problemStatementId: '26086',
    problemStatementTitle: 'Hyperlocal Monsoon Onset & Break Prediction System (Block/Village Scale)',
    ministry: 'Ministry of Earth Sciences (MoES)',
    organization: 'National Centre for Medium Range Weather Forecasting (NCMRWF)',
    theme: 'Agriculture, FoodTech & Rural Development',
  },
  stats: {
    blocksCovered: '6,700+',
    leadTimeWeeks: '1–4 Weeks',
    refreshCadence: 'Daily (06:00 IST)',
    infraCost: '₹0 (Free Tier)',
    dbCap: '500 MB (PostGIS)',
  },
  navItems: [
    { label: 'Risk Map', href: '#map-view', id: 'nav-map' },
    { label: 'Block Outlook', href: '#block-outlook', id: 'nav-outlook' },
    { label: 'Crop Advisory', href: '#crop-advisory', id: 'nav-advisory' },
    { label: 'Explainability', href: '#explainability', id: 'nav-explainability' },
    { label: 'System Architecture', href: '#architecture', id: 'nav-architecture' },
  ],
  links: {
    github: 'https://github.com/bitsubhayu/BHUMI',
    docsPrd: '/docs/PRD.md',
    docsTechStack: '/docs/TECH_STACK.md',
  },
};
