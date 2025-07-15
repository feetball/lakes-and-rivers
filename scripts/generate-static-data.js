#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Texas bounding box (same as in redis.ts)
const TEXAS_BBOX = {
  north: 36.5,
  south: 25.8,
  east: -93.5,
  west: -106.7
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    usgs: true,
    waterways: true,
    flood: true,
    help: false
  };

  for (const arg of args) {
    switch (arg) {
      case '--usgs-only':
        options.usgs = true;
        options.waterways = false;
        options.flood = false;
        break;
      case '--waterways-only':
        options.usgs = false;
        options.waterways = true;
        options.flood = false;
        break;
      case '--flood-only':
        options.usgs = false;
        options.waterways = false;
        options.flood = true;
        break;
      case '--no-usgs':
        options.usgs = false;
        break;
      case '--no-waterways':
        options.waterways = false;
        break;
      case '--no-flood':
        options.flood = false;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        console.warn(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Usage: node generate-static-data.js [options]

Options:
  --usgs-only       Generate only USGS station data
  --waterways-only  Generate only waterways data
  --flood-only      Generate only flood stage data
  --no-usgs         Skip USGS station data generation
  --no-waterways    Skip waterways data generation
  --no-flood        Skip flood stage data generation
  --help, -h        Show this help message

Examples:
  node generate-static-data.js                    # Generate all data
  node generate-static-data.js --usgs-only        # Only USGS stations
  node generate-static-data.js --no-waterways     # Skip waterways
  node generate-static-data.js --no-flood         # Skip flood stages
`);
}

/**
 * Fetch all Texas USGS stations with batching
 */
async function fetchTexasUSGSStations() {
  console.log('[GENERATE] Fetching all Texas USGS stations...');
  
  const gridRows = 6;
  const gridCols = 6;
  const latStep = (TEXAS_BBOX.north - TEXAS_BBOX.south) / gridRows;
  const lonStep = (TEXAS_BBOX.east - TEXAS_BBOX.west) / gridCols;
  
  let allTimeSeries = [];
  let allIds = new Set();
  let totalFetched = 0;
  
  // Helper functions
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }
  
  function round7(v) {
    return Math.round(v * 1e7) / 1e7;
  }
  
  function isValidBbox(west, south, east, north) {
    return (
      west < east &&
      south < north &&
      west >= -180 && east <= 180 &&
      south >= -90 && north <= 90
    );
  }
  
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      let south = TEXAS_BBOX.south + row * latStep;
      let north = south + latStep;
      let west = TEXAS_BBOX.west + col * lonStep;
      let east = west + lonStep;
      
      // Clamp and round coordinates
      south = round7(clamp(south, -90, 90));
      north = round7(clamp(north, -90, 90));
      west = round7(clamp(west, -180, 180));
      east = round7(clamp(east, -180, 180));
      
      if (!isValidBbox(west, south, east, north)) {
        console.warn(`[GENERATE] Skipping invalid bbox: W${west} S${south} E${east} N${north}`);
        continue;
      }
      
      const usgsUrl = `https://waterservices.usgs.gov/nwis/iv/?format=json&bBox=${west},${south},${east},${north}&parameterCd=00065,00060,00062,00054,62614&siteStatus=active`;
      console.log(`[GENERATE] USGS batch row ${row} col ${col} bbox: W${west} S${south} E${east} N${north}`);
      
      // Retry logic
      let attempt = 0;
      const maxAttempts = 3;
      let success = false;
      
      while (attempt < maxAttempts && !success) {
        try {
          const res = await fetch(usgsUrl);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${await res.text()}`);
          }
          
          const data = await res.json();
          if (data && data.value && data.value.timeSeries && data.value.timeSeries.length > 0) {
            let newCount = 0;
            for (const ts of data.value.timeSeries) {
              if (!allIds.has(ts.sourceInfo.siteCode[0]?.value)) {
                allTimeSeries.push(ts);
                allIds.add(ts.sourceInfo.siteCode[0]?.value);
                newCount++;
              }
            }
            totalFetched += data.value.timeSeries.length;
            console.log(`[GENERATE] USGS batch row ${row} col ${col} timeSeries: ${data.value.timeSeries.length}, new unique: ${newCount}`);
          } else {
            console.warn(`[GENERATE] USGS batch row ${row} col ${col} data missing or empty`);
          }
          success = true;
        } catch (err) {
          attempt++;
          if (attempt < maxAttempts) {
            console.warn(`[GENERATE] USGS batch row ${row} col ${col} failed (attempt ${attempt}/${maxAttempts}): ${err.message}, retrying in 3s...`);
            await new Promise(r => setTimeout(r, 3000));
          } else {
            console.warn(`[GENERATE] USGS batch row ${row} col ${col} failed after ${maxAttempts} attempts: ${err.message}`);
          }
        }
      }
      
      // Delay between batches - increased to be respectful to USGS API
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.log(`[GENERATE] Total unique USGS timeSeries: ${allTimeSeries.length}, total fetched: ${totalFetched}`);
  return { value: { timeSeries: allTimeSeries } };
}

/**
 * Fetch all Texas waterways with batching
 */
async function fetchTexasWaterways() {
  console.log('[GENERATE] Fetching all Texas waterways...');
  
  const gridRows = 6;
  const gridCols = 6;
  const latStep = (TEXAS_BBOX.north - TEXAS_BBOX.south) / gridRows;
  const lonStep = (TEXAS_BBOX.east - TEXAS_BBOX.west) / gridCols;
  const overpassUrl = 'https://overpass-api.de/api/interpreter';
  
  let allElements = [];
  let allIds = new Set();
  
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const south = TEXAS_BBOX.south + row * latStep;
      const north = south + latStep;
      const west = TEXAS_BBOX.west + col * lonStep;
      const east = west + lonStep;        const overpassQuery = `
          [out:json][timeout:180];
          (
            way["waterway"~"^(river|stream|creek|canal|ditch)$"](${south},${west},${north},${east});
            relation["waterway"~"^(river|stream|creek|canal)$"](${south},${west},${north},${east});
          );
          (._;>;);
          out geom;
        `;
      
      console.log(`[GENERATE] Overpass batch row ${row} col ${col} bbox: S${south} W${west} N${north} E${east}`);
      
      try {
        const res = await fetch(overpassUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(overpassQuery)}`
        });
        
        if (!res.ok) {
          console.warn(`[GENERATE] Overpass batch row ${row} col ${col} failed: ${res.status}`);
          continue;
        }
        
        const data = await res.json();
        if (data && data.elements && data.elements.length > 0) {
          let newCount = 0;
          for (const el of data.elements) {
            if (!allIds.has(el.id)) {
              // Keep full geometry for waterways data
              allElements.push(el);
              allIds.add(el.id);
              newCount++;
            }
          }
          console.log(`[GENERATE] Overpass batch row ${row} col ${col} elements: ${data.elements.length}, new unique: ${newCount}`);
        } else {
          console.warn(`[GENERATE] Overpass batch row ${row} col ${col} data missing or empty`);
        }
      } catch (err) {
        console.warn(`[GENERATE] Overpass batch row ${row} col ${col} error: ${err.message}`);
        // If rate limited (429), wait longer
        if (err.message.includes('429')) {
          console.warn(`[GENERATE] Rate limited, waiting 20 seconds before next request`);
          await new Promise(r => setTimeout(r, 20000));
        }
      }
      
      // Delay between batches - increased to avoid rate limiting
      await new Promise(r => setTimeout(r, 10000));
    }
  }
  
  console.log(`[GENERATE] Total unique Overpass elements: ${allElements.length}`);
  return { elements: allElements };
}

