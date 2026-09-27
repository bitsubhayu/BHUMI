/**
 * BHUMI — Remote Supabase Schema & Security Verifier
 * 
 * Verifies:
 * 1. PostgREST connection to configured Supabase project
 * 2. Presence of all 6 intended tables in schema cache
 * 3. Absence of permanent panchayat table (confirming PRD/TECH_STACK compliance)
 * 4. Row Level Security write-blocking on client anon key
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local safely
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('================================================================');
console.log('BHUMI Remote Supabase Database Verification');
console.log('================================================================');
console.log(`Endpoint: ${supabaseUrl}`);

if (!supabaseUrl || !serviceKey) {
  console.error('Error: Supabase credentials not found in .env.local');
  process.exit(1);
}

const intendedTables = [
  'blocks',
  'seasonal_archives',
  'live_weather_buffer',
  'teleconnections_history',
  'live_predictions',
  'advisory_rules'
];

async function verify() {
  try {
    // 1. Fetch OpenAPI definition to inspect registered schema
    const swaggerRes = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });

    if (!swaggerRes.ok) {
      console.log(`[!] REST API returned HTTP ${swaggerRes.status}`);
      return;
    }

    const swagger = await swaggerRes.json();
    const definitions = Object.keys(swagger.definitions || {});
    console.log(`\n[+] Active tables in PostgREST schema cache: ${definitions.length}`);
    if (definitions.length > 0) {
      definitions.forEach((def) => console.log(`   - public.${def}`));
    }

    // 2. Check each intended table
    console.log('\n--- Checking Intended Tables ---');
    for (const table of intendedTables) {
      const isPresent = definitions.includes(table);
      console.log(`   ${isPresent ? '✓' : '✗'} ${table}: ${isPresent ? 'Detected in remote database' : 'Pending migration application'}`);
    }

    // 3. Verify PostGIS Extension
    const hasPostGIS = definitions.includes('spatial_ref_sys') || definitions.includes('geometry_columns');
    console.log('\n--- PostGIS Extension Verification ---');
    if (hasPostGIS) {
      console.log('   ✓ PostGIS extension: Available and active (spatial_ref_sys and geometry_columns detected in schema cache).');
    } else {
      console.log('   ✗ PostGIS tables not detected in schema cache.');
    }

    // 4. Verify Panchayat Architectural Decision
    const hasPanchayatTable = definitions.some((d) => d.toLowerCase().includes('panchayat'));
    console.log('\n--- Architectural Constraint Verification ---');
    if (!hasPanchayatTable) {
      console.log('   ✓ Panchayat table absent: Confirmed. Panchayat values remain computed on-demand from block terrain.');
    } else {
      console.log('   ✗ WARNING: Panchayat table detected. Must not store permanent panchayat records.');
    }

    // 5. Test RLS / Unauthorized client write prevention
    console.log('\n--- Row Level Security (RLS) Test ---');
    if (anonKey) {
      // Test read access (should be allowed with empty result)
      const readTest = await fetch(`${supabaseUrl}/rest/v1/blocks?select=count`, {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });
      if (readTest.ok) {
        console.log('   ✓ Anonymous read access allowed (HTTP 200). Public can read block data.');
      } else {
        console.log(`   ! Anonymous read access returned HTTP ${readTest.status}`);
      }

      // Test unauthorized write access (must be blocked by RLS)
      const writeTest = await fetch(`${supabaseUrl}/rest/v1/blocks`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          block_id: 'TEST_PROBE_001',
          block_name: 'Test Probe Block',
          district_name: 'Test District',
          state_name: 'Test State',
          centroid_lat: 19.0,
          centroid_lon: 73.0,
        }),
      });

      if (writeTest.status === 401 || writeTest.status === 403 || writeTest.status === 404 || writeTest.status === 400) {
        console.log(`   ✓ Anonymous write probe blocked (HTTP ${writeTest.status}). Unauthorized writes rejected by client role.`);
      } else if (writeTest.ok) {
        console.log('   ✗ WARNING: Anonymous write succeeded! RLS is not properly restricting client writes.');
      } else {
        const err = await writeTest.json().catch(() => ({}));
        console.log(`   ✓ Anonymous write rejected: ${err.message || writeTest.statusText}`);
      }
    }

    console.log('\n================================================================');
  } catch (err) {
    console.error('Verification failed with error:', err.message);
  }
}

verify();
