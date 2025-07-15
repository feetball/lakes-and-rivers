const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const CONFIG = {
  // Texas bounding box
  TEXAS_BBOX: { north: 36.5, south: 25.8, east: -93.5, west: -106.7 },
  
  // Grid configuration for batching
  GRID_SIZE: 0.5, // degrees (about 35 miles at Texas latitude)
  
  // Output directory
  OUTPUT_DIR: path.join(__dirname, '..', 'static-data', 'waterways'),
  
  // Batch state file
  STATE_FILE: path.join(__dirname, '..', 'static-data', 'waterways-generation-state.json'),
  
  // Final combined file
  COMBINED_FILE: path.join(__dirname, '..', 'static-data', 'texas-waterways.json'),
  
  // Request delay to avoid overloading Overpass API
  REQUEST_DELAY: 2000, // 2 seconds between requests
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000, // 5 seconds
};

// Ensure output directory exists
function ensureOutputDir() {
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }
  
  const staticDataDir = path.dirname(CONFIG.OUTPUT_DIR);
  if (!fs.existsSync(staticDataDir)) {
    fs.mkdirSync(staticDataDir, { recursive: true });
  }
}

// Generate grid of bounding boxes covering Texas
function generateTexasGrid() {
  const boxes = [];
  const { north, south, east, west } = CONFIG.TEXAS_BBOX;
  
  let currentSouth = south;
  let boxId = 0;
  
  while (currentSouth < north) {
    const currentNorth = Math.min(currentSouth + CONFIG.GRID_SIZE, north);
    let currentWest = west;
    
    while (currentWest < east) {
      const currentEast = Math.min(currentWest + CONFIG.GRID_SIZE, east);
      
      boxes.push({
        id: boxId++,
        bbox: {
          north: parseFloat(currentNorth.toFixed(6)),
          south: parseFloat(currentSouth.toFixed(6)),
          east: parseFloat(currentEast.toFixed(6)),
          west: parseFloat(currentWest.toFixed(6))
        }
      });
      
      currentWest = currentEast;
    }
    
    currentSouth = currentNorth;
  }
  
  console.log(`Generated ${boxes.length} grid boxes for Texas`);
  return boxes;
}

// Load or create generation state
function loadState() {
  if (fs.existsSync(CONFIG.STATE_FILE)) {
    try {
      const state = JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
      console.log(`Resuming from box ${state.currentBox}/${state.totalBoxes}`);
      return state;
    } catch (error) {
      console.warn('Failed to load state file, starting fresh:', error.message);
    }
  }
  
  const boxes = generateTexasGrid();
  const state = {
    boxes,
    currentBox: 0,
    totalBoxes: boxes.length,
    completedBoxes: [],
    failedBoxes: [],
    startTime: new Date().toISOString(),
    lastUpdate: new Date().toISOString()
  };
  
  saveState(state);
  return state;
}

// Save generation state
function saveState(state) {
  state.lastUpdate = new Date().toISOString();
  fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(state, null, 2));
}

// Generate Overpass API query for waterways
function generateOverpassQuery(bbox) {
  return `
    [out:json][timeout:45];
    (
      way["waterway"="river"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["waterway"="stream"]["name"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["natural"="water"]["name"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["landuse"="reservoir"]["name"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      relation["natural"="water"]["name"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      relation["landuse"="reservoir"]["name"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    (._;>;);
    out geom;
  `;
}

