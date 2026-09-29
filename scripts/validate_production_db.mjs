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

  // 9. Phase C Meteorological Data Foundation Validations
  console.log("\n--- PHASE C METEOROLOGICAL DATA VALIDATIONS ---");

  // A. Teleconnections History Integrity
  const tele = await fetchAll('teleconnections_history', 'observation_date,enso_oni,iod_dmi,mjo_phase,mjo_amplitude,source_agency');
  console.log(`Total teleconnections_history records: ${tele.length}`);
  const teleDateCounts = {};
  for (const t of tele) {
    teleDateCounts[t.observation_date] = (teleDateCounts[t.observation_date] || 0) + 1;
  }
  const duplicateTeleDates = Object.entries(teleDateCounts).filter(([, count]) => count > 1);
  console.log(`Duplicate teleconnection observation dates: ${duplicateTeleDates.length}`);

  const invalidTeleValues = tele.filter(t => {
    if (t.enso_oni !== null && (t.enso_oni < -4.0 || t.enso_oni > 4.0)) return true;
    if (t.iod_dmi !== null && (t.iod_dmi < -3.0 || t.iod_dmi > 3.0)) return true;
    if (t.mjo_phase !== null && (t.mjo_phase < 1 || t.mjo_phase > 8)) return true;
    if (t.mjo_amplitude !== null && (t.mjo_amplitude < 0.0 || t.mjo_amplitude > 10.0)) return true;
    return false;
  });
  console.log(`Invalid teleconnection values out of range: ${invalidTeleValues.length}`);

  // B. Seasonal Archives Validation
  const seasonalRows = await fetchAll('seasonal_archives', 'id,block_id,season_year,rainfall_x10,max_temp_x10,soil_moisture_idx,weather_state_code');
  console.log(`Total seasonal_archives records: ${seasonalRows.length}`);

  const seasonalKeyCounts = {};
  let arrayLengthViolations = 0;
  let constantSeriesViolations = 0;
  for (const s of seasonalRows) {
    const key = `${s.block_id}_${s.season_year}`;
    seasonalKeyCounts[key] = (seasonalKeyCounts[key] || 0) + 1;

    if (
      !Array.isArray(s.rainfall_x10) || s.rainfall_x10.length !== 214 ||
      !Array.isArray(s.max_temp_x10) || s.max_temp_x10.length !== 214 ||
      !Array.isArray(s.soil_moisture_idx) || s.soil_moisture_idx.length !== 214 ||
      !Array.isArray(s.weather_state_code) || s.weather_state_code.length !== 214
    ) {
      arrayLengthViolations++;
    }

    // Meteorological realism check: Temperature in India across 214 days cannot be constant
    const uniqueTemps = new Set(s.max_temp_x10);
    if (uniqueTemps.size < 15) {
      constantSeriesViolations++;
    }
  }
  const duplicateSeasonalKeys = Object.entries(seasonalKeyCounts).filter(([, count]) => count > 1);
  console.log(`Duplicate (block_id, season_year) pairs in archives: ${duplicateSeasonalKeys.length}`);
  console.log(`Arrays with length != 214 elements: ${arrayLengthViolations}`);
  console.log(`Suspicious constant unvarying temperature series: ${constantSeriesViolations}`);

  // C. Live Weather Buffer & Retention Window
  const liveRows = await fetchAll('live_weather_buffer', 'block_id,observation_date,rainfall_mm,max_temp_c,min_temp_c,soil_moisture_idx,data_source');
  console.log(`Total live_weather_buffer records: ${liveRows.length}`);

  const today = new Date();
  let bufferAgeViolations = 0;
  let invalidLiveBufferValues = 0;
  for (const row of liveRows) {
    const obsDate = new Date(row.observation_date);
    const diffDays = Math.floor((today - obsDate) / (1000 * 60 * 60 * 24));
    if (diffDays > 90) {
      bufferAgeViolations++;
    }
    if (row.rainfall_mm < 0 || row.rainfall_mm > 2000) invalidLiveBufferValues++;
    if (row.max_temp_c !== null && (row.max_temp_c < -50 || row.max_temp_c > 65)) invalidLiveBufferValues++;
    if (row.min_temp_c !== null && (row.min_temp_c < -60 || row.min_temp_c > 50)) invalidLiveBufferValues++;
    if (row.max_temp_c !== null && row.min_temp_c !== null && row.min_temp_c > row.max_temp_c) invalidLiveBufferValues++;
    if (row.soil_moisture_idx !== null && (row.soil_moisture_idx < 0 || row.soil_moisture_idx > 100)) invalidLiveBufferValues++;
  }
  console.log(`Live buffer records older than 90 days: ${bufferAgeViolations}`);
  console.log(`Physically impossible live buffer weather values: ${invalidLiveBufferValues}`);

  // D. Orphan Check and 250 Pending Blocks Exclusion Check
  const prodBlockIdSet = new Set(blocks.map(b => String(b.block_id)));

  // Load pending blocks from phase A master if available
  let pendingBlockIds = new Set();
  try {
    const masterCsv = fs.readFileSync('data/phase_a_block_master.csv', 'utf-8');
    const lines = masterCsv.split('\n');
    const header = lines[0].split(',');
    const idIdx = header.indexOf('block_id');
    const statusIdx = header.indexOf('spatial_match_status');
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts[statusIdx] === 'PENDING_OFFICIAL_BOUNDARY_MATCH') {
        pendingBlockIds.add(String(parts[idIdx]));
      }
    }
  } catch (err) {
    console.warn("Could not read phase_a_block_master.csv to extract pending IDs:", err.message);
  }
  console.log(`Authoritative pending blocks identified: ${pendingBlockIds.size}`);

  const orphanSeasonalBlocks = seasonalRows.filter(s => !prodBlockIdSet.has(String(s.block_id)));
  const orphanLiveBlocks = liveRows.filter(l => !prodBlockIdSet.has(String(l.block_id)));
  console.log(`Orphan block IDs in seasonal archives: ${orphanSeasonalBlocks.length}`);
  console.log(`Orphan block IDs in live weather buffer: ${orphanLiveBlocks.length}`);

  const pendingInSeasonal = seasonalRows.filter(s => pendingBlockIds.has(String(s.block_id)));
  const pendingInLive = liveRows.filter(l => pendingBlockIds.has(String(l.block_id)));
  console.log(`Pending blocks in seasonal archives: ${pendingInSeasonal.length}`);
  console.log(`Pending blocks in live weather buffer: ${pendingInLive.length}`);

  // Exact Task 7 Coverage Calculations from Actual Database Counts
  const distinctSeasonalBlockIds = new Set(seasonalRows.map(s => String(s.block_id)));
  const seasonalYearsCovered = [...new Set(seasonalRows.map(s => s.season_year))].sort((a, b) => a - b);
  const distinctLiveBlockIds = new Set(liveRows.map(l => String(l.block_id)));
  const distinctTeleDates = new Set(tele.map(t => t.observation_date));

  const seasonsPerBlock = {};
  for (const s of seasonalRows) {
    const bId = String(s.block_id);
    seasonsPerBlock[bId] = (seasonsPerBlock[bId] || 0) + 1;
  }
  const fullyCoveredBlocks = Object.values(seasonsPerBlock).filter(count => count === 12).length;

  console.log("\n--- PHASE C EXACT COVERAGE REPORT ---");
  console.log(`historical_block_coverage: ${distinctSeasonalBlockIds.size}/${blocks.length} (${((distinctSeasonalBlockIds.size / blocks.length) * 100).toFixed(2)}%)`);
  console.log(`historical_block_season_rows: ${seasonalRows.length}`);
  console.log(`season_year coverage: [${seasonalYearsCovered.join(', ')}] (${seasonalYearsCovered.length} seasons)`);
  console.log(`live_weather_block_coverage: ${distinctLiveBlockIds.size}/${blocks.length} (${((distinctLiveBlockIds.size / blocks.length) * 100).toFixed(2)}%)`);
  console.log(`teleconnection_date_coverage: ${distinctTeleDates.size} dates (${tele.length} total rows)`);
  console.log(`fully_covered_12_season_blocks: ${fullyCoveredBlocks}`);

  console.log("\n--- COMPLETE PRODUCTION VALIDATION SUMMARY ---");
  console.log(`Condition (total blocks == 7073): ${blocks.length === 7073 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (no duplicate blocks): ${duplicates.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (no null block fields): ${missingName.length === 0 && missingDistrict.length === 0 && missingState.length === 0 && missingLat.length === 0 && missingLon.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (valid bounds): ${outOfBounds.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (legacy IND_* purged from all tables): ${legacyFound.length === 0 && legacyPreds.length === 0 && legacyBuffer.length === 0 && legacyArchives.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (all 7073 MultiPolygon boundaries): ${validBoundaries.length === 7073 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (all 7073 elevation_m valid): ${validElevations.length === 7073 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (all 7073 slope_deg valid): ${validSlopes.length === 7073 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (all 7073 distance_to_coast_km valid): ${validCoastDists.length === 7073 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (all 7073 agro_climatic_zone valid): ${validACZ.length === 7073 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (teleconnections unique dates): ${duplicateTeleDates.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (teleconnections value ranges valid): ${invalidTeleValues.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (seasonal archives unique per block/year): ${duplicateSeasonalKeys.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (seasonal arrays exactly 214 elements): ${arrayLengthViolations === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (seasonal series meteorological variance): ${constantSeriesViolations === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (live buffer <= 90 days retention): ${bufferAgeViolations === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (live buffer weather values physically valid): ${invalidLiveBufferValues === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (zero orphan weather blocks): ${orphanSeasonalBlocks.length === 0 && orphanLiveBlocks.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Condition (zero pending blocks in weather data): ${pendingInSeasonal.length === 0 && pendingInLive.length === 0 ? 'PASS' : 'FAIL'}`);
}

main().catch(console.error);

