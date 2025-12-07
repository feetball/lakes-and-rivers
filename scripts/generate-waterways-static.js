const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const CONFIG = {
  // Texas bounding box
  TEXAS_BBOX: { north: 36.5, south: 25.8, east: -93.5, west: -106.7 },
  
  // Grid configuration for batching
  GRID_SIZE: 1, 
//   GRID_SIZE: 0.5, // degrees (about 35 miles at Texas latitude)
//   GRID_SIZE: 1.45, for ~100 miles
// GRID_SIZE: 2.9, for ~200 miles
  // Output directory
  OUTPUT_DIR: path.join(__dirname, '..', 'static-data', 'waterways'),
  
  // Batch state file
  STATE_FILE: path.join(__dirname, '..', 'static-data', 'waterways-generation-state.json'),
  
  // Final combined file
  COMBINED_FILE: path.join(__dirname, '..', 'static-data', 'texas-waterways.json'),
  
  // Request delay to avoid overloading Overpass API
  REQUEST_DELAY: 1000, // 1 seconds between requests
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000, // 2 seconds
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
    
    // Prepare box data
    const boxData = {
      boxId: box.id,
      bbox: box.bbox,
      elements,
      fetchTime: new Date().toISOString(),
      elementCount: elements.length
    };

    // Validate JSON before writing
    let jsonString;
    try {
      jsonString = JSON.stringify(boxData, null, 2);
    } catch (err) {
      console.error(`Box ${box.id}: Failed to serialize JSON:`, err.message);
      return {
        success: false,
        error: 'JSON serialization failed',
        box: box.id
      };
    }

    // Save individual box data if valid
    const boxFile = path.join(CONFIG.OUTPUT_DIR, `box-${box.id}.json`);
    try {
      fs.writeFileSync(boxFile, jsonString);
    } catch (err) {
      console.error(`Box ${box.id}: Failed to write file:`, err.message);
      return {
        success: false,
        error: 'File write failed',
        box: box.id
      };
    }

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
        const stats = fs.statSync(boxFile);
        const fileSizeMB = stats.size / (1024 * 1024);
        
        if (fileSizeMB > 20) {
          console.log(`Large file detected: ${boxFile} (${fileSizeMB.toFixed(1)}MB) - processing in chunks`);
          
          // Read file in chunks to avoid memory issues
          const fileContent = fs.readFileSync(boxFile, 'utf8');
          let boxData;
          
          try {
            // Try to parse the JSON structure first
            const jsonStart = fileContent.indexOf('"elements":[') + '"elements":['.length;
            const jsonEnd = fileContent.lastIndexOf('],"fetchTime"');
            
            if (jsonStart > 0 && jsonEnd > 0) {
              // Parse metadata without elements
              const metadataEnd = fileContent.indexOf('"elements":[');
              const metadataStr = fileContent.substring(0, metadataEnd) + '"elements":[],' + fileContent.substring(jsonEnd + 1);
              const metadata = JSON.parse(metadataStr);
              
              // Process elements in chunks
              const elementsStr = fileContent.substring(jsonStart, jsonEnd);
              const elements = [];
              
              // Split elements string by objects (simple approach)
              const elementChunks = elementsStr.split('},{');
              for (let i = 0; i < elementChunks.length; i += 1000) { // Process 1000 elements at a time
                const chunk = elementChunks.slice(i, i + 1000);
                let chunkStr = chunk.join('},{');
                
                if (i > 0) chunkStr = '{' + chunkStr;
                if (i + 1000 < elementChunks.length) chunkStr = chunkStr + '}';
                
                try {
                  const chunkElements = JSON.parse('[' + chunkStr + ']');
                  elements.push(...chunkElements);
                } catch (e) {
                  console.warn(`Failed to parse chunk ${i}-${i+1000} for ${boxFile}`);
                }
              }
              
              boxData = {
                ...metadata,
                elements: elements
              };
              
            } else {
              // Fallback to regular parsing
              boxData = JSON.parse(fileContent);
            }
          } catch (e) {
            console.warn(`Chunk processing failed for ${boxFile}, trying regular parse`);
            boxData = JSON.parse(fileContent);
          }
        } else {
          const fileContent = fs.readFileSync(boxFile, 'utf8');
          boxData = JSON.parse(fileContent);
        }
        
        allElements.push(...boxData.elements);
        processedBoxes.push({
          boxId,
          bbox: boxData.bbox,
          elementCount: boxData.elementCount,
          fetchTime: boxData.fetchTime
        });
      } catch (error) {
        // Gather more details about the file
        let details = '';
        try {
          const stats = fs.statSync(boxFile);
          details += `Size: ${(stats.size / (1024 * 1024)).toFixed(1)}MB. `;
        } catch (e) {
          details += 'Could not get file size. ';
        }
        console.warn(`Failed to read box file ${boxFile}: ${error.message}. ${details}`);
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
  
  // Write file in streaming manner to avoid string length limits
  try {
    const writeStream = fs.createWriteStream(CONFIG.COMBINED_FILE);
    
    // Write opening brace and metadata
    writeStream.write('{\n');
    writeStream.write(`  "metadata": ${JSON.stringify(combinedData.metadata, null, 2).replace(/^/gm, '  ')},\n`);
    writeStream.write(`  "boxes": ${JSON.stringify(combinedData.boxes, null, 2).replace(/^/gm, '  ')},\n`);
    writeStream.write('  "elements": [\n');
    
    // Write elements in chunks
    const chunkSize = 1000;
    for (let i = 0; i < uniqueElements.length; i += chunkSize) {
      const chunk = uniqueElements.slice(i, i + chunkSize);
      const chunkStr = JSON.stringify(chunk, null, 4).slice(1, -1); // Remove [ and ]
      
      if (i > 0) writeStream.write(',\n');
      writeStream.write(chunkStr);
      
      if (i + chunkSize < uniqueElements.length) {
        writeStream.write(',');
      }
    }
    
    writeStream.write('\n  ]\n');
    writeStream.write('}\n');
    writeStream.end();
    
    console.log(`Combined data written to ${CONFIG.COMBINED_FILE} using streaming`);
  } catch (streamError) {
    console.error('Streaming write failed, trying compressed format:', streamError.message);
    
    // Fallback: write a compressed version with just metadata and element count
    const compressedData = {
      metadata: combinedData.metadata,
      boxes: processedBoxes,
      elementCount: uniqueElements.length,
      note: "Elements too large for single file - check individual box files"
    };
    
    fs.writeFileSync(CONFIG.COMBINED_FILE, JSON.stringify(compressedData, null, 2));
    console.log(`Compressed summary written to ${CONFIG.COMBINED_FILE}`);
  }
  
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
  
  // Identify missing box files and process them
  const missingBoxes = [];
  for (const box of state.boxes) {
    const boxFile = path.join(CONFIG.OUTPUT_DIR, `box-${box.id}.json`);
    if (!fs.existsSync(boxFile)) {
      missingBoxes.push(box);
    }
  }

  if (missingBoxes.length > 0) {
    console.log(`Found ${missingBoxes.length} missing box files. Downloading them again...`);
    for (const box of missingBoxes) {
      console.log(`\nProcessing missing box (ID: ${box.id})`);
      const result = await fetchWaterwaysForBox(box);
      if (result.success) {
        if (!state.completedBoxes.includes(box.id)) {
          state.completedBoxes.push(box.id);
        }
        console.log(`✅ Box ${box.id} completed (${result.elements.length} elements)`);
      } else {
        if (!state.failedBoxes.some(b => b.boxId === box.id)) {
          state.failedBoxes.push({
            boxId: box.id,
            error: result.error,
            bbox: box.bbox
          });
        }
        console.log(`❌ Box ${box.id} failed: ${result.error}`);
      }
      saveState(state);
      // Delay between requests
      console.log(`Waiting ${CONFIG.REQUEST_DELAY}ms before next request...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY));
    }
  } else {
    console.log('No missing box files detected. All boxes are present.');
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