// Fetch waterways for a single bounding box with retries
async function fetchWaterwaysForBox(box, retryCount = 0) {
  try {
    console.log(`Fetching box ${box.id}: ${JSON.stringify(box.bbox)}`);
    
    const query = generateOverpassQuery(box.bbox);
    
    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      {
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'DK-Texas-Flood-Overview/1.0'
        },
        timeout: 60000 // 60 seconds
      }
    );
    
    const elements = response.data.elements || [];
    console.log(`Box ${box.id}: Found ${elements.length} elements`);
    
    // Save individual box data
    const boxFile = path.join(CONFIG.OUTPUT_DIR, `box-${box.id}.json`);
    fs.writeFileSync(boxFile, JSON.stringify({
      boxId: box.id,
      bbox: box.bbox,
      elements,
      fetchTime: new Date().toISOString(),
      elementCount: elements.length
    }, null, 2));
    
    return {
      success: true,
      elements,
      file: boxFile
    };
    
  } catch (error) {
    console.error(`Error fetching box ${box.id} (attempt ${retryCount + 1}):`, error.message);
    
    if (retryCount < CONFIG.MAX_RETRIES) {
      console.log(`Retrying box ${box.id} in ${CONFIG.RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      return fetchWaterwaysForBox(box, retryCount + 1);
    }
    
    return {
      success: false,
      error: error.message,
      box: box.id
    };
  }
}

// Combine all box files into final output
function combineBoxFiles(state) {
  console.log('Combining all box files...');
  
  const allElements = [];
  const processedBoxes = [];
  
  // Read all completed box files
  for (const boxId of state.completedBoxes) {
    const boxFile = path.join(CONFIG.OUTPUT_DIR, `box-${boxId}.json`);
    
    if (fs.existsSync(boxFile)) {
      try {
        const boxData = JSON.parse(fs.readFileSync(boxFile, 'utf8'));
        allElements.push(...boxData.elements);
        processedBoxes.push({
          boxId,
          bbox: boxData.bbox,
          elementCount: boxData.elementCount,
          fetchTime: boxData.fetchTime
        });
      } catch (error) {
        console.warn(`Failed to read box file ${boxFile}:`, error.message);
      }
    }
  }
  
  // Remove duplicates based on element ID and type
  const uniqueElements = [];
  const seen = new Set();
  
  for (const element of allElements) {
    const key = `${element.type}-${element.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueElements.push(element);
    }
  }
  
  const combinedData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalBoxes: state.totalBoxes,
      completedBoxes: state.completedBoxes.length,
      failedBoxes: state.failedBoxes.length,
      coverage: CONFIG.TEXAS_BBOX,
      gridSize: CONFIG.GRID_SIZE,
      totalElements: uniqueElements.length,
      duplicatesRemoved: allElements.length - uniqueElements.length
    },
    boxes: processedBoxes,
    elements: uniqueElements
  };
  
  fs.writeFileSync(CONFIG.COMBINED_FILE, JSON.stringify(combinedData, null, 2));
  
  console.log(`Combined data saved to ${CONFIG.COMBINED_FILE}`);
  console.log(`Total elements: ${uniqueElements.length} (removed ${allElements.length - uniqueElements.length} duplicates)`);
  
  return combinedData;
}

