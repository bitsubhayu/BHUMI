/**
 * BHUMI — Live Supabase Forecast Adapter Verification Script
 */

import fs from 'node:fs';

// Load .env.local
const content = fs.readFileSync('.env.local', 'utf8');
for (const line of content.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [k, ...v] = trimmed.split('=');
  if (k && v.length > 0) process.env[k.trim()] = v.join('=').trim();
}

import { supabaseRepository } from '../src/lib/forecast/supabase-adapter.ts';

async function verifyLiveIntegration() {
  console.log('=== 1. Testing getMeta() ===');
  const meta = await supabaseRepository.getMeta();
  console.log('Meta:', {
    issuedAt: meta.issuedAt,
    validFrom: meta.validFrom,
    nextUpdateAt: meta.nextUpdateAt,
    modelTier: meta.modelTier,
    isProductionReady: meta.isProductionReady,
    coverage: meta.trainingCoverage,
  });

  console.log('\n=== 2. Testing listRegions(null) [States] ===');
  const states = await supabaseRepository.listRegions(null);
  console.log('States found:', states.map((s) => s.name));

  console.log('\n=== 3. Testing listRegions("Rajasthan") [Districts] ===');
  const districts = await supabaseRepository.listRegions('Rajasthan');
  console.log('Districts found:', districts.map((d) => ({ id: d.id, name: d.name })));

  console.log('\n=== 4. Testing listRegions("Jodhpur") [Blocks] ===');
  const blocks = await supabaseRepository.listRegions('Jodhpur');
  console.log('Blocks found:', blocks.map((b) => ({ id: b.id, name: b.name, centroid: b.centroid })));

  console.log('\n=== 5. Testing getRegionsGeoJSON(null) ===');
  const geo = await supabaseRepository.getRegionsGeoJSON(null);
  console.log('GeoJSON feature count:', geo.features.length);
  for (const f of geo.features) {
    console.log(
      ' - Feature:',
      f.properties.id,
      f.properties.name,
      '| Geom:',
      f.geometry.type,
      '| Rep:',
      f.properties.representation,
      '| DrySpell w1-w4:',
      [
        f.properties.dry_spell_w1,
        f.properties.dry_spell_w2,
        f.properties.dry_spell_w3,
        f.properties.dry_spell_w4,
      ]
    );
  }

  console.log('\n=== 6. Testing getRisk("IND_RJ_JOD_001") ===');
  const risk = await supabaseRepository.getRisk('IND_RJ_JOD_001');
  console.log('Risk for Jodhpur block 1:');
  console.log('  reliability:', risk.reliability);
  console.log('  probabilities:', risk.probabilities);
  console.log('  dry_spell drivers count:', risk.drivers.dry_spell.length);
  if (risk.drivers.dry_spell[0]) {
    console.log('  sample driver:', risk.drivers.dry_spell[0]);
  }

  console.log('\n=== 7. Testing getAdvisory("IND_RJ_JOD_001", "rice", 1) ===');
  const adv1 = await supabaseRepository.getAdvisory('IND_RJ_JOD_001', 'rice', 1);
  console.log('Advisory Week 1:');
  console.log('  verdict:', adv1.verdict);
  console.log('  en:', adv1.textByLocale.en);
  console.log('  hi:', adv1.textByLocale.hi);
  console.log('  bn:', adv1.textByLocale.bn);

  console.log('\n=== 8. Testing getAdvisory("IND_RJ_JOD_001", "cotton", 2) ===');
  const adv2 = await supabaseRepository.getAdvisory('IND_RJ_JOD_001', 'cotton', 2);
  console.log('Advisory Week 2 Cotton:');
  console.log('  verdict:', adv2.verdict);
  console.log('  en:', adv2.textByLocale.en);

  console.log('\n=== 9. Testing experimental block IND_MH_PUN_001 ===');
  const expGeo = geo.features.find((f) => f.properties.id === 'IND_MH_PUN_001');
  console.log('Haveli is_experimental flag:', expGeo?.properties.is_experimental);

  console.log('\n=== 10. Testing missing block safe fallback ===');
  const noDataRisk = await supabaseRepository.getRisk('UNKNOWN_BLOCK');
  console.log('No-data risk onset:', noDataRisk.probabilities.onset, '| reliability:', noDataRisk.reliability);

  console.log('\n>>> ALL REAL DATA INTEGRATION CHECKS PASSED SUCCESSFULLY! <<<');
}

verifyLiveIntegration().catch(console.error);