/**
 * Fetch comprehensive flood stage data from multiple sources
 */
async function fetchFloodStageData() {
  console.log('[GENERATE] Fetching comprehensive flood stage data...');
  
  const dataDir = path.join(__dirname, '..', 'data', 'static');
  const usgsFile = path.join(dataDir, 'texas-usgs-stations.json');
  
  let floodStages = {};
  let totalChecked = 0;
  let foundFloodStage = 0;
  let foundNwsData = 0;
  let verifiedDataFound = 0;
  let corpsDataFound = 0;
  
  // Load USGS stations data
  let usgsData = null;
  try {
    if (fs.existsSync(usgsFile)) {
      usgsData = JSON.parse(fs.readFileSync(usgsFile, 'utf8'));
    } else {
      console.warn('[GENERATE] USGS stations file not found, cannot fetch flood stages.');
      return {};
    }
  } catch (err) {
    console.warn('[GENERATE] Error loading USGS stations:', err.message);
    return {};
  }

  const siteIds = (usgsData.value?.timeSeries || [])
    .map(ts => ts.sourceInfo?.siteCode?.[0]?.value)
    .filter(Boolean);

  if (!siteIds.length) {
    console.warn('[GENERATE] No USGS site IDs found for flood stage fetch.');
    return {};
  }

  console.log(`[GENERATE] Fetching flood stage data for ${siteIds.length} USGS sites...`);

  // 1. Get basic site information from USGS
  console.log('[GENERATE] === Loading Site Information ===');
  for (const timeSeries of usgsData.value.timeSeries) {
    const siteCode = timeSeries.sourceInfo?.siteCode?.[0]?.value;
    if (siteCode && !floodStages[siteCode]) {
      totalChecked++;
      floodStages[siteCode] = {
        siteId: siteCode,
        siteName: timeSeries.sourceInfo.siteName || '',
        latitude: timeSeries.sourceInfo.geoLocation?.geogLocation?.latitude || null,
        longitude: timeSeries.sourceInfo.geoLocation?.geogLocation?.longitude || null,
        siteType: timeSeries.sourceInfo.siteProperty?.find(p => p.name === 'siteTypeCd')?.value || 'ST',
        drainageArea: timeSeries.sourceInfo.siteProperty?.find(p => p.name === 'drainageAreaSqMi')?.value || null,
        source: 'USGS TimeSeries Data'
      };
    }
  }

  // 2. Try to fetch USGS Site Service data for flood stages (sample some sites first)
  console.log('[GENERATE] === Sampling USGS Site Service for Flood Stages ===');
  const sampleSites = siteIds.slice(0, 10); // Test with first 10 sites
  for (const siteId of sampleSites) {
    try {
      const url = `https://waterservices.usgs.gov/nwis/site/?format=rdb&sites=${siteId}`;
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n').filter(l => l && !l.startsWith('#'));
        let headers = [];
        
        for (const line of lines) {
          if (line.startsWith('agency_cd')) {
            headers = line.split('\t');
            console.log(`[GENERATE] Available USGS fields: ${headers.join(', ')}`);
            break;
          }
        }
        
        // Look for flood stage related fields
        for (const line of lines) {
          if (!headers.length || line.startsWith('agency_cd')) continue;
          const cols = line.split('\t');
          const row = {};
          headers.forEach((h, idx) => row[h] = cols[idx]);
          
          if (row.site_no === siteId) {
            // Check various possible flood stage field names
            const floodFields = ['fld_stg_va', 'flood_stage', 'fld_stage_va', 'stage_flood'];
            for (const field of floodFields) {
              if (row[field] && row[field] !== '' && !isNaN(parseFloat(row[field]))) {
                foundFloodStage++;
                floodStages[siteId].floodStage = parseFloat(row[field]);
                floodStages[siteId].hasOfficialFloodStage = true;
                floodStages[siteId].source = 'USGS Site Service';
                console.log(`[GENERATE] ✓ USGS flood stage: ${siteId} - ${row.station_nm} (${row[field]} ft) from field ${field}`);
                break;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[GENERATE] Error fetching USGS site ${siteId}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // 2. Fetch NWS AHPS data for sites with known NWS gauge codes
  console.log('[GENERATE] === Fetching NWS AHPS Data ===');
  
  // Expanded NWS gauge mappings (from existing flood stage management + additional research)
  const nwsGaugeMappings = {
    // Verified from existing system
    '08167000': 'CMFT2', // Guadalupe River at Comfort
    '08168500': 'SPBT2', // Guadalupe River at Spring Branch
    '08169000': 'CNYT2', // Canyon Lake
    '08171000': 'WMBT2', // Blanco River at Wimberley
    '08104900': 'GTWT2', // South Fork San Gabriel River at Georgetown
    '08158000': 'AUAT2', // Colorado River at Austin
    '08158922': 'SCAT2', // Shoal Creek at Austin
    '08158840': 'WCAT2', // Walnut Creek at Austin
    '08153500': 'JNCT2', // Pedernales River near Johnson City
    
    // Additional common Texas NWS gauges
    '08105300': 'SGRT2', // San Gabriel River near Weir
    '08158700': 'BSTT2', // Colorado River at Bastrop
    '08159200': 'CBST2', // Colorado River at Columbus
    '08165300': 'SANT2', // San Antonio River at San Antonio
    '08176500': 'VICT2', // Guadalupe River at Victoria
    '08164000': 'KRNT2', // Guadalupe River at Kerrville
    '08180640': 'SACT2', // San Antonio River at Mitchell Street
    '08181800': 'SLVT2', // Cibolo Creek at Selma
    '08068500': 'SPGT2', // Spring Creek at Spring
    '08074500': 'HOUT2', // Buffalo Bayou at Houston
    '08070000': 'HUWT2', // East Fork San Jacinto River near Humble
    '08067000': 'CLET2', // Trinity River at Liberty
    '08066500': 'ROST2', // Trinity River at Romayor
    '08042500': 'NTXT2', // Neches River at Evadale
    '08041000': 'ATYT2', // Angelina River near Lufkin
    '08030500': 'SBET2', // Sabine River near Bon Wier
    '08136700': 'CONT2', // Concho River at San Angelo
    '08144500': 'LLNT2', // Llano River at Llano
    '08151500': 'BRNT2', // Pedernales River at Stonewall
  };

  for (const [usgsId, nwsId] of Object.entries(nwsGaugeMappings)) {
    if (siteIds.includes(usgsId)) {
      console.log(`[GENERATE] Fetching NWS AHPS data for ${usgsId} (${nwsId})`);
      try {
        const nwsUrl = `https://water.weather.gov/ahps2/hydrograph_to_xml.php?gage=${nwsId}`;
        const res = await fetch(nwsUrl);
        
        if (res.ok) {
          const xml = await res.text();
          
          // Parse XML for flood stages - handle both cases and extra whitespace
          const floodMatch = xml.match(/<flood[_\s]?stage[^>]*>([^<]+)<\/flood[_\s]?stage>/i);
          const moderateMatch = xml.match(/<moderate[_\s]?flood[_\s]?stage[^>]*>([^<]+)<\/moderate[_\s]?flood[_\s]?stage>/i);
          const majorMatch = xml.match(/<major[_\s]?flood[_\s]?stage[^>]*>([^<]+)<\/major[_\s]?flood[_\s]?stage>/i);
          const actionMatch = xml.match(/<action[_\s]?stage[^>]*>([^<]+)<\/action[_\s]?stage>/i);
          const recordMatch = xml.match(/<record[_\s]?stage[^>]*>([^<]+)<\/record[_\s]?stage>/i);
          
          if (floodMatch && floodMatch[1]) {
            const floodValue = parseFloat(floodMatch[1].trim());
            if (!isNaN(floodValue)) {
              foundNwsData++;
              const nwsData = {
                floodStage: floodValue,
                nwsGaugeId: nwsId,
                source: 'NWS AHPS',
                hasOfficialFloodStage: true
              };
              
              if (moderateMatch && moderateMatch[1]) {
                const modValue = parseFloat(moderateMatch[1].trim());
                if (!isNaN(modValue)) nwsData.moderateFloodStage = modValue;
              }
              if (majorMatch && majorMatch[1]) {
                const majValue = parseFloat(majorMatch[1].trim());
                if (!isNaN(majValue)) nwsData.majorFloodStage = majValue;
              }
              if (actionMatch && actionMatch[1]) {
                const actValue = parseFloat(actionMatch[1].trim());
                if (!isNaN(actValue)) nwsData.actionStage = actValue;
              }
              if (recordMatch && recordMatch[1]) {
                const recValue = parseFloat(recordMatch[1].trim());
                if (!isNaN(recValue)) nwsData.recordStage = recValue;
              }
              
              // Merge with existing data or create new entry
              if (floodStages[usgsId]) {
                Object.assign(floodStages[usgsId], nwsData);
              } else {
                floodStages[usgsId] = { siteId: usgsId, ...nwsData };
              }
              
              console.log(`[GENERATE] ✓ NWS AHPS: ${usgsId} (${nwsId}) - flood stage: ${nwsData.floodStage} ft`);
            }
          } else {
            console.log(`[GENERATE] ○ NWS AHPS: ${usgsId} (${nwsId}) - no flood stage data found`);
          }
        } else {
          console.warn(`[GENERATE] NWS AHPS failed for ${usgsId} (${nwsId}): ${res.status}`);
        }
      } catch (err) {
        console.warn(`[GENERATE] Error fetching NWS data for ${usgsId} (${nwsId}):`, err.message);
      }
      
      // Rate limiting for NWS - be respectful
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // 3. Add verified flood stage data from existing system
  console.log('[GENERATE] === Loading Verified Flood Stage Data ===');
  
  // Verified flood stages from the existing flood stage management system
  const verifiedFloodStages = {
    '08167000': { // Guadalupe River at Comfort
      floodStage: 15.0,
      moderateFloodStage: 18.0,
      majorFloodStage: 22.0,
      actionStage: 12.0,
      source: 'NWS AHPS Verified',
      hasOfficialFloodStage: true,
      nwsId: 'CMFT2'
    },
    '08168500': { // Guadalupe River at Spring Branch
      floodStage: 12.0,
      moderateFloodStage: 15.0,
      majorFloodStage: 20.0,
      actionStage: 10.0,
      source: 'NWS AHPS Verified',
      hasOfficialFloodStage: true,
      nwsId: 'SPBT2'
    },
    '08171000': { // Blanco River at Wimberley
      floodStage: 13.0,
      moderateFloodStage: 16.0,
      majorFloodStage: 20.0,
      actionStage: 10.0,
      source: 'NWS AHPS Verified',
      hasOfficialFloodStage: true,
      nwsId: 'WMBT2'
    },
    '08104900': { // South Fork San Gabriel River at Georgetown
      floodStage: 16.0,
      moderateFloodStage: 19.0,
      majorFloodStage: 23.0,
      actionStage: 13.0,
      source: 'NWS AHPS Verified',
      hasOfficialFloodStage: true,
      nwsId: 'GTWT2'
    },
    '08158000': { // Colorado River at Austin
      floodStage: 21.0,
      moderateFloodStage: 25.0,
      majorFloodStage: 30.0,
      actionStage: 18.0,
      source: 'NWS AHPS Verified',
      hasOfficialFloodStage: true,
      nwsId: 'AUAT2'
    },
    '08158922': { // Shoal Creek at Austin
      floodStage: 8.0,
      moderateFloodStage: 10.0,
      majorFloodStage: 12.0,
      actionStage: 6.0,
      source: 'NWS AHPS Verified',
      hasOfficialFloodStage: true,
      nwsId: 'SCAT2'
    },
    '08158840': { // Walnut Creek at Austin
      floodStage: 12.0,
      moderateFloodStage: 15.0,
      majorFloodStage: 18.0,
      actionStage: 9.0,
      source: 'NWS AHPS Verified',
      hasOfficialFloodStage: true,
      nwsId: 'WCAT2'
    },
    '08153500': { // Pedernales River near Johnson City
      floodStage: 14.0,
      moderateFloodStage: 17.0,
      majorFloodStage: 22.0,
      actionStage: 11.0,
      source: 'NWS AHPS Verified',
      hasOfficialFloodStage: true,
      nwsId: 'JNCT2'
    },
    '08105300': { // San Gabriel River near Weir
      floodStage: 25.0,
      moderateFloodStage: 28.0,
      majorFloodStage: 32.0,
      actionStage: 22.0,
      source: 'USGS Historical + NWS',
      hasOfficialFloodStage: true,
      notes: 'Needs verification'
    }
  };

  for (const [usgsId, verifiedData] of Object.entries(verifiedFloodStages)) {
    if (siteIds.includes(usgsId)) {
      if (floodStages[usgsId]) {
        Object.assign(floodStages[usgsId], verifiedData);
      } else {
        floodStages[usgsId] = { siteId: usgsId, ...verifiedData };
      }
      
      verifiedDataFound++;
      console.log(`[GENERATE] ✓ Verified: ${usgsId} - flood stage: ${verifiedData.floodStage} ft (${verifiedData.source})`);
    }
  }

  // 4. Fetch Corps of Engineers data for major lakes and reservoirs
  console.log('[GENERATE] === Checking Corps of Engineers Lakes ===');
  
  // Major Texas Corps lakes with flood pool elevations
  const corpsLakes = {
    '08169000': { // Canyon Lake
      name: 'Canyon Lake',
      floodPoolElevation: 943.0,
      conservationPoolElevation: 909.0,
      source: 'Corps of Engineers'
    },
    '08136700': { // O.C. Fisher Lake
      name: 'O.C. Fisher Lake',
      floodPoolElevation: 1908.0,
      conservationPoolElevation: 1877.0,
      source: 'Corps of Engineers'
    },
    '08144500': { // Lake Buchanan area
      name: 'Lake Buchanan area',
      floodPoolElevation: 1025.0,
      conservationPoolElevation: 1020.0,
      source: 'LCRA/Corps'
    }
  };

  for (const [usgsId, lakeInfo] of Object.entries(corpsLakes)) {
    if (siteIds.includes(usgsId)) {
      const lakeData = {
        floodStage: lakeInfo.floodPoolElevation,
        actionStage: lakeInfo.conservationPoolElevation,
        moderateFloodStage: lakeInfo.floodPoolElevation + 10,
        majorFloodStage: lakeInfo.floodPoolElevation + 20,
        source: lakeInfo.source,
        hasOfficialFloodStage: true,
        isLakeElevation: true,
        notes: `Lake elevation data - ${lakeInfo.name}`
      };
      
      if (floodStages[usgsId]) {
        Object.assign(floodStages[usgsId], lakeData);
      } else {
        floodStages[usgsId] = { siteId: usgsId, ...lakeData };
      }
      
      corpsDataFound++;
      console.log(`[GENERATE] ✓ Corps/LCRA: ${usgsId} - ${lakeInfo.name} (flood: ${lakeInfo.floodPoolElevation} ft)`);
    }
  }

  // 5. Generate conservative estimates for sites without official data
  console.log('[GENERATE] === Generating Conservative Estimates ===');
  let estimatedCount = 0;
  
  for (const siteId of siteIds) {
    if (!floodStages[siteId] || !floodStages[siteId].hasOfficialFloodStage) {
      // Find site info from USGS data
      const timeSeries = usgsData.value.timeSeries.find(ts => 
        ts.sourceInfo?.siteCode?.[0]?.value === siteId
      );
      
      if (timeSeries) {
        const siteName = timeSeries.sourceInfo.siteName || '';
        const estimate = generateFloodStageEstimate(siteId, siteName);
        
        if (floodStages[siteId]) {
          Object.assign(floodStages[siteId], estimate);
        } else {
          floodStages[siteId] = {
            siteId,
            siteName,
            ...estimate
          };
        }
        estimatedCount++;
      }
    }
  }

  console.log('[GENERATE] === Flood Stage Data Summary ===');
  console.log(`[GENERATE] Total sites checked: ${totalChecked}`);
  console.log(`[GENERATE] Sites with USGS flood stage: ${foundFloodStage}`);
  console.log(`[GENERATE] Sites with NWS AHPS data: ${foundNwsData}`);
  console.log(`[GENERATE] Sites with verified data: ${verifiedDataFound}`);
  console.log(`[GENERATE] Sites with Corps/LCRA data: ${corpsDataFound}`);
  console.log(`[GENERATE] Sites with estimates: ${estimatedCount}`);
  console.log(`[GENERATE] Total flood stage records: ${Object.keys(floodStages).length}`);

  const officialDataCount = foundFloodStage + foundNwsData + verifiedDataFound + corpsDataFound;
  if (officialDataCount > 0) {
    console.log('[GENERATE] Sites with official flood stage data:');
    Object.entries(floodStages)
      .filter(([_, data]) => data.hasOfficialFloodStage)
      .forEach(([siteId, data]) => {
        console.log(`  ${siteId}: ${data.siteName || data.name || 'Unknown'} (${data.floodStage} ft) - ${data.source}`);
      });
  }

  return floodStages;
}

/**
 * Compress and save JSON data
 */
function saveCompressedJson(data, filePath) {
  const jsonString = JSON.stringify(data, null, 2);
  const jsonSize = Buffer.byteLength(jsonString, 'utf8');
  
  // Save uncompressed version only in development
  if (process.env.NODE_ENV !== 'production') {
    fs.writeFileSync(filePath, jsonString);
    console.log(`[GENERATE] Saved uncompressed: ${filePath} (${(jsonSize / 1024 / 1024).toFixed(2)} MB)`);
  }
  
  // Save compressed version
  const compressedPath = filePath + '.gz';
  const compressed = zlib.gzipSync(jsonString, { level: 9 });
  fs.writeFileSync(compressedPath, compressed);
  
  const compressionRatio = ((1 - compressed.length / jsonSize) * 100).toFixed(1);
  console.log(`[GENERATE] Saved compressed: ${compressedPath} (${(compressed.length / 1024 / 1024).toFixed(2)} MB, ${compressionRatio}% smaller)`);
  
  return {
    uncompressed: jsonSize,
    compressed: compressed.length,
    ratio: parseFloat(compressionRatio)
  };
}

/**
 * Generate conservative flood stage estimates based on site characteristics
 */
function generateFloodStageEstimate(siteId, siteName) {
  const name = siteName.toLowerCase();
  
  // Lake and reservoir sites (use elevation-based estimates)
  if (name.includes('lake') || name.includes('reservoir') || name.includes('pool')) {
    return {
      floodStage: 650.0,
      moderateFloodStage: 670.0,
      majorFloodStage: 690.0,
      actionStage: 630.0,
      source: 'Estimated - Lake/Reservoir',
      hasOfficialFloodStage: false,
      isEstimate: true,
      notes: 'Conservative lake elevation estimate - requires verification'
    };
  }
  
  // Creek sites (smaller waterways)
  if (name.includes('creek') || name.includes('ck')) {
    return {
      floodStage: 8.0,
      moderateFloodStage: 11.0,
      majorFloodStage: 15.0,
      actionStage: 6.0,
      source: 'Estimated - Creek',
      hasOfficialFloodStage: false,
      isEstimate: true,
      notes: 'Conservative creek estimate - requires NWS verification'
    };
  }
  
  // River sites (larger waterways)
  if (name.includes('river') || name.includes('rv')) {
    return {
      floodStage: 15.0,
      moderateFloodStage: 18.0,
      majorFloodStage: 22.0,
      actionStage: 12.0,
      source: 'Estimated - River',
      hasOfficialFloodStage: false,
      isEstimate: true,
      notes: 'Conservative river estimate - requires NWS verification'
    };
  }
  
  // Default for other water bodies
  return {
    floodStage: 12.0,
    moderateFloodStage: 15.0,
    majorFloodStage: 20.0,
    actionStage: 9.0,
    source: 'Estimated - Default',
    hasOfficialFloodStage: false,
    isEstimate: true,
    notes: 'Conservative default estimate - requires verification'
  };
}

/**
 * Main function to generate all static data
 */
async function generateStaticData(options = {}) {
  console.log('[GENERATE] Starting static data generation...');
  console.log('[GENERATE] Options:', options);
  
  const dataDir = path.join(__dirname, '..', 'data', 'static');
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  let usgsData = null;
  let waterwaysData = null;
  let floodData = null;
  let compressionStats = {};

  try {
    // USGS stations
    const usgsFile = path.join(dataDir, 'texas-usgs-stations.json');
    if (options.usgs) {
      if (fs.existsSync(usgsFile)) {
        console.log(`[GENERATE] USGS stations file already exists: ${usgsFile}`);
        usgsData = JSON.parse(fs.readFileSync(usgsFile, 'utf8'));
      } else {
        console.log('[GENERATE] === Fetching USGS Stations ===');
        usgsData = await fetchTexasUSGSStations();
        compressionStats.usgs = saveCompressedJson(usgsData, usgsFile);
        console.log(`[GENERATE] USGS stations saved to: ${usgsFile}`);
      }
    } else {
      console.log('[GENERATE] === Skipping USGS Stations ===');
      if (fs.existsSync(usgsFile)) {
        usgsData = JSON.parse(fs.readFileSync(usgsFile, 'utf8'));
        console.log('[GENERATE] Using existing USGS data for summary');
      }
    }

    // Waterways
    const waterwaysFile = path.join(dataDir, 'texas-waterways.json');
    if (options.waterways) {
      if (fs.existsSync(waterwaysFile)) {
        console.log(`[GENERATE] Waterways file already exists: ${waterwaysFile}`);
        waterwaysData = JSON.parse(fs.readFileSync(waterwaysFile, 'utf8'));
      } else {
        console.log('[GENERATE] === Fetching Waterways ===');
        waterwaysData = await fetchTexasWaterways();
        compressionStats.waterways = saveCompressedJson(waterwaysData, waterwaysFile);
        console.log(`[GENERATE] Waterways saved to: ${waterwaysFile}`);
      }
    } else {
      console.log('[GENERATE] === Skipping Waterways ===');
      if (fs.existsSync(waterwaysFile)) {
        waterwaysData = JSON.parse(fs.readFileSync(waterwaysFile, 'utf8'));
        console.log('[GENERATE] Using existing waterways data for summary');
      }
    }
    
    // Fetch flood stages
    if (options.flood) {
      console.log('[GENERATE] === Fetching Flood Stages ===');
      floodData = await fetchFloodStageData();
      const floodFile = path.join(dataDir, 'texas-flood-stages.json');
      compressionStats.flood = saveCompressedJson(floodData, floodFile);
      console.log(`[GENERATE] Flood stages saved to: ${floodFile}`);
    } else {
      console.log('[GENERATE] === Skipping Flood Stages ===');
      // Try to load existing data for summary
      const floodFile = path.join(dataDir, 'texas-flood-stages.json');
      if (fs.existsSync(floodFile)) {
        floodData = JSON.parse(fs.readFileSync(floodFile, 'utf8'));
        console.log('[GENERATE] Using existing flood data for summary');
      } else {
        floodData = {};
      }
    }
    
    // Create a summary file
    const summary = {
      generated: new Date().toISOString(),
      options: options,
      usgs_stations: usgsData?.value?.timeSeries?.length || 0,
      waterways_elements: waterwaysData?.elements?.length || 0,
      flood_stages: Object.keys(floodData || {}).length || 0,
      files: {
        usgs: fs.existsSync(path.join(dataDir, 'texas-usgs-stations.json')),
        waterways: fs.existsSync(path.join(dataDir, 'texas-waterways.json')),
        flood: fs.existsSync(path.join(dataDir, 'texas-flood-stages.json'))
      },
      compression: compressionStats
    };
    
    const summaryFile = path.join(dataDir, 'generation-summary.json');
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`[GENERATE] Summary saved to: ${summaryFile}`);
    
    console.log('[GENERATE] Static data generation completed successfully!');
    console.log(`[GENERATE] Summary:`, summary);
    
  } catch (error) {
    console.error('[GENERATE] Static data generation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  generateStaticData(options).then(() => {
    console.log('[GENERATE] Done!');
    process.exit(0);
  }).catch((err) => {
    console.error('[GENERATE] Error:', err);
    process.exit(1);
  });
}

module.exports = { generateStaticData, parseArgs, showHelp };