// Main generation function
async function generateWaterways() {
  console.log('Starting Texas waterways static generation...');
  
  ensureOutputDir();
  const state = loadState();
  
  console.log(`Processing ${state.totalBoxes} total boxes`);
  console.log(`Starting from box ${state.currentBox}`);
  
  // Process remaining boxes
  for (let i = state.currentBox; i < state.boxes.length; i++) {
    const box = state.boxes[i];
    
    console.log(`\nProcessing box ${i + 1}/${state.totalBoxes} (ID: ${box.id})`);
    
    const result = await fetchWaterwaysForBox(box);
    
    if (result.success) {
      state.completedBoxes.push(box.id);
      console.log(`✅ Box ${box.id} completed (${result.elements.length} elements)`);
    } else {
      state.failedBoxes.push({
        boxId: box.id,
        error: result.error,
        bbox: box.bbox
      });
      console.log(`❌ Box ${box.id} failed: ${result.error}`);
    }
    
    // Update state
    state.currentBox = i + 1;
    saveState(state);
    
    // Progress report
    const completed = state.completedBoxes.length;
    const failed = state.failedBoxes.length;
    const remaining = state.totalBoxes - completed - failed;
    
    console.log(`Progress: ${completed} completed, ${failed} failed, ${remaining} remaining`);
    
    // Delay between requests to be respectful to the API
    if (i < state.boxes.length - 1) {
      console.log(`Waiting ${CONFIG.REQUEST_DELAY}ms before next request...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY));
    }
  }
  
  console.log('\n🎉 All boxes processed!');
  console.log(`✅ Completed: ${state.completedBoxes.length}`);
  console.log(`❌ Failed: ${state.failedBoxes.length}`);
  
  if (state.failedBoxes.length > 0) {
    console.log('\nFailed boxes:');
    state.failedBoxes.forEach(failed => {
      console.log(`  Box ${failed.boxId}: ${failed.error}`);
    });
  }
  
  // Combine all successful results
  if (state.completedBoxes.length > 0) {
    const combinedData = combineBoxFiles(state);
    
    console.log(`\n📁 Static waterways data generated:`);
    console.log(`   Combined file: ${CONFIG.COMBINED_FILE}`);
    console.log(`   Individual boxes: ${CONFIG.OUTPUT_DIR}/`);
    console.log(`   Total waterway elements: ${combinedData.elements.length}`);
    
    return combinedData;
  } else {
    console.log('\n❌ No successful boxes to combine');
    return null;
  }
}

// Command line interface
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'generate':
      generateWaterways()
        .then(() => {
          console.log('\nGeneration complete!');
          process.exit(0);
        })
        .catch(error => {
          console.error('\nGeneration failed:', error);
          process.exit(1);
        });
      break;
      
    case 'combine':
      try {
        ensureOutputDir();
        const state = loadState();
        combineBoxFiles(state);
        console.log('Combination complete!');
      } catch (error) {
        console.error('Combination failed:', error);
        process.exit(1);
      }
      break;
      
    case 'status':
      try {
        const state = loadState();
        console.log('Generation Status:');
        console.log(`  Total boxes: ${state.totalBoxes}`);
        console.log(`  Current box: ${state.currentBox}`);
        console.log(`  Completed: ${state.completedBoxes.length}`);
        console.log(`  Failed: ${state.failedBoxes.length}`);
        console.log(`  Remaining: ${state.totalBoxes - state.currentBox}`);
        console.log(`  Progress: ${((state.currentBox / state.totalBoxes) * 100).toFixed(1)}%`);
        
        if (state.startTime) {
          console.log(`  Started: ${state.startTime}`);
        }
        if (state.lastUpdate) {
          console.log(`  Last update: ${state.lastUpdate}`);
        }
      } catch (error) {
        console.log('No generation state found. Run "generate" to start.');
      }
      break;
      
    case 'reset':
      try {
        if (fs.existsSync(CONFIG.STATE_FILE)) {
          fs.unlinkSync(CONFIG.STATE_FILE);
          console.log('Generation state reset.');
        }
        if (fs.existsSync(CONFIG.OUTPUT_DIR)) {
          fs.rmSync(CONFIG.OUTPUT_DIR, { recursive: true, force: true });
          console.log('Output directory cleared.');
        }
        console.log('Ready for fresh start.');
      } catch (error) {
        console.error('Reset failed:', error);
        process.exit(1);
      }
      break;
      
    default:
      console.log(`
DK's Texas Waterways Static Generator

Usage:
  node scripts/generate-waterways-static.js <command>

Commands:
  generate    Start or resume waterways generation
  combine     Combine existing box files without re-fetching
  status      Show current generation progress
  reset       Reset generation state and clear output

The generator divides Texas into ${CONFIG.GRID_SIZE}° grid boxes and fetches
waterways data for each box separately. If the process crashes or is
interrupted, you can resume by running 'generate' again.

Output:
  Individual boxes: ./static-data/waterways/box-N.json
  Combined data:    ./static-data/texas-waterways.json
  State file:       ./static-data/waterways-generation-state.json
      `);
      process.exit(1);
  }
}

module.exports = {
  generateWaterways,
  combineBoxFiles,
  CONFIG
};
