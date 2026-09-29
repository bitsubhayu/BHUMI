import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envText.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
  }
});

const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '');
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function fetchAll(table, select) {
  let all = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const res = await fetch(`${baseUrl}/rest/v1/${table}?select=${select}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${offset}-${offset + pageSize - 1}`,
        'Range-Unit': 'items',
        Prefer: 'count=exact'
      }
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Fetch failed: ${res.statusText}`);
    }
    const rows = await res.json();
    if (!rows || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
  return all;
}

async function main() {
  console.log("=== INDEPENDENT SUPABASE POSTGREST VALIDATION ===");
  
  // 1. Fetch all blocks
  console.log("Fetching all blocks from Supabase via PostgREST...");
  const blocks = await fetchAll('blocks', 'block_id,block_name,district_name,state_name,centroid_lat,centroid_lon');
  console.log(`Total blocks retrieved: ${blocks.length}`);

  // 2. Distinct states & districts
  const states = new Set(blocks.map(b => b.state_name));
  const districts = new Set(blocks.map(b => `${b.state_name}:${b.district_name}`));
  console.log(`Distinct states/UTs: ${states.size}`);
  console.log(`Distinct districts: ${districts.size}`);

  // 3. Duplicate check
  const idCounts = {};
  for (const b of blocks) {
    idCounts[b.block_id] = (idCounts[b.block_id] || 0) + 1;
  }
  const duplicates = Object.entries(idCounts).filter(([, count]) => count > 1);
  console.log(`Duplicate block IDs: ${duplicates.length}`);

  // 4. Null required fields
  const missingName = blocks.filter(b => !b.block_name || b.block_name.trim() === '');
  const missingDistrict = blocks.filter(b => !b.district_name || b.district_name.trim() === '');
  const missingState = blocks.filter(b => !b.state_name || b.state_name.trim() === '');
  const missingLat = blocks.filter(b => b.centroid_lat === null || b.centroid_lat === undefined || isNaN(b.centroid_lat));
  const missingLon = blocks.filter(b => b.centroid_lon === null || b.centroid_lon === undefined || isNaN(b.centroid_lon));

  console.log(`Missing block_name: ${missingName.length}`);
  console.log(`Missing district_name: ${missingDistrict.length}`);
  console.log(`Missing state_name: ${missingState.length}`);
  console.log(`Missing centroid_lat: ${missingLat.length}`);
  console.log(`Missing centroid_lon: ${missingLon.length}`);

  // 5. Invalid lat/lon bounds
  const outOfBounds = blocks.filter(b => b.centroid_lat < 6.0 || b.centroid_lat > 38.5 || b.centroid_lon < 68.0 || b.centroid_lon > 97.5);
  console.log(`Coordinates out of India bounding box: ${outOfBounds.length}`);

  // 6. Legacy sample records check
  const legacyIds = ['IND_MH_PUN_001', 'IND_RJ_JOD_001', 'IND_RJ_JOD_002', 'IND_WB_KOL_003'];
  const legacyFound = blocks.filter(b => legacyIds.includes(b.block_id));
  console.log(`Legacy sample IDs present in public.blocks: ${legacyFound.length}`);

  // 7. Verify migrated foreign keys
  const preds = await fetchAll('live_predictions', 'id,block_id,prediction_date');
  console.log(`Total live_predictions rows: ${preds.length}`);
  const legacyPreds = preds.filter(p => legacyIds.includes(p.block_id));
  console.log(`Predictions with legacy IDs: ${legacyPreds.length}`);
  
  const buffer = await fetchAll('live_weather_buffer', 'block_id,observation_date');
  console.log(`Total live_weather_buffer rows: ${buffer.length}`);
  const legacyBuffer = buffer.filter(b => legacyIds.includes(b.block_id));
  console.log(`Weather buffer with legacy IDs: ${legacyBuffer.length}`);

  const archives = await fetchAll('seasonal_archives', 'id,block_id,season_year');
  console.log(`Total seasonal_archives rows: ${archives.length}`);
  const legacyArchives = archives.filter(a => legacyIds.includes(a.block_id));
  console.log(`Seasonal archives with legacy IDs: ${legacyArchives.length}`);

  // 8. Phase B Boundary & Terrain Validations
  console.log("\n--- PHASE B BOUNDARY & TERRAIN VALIDATIONS ---");
  const sampleBlocks = await fetchAll('blocks', 'block_id,elevation_m,slope_deg,distance_to_coast_km,agro_climatic_zone,boundary_geom');
  const validBoundaries = sampleBlocks.filter(b => b.boundary_geom && b.boundary_geom.type === 'MultiPolygon' && b.boundary_geom.coordinates?.length > 0);
  console.log(`Blocks with valid MultiPolygon boundary_geom: ${validBoundaries.length}/${sampleBlocks.length}`);

  const validElevations = sampleBlocks.filter(b => b.elevation_m !== null && !isNaN(b.elevation_m) && b.elevation_m >= -500 && b.elevation_m <= 9000);
  console.log(`Blocks with valid elevation_m [-500, 9000m]: ${validElevations.length}/${sampleBlocks.length}`);

  const validSlopes = sampleBlocks.filter(b => b.slope_deg !== null && !isNaN(b.slope_deg) && b.slope_deg >= 0 && b.slope_deg <= 90);
  console.log(`Blocks with valid slope_deg [0, 90°]: ${validSlopes.length}/${sampleBlocks.length}`);

  const validCoastDists = sampleBlocks.filter(b => b.distance_to_coast_km !== null && !isNaN(b.distance_to_coast_km) && b.distance_to_coast_km >= 0 && b.distance_to_coast_km <= 5000);
  console.log(`Blocks with valid distance_to_coast_km [0, 5000km]: ${validCoastDists.length}/${sampleBlocks.length}`);

  const validACZ = sampleBlocks.filter(b => b.agro_climatic_zone && typeof b.agro_climatic_zone === 'string' && b.agro_climatic_zone.length > 0);
  console.log(`Blocks with valid agro_climatic_zone: ${validACZ.length}/${sampleBlocks.length}`);

  console.log("\n--- VALIDATION SUMMARY ---");
  console.log(`Total Valid Blocks in Supabase: ${blocks.length}`);
  console.log(`Condition (total == 7073): ${blocks.length === 7073 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (no duplicates): ${duplicates.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (no nulls): ${missingName.length === 0 && missingDistrict.length === 0 && missingState.length === 0 && missingLat.length === 0 && missingLon.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (valid bounds): ${outOfBounds.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (legacy IDs purged): ${legacyFound.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (all 7073 MultiPolygon boundaries): ${validBoundaries.length === 7073 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (all 7073 elevation_m valid): ${validElevations.length === 7073 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (all 7073 slope_deg valid): ${validSlopes.length === 7073 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (all 7073 distance_to_coast_km valid): ${validCoastDists.length === 7073 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (all 7073 agro_climatic_zone valid): ${validACZ.length === 7073 ? 'PASS' : 'FAIL'}`);
}

main().catch(console.error);
