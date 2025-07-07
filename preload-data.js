


// Polyfill fetch for Node.js if needed
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
}

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Load JSON data, trying compressed version first
 */
function loadStaticJson(filePath) {
  const compressedPath = filePath + '.gz';
  
  try {
    // Try compressed version first
    if (fs.existsSync(compressedPath)) {
      console.log(`[PRELOAD] Loading compressed: ${path.basename(compressedPath)}`);
      const compressed = fs.readFileSync(compressedPath);
      const decompressed = zlib.gunzipSync(compressed);
      return JSON.parse(decompressed.toString('utf8'));
    }
    
    // Fall back to uncompressed version
    if (fs.existsSync(filePath)) {
      console.log(`[PRELOAD] Loading uncompressed: ${path.basename(filePath)}`);
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    
    return null;
  } catch (error) {
    console.warn(`[PRELOAD] Error loading ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Make a cache API call with retry logic
 */
async function makeCacheRequest(data, retries = 3, host = 'app', port = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`http://${host}:${port}/api/admin/cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        return true;
      } else {
        const errorText = await response.text();
        console.warn(`[PRELOAD] Cache API returned ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.warn(`[PRELOAD] Cache API request failed (attempt ${i + 1}/${retries}):`, error.message);
      
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      }
    }
  }
  
  return false;
}

/**
 * Wait for server to be ready
 */
async function waitForServer(host = 'app', port = 3000, maxWaitTime = 60000) {
  console.log(`[PRELOAD] Waiting for server on ${host}:${port} to be ready...`);
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await fetch(`http://${host}:${port}/api/health`);
      if (response.ok) {
        console.log(`[PRELOAD] Server on ${host}:${port} is ready!`);
        return { host, port };
      }
    } catch (error) {
      // Server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
  }
  
  console.warn(`[PRELOAD] Server did not become ready in time, proceeding anyway...`);
  return { host, port };
}

// Data loading script
async function preloadData() {
  console.log('[PRELOAD] Static data preloader starting...');
  console.log('[PRELOAD] Loading provided static files (*.json.gz) into Redis cache...');
  
  // Wait for server to be ready
  const serverInfo = await waitForServer();
  
  console.log('[PRELOAD] Server ready, transferring static data files to Redis...');
  
  try {
    // Load static data files
    const dataDir = path.join(__dirname, 'data', 'static');
    
    const usgsFile = path.join(dataDir, 'texas-usgs-stations.json');
    const waterwaysFile = path.join(dataDir, 'texas-waterways.json');
    const floodFile = path.join(dataDir, 'texas-flood-stages.json');
    
    console.log('[PRELOAD] Loading USGS stations from static file...');
    let usgsLoaded = false;
    const usgsData = loadStaticJson(usgsFile);
    if (usgsData) {
      console.log(`[PRELOAD] Transferring USGS data from static file to Redis...`);
      const success = await makeCacheRequest({
        action: 'set',
        key: 'usgs:stations:texas:all',
        data: usgsData,
        ttl: 24 * 60 * 60 // 24 hours
      }, 3, serverInfo.host, serverInfo.port);
      
      if (success) {
        console.log(`[PRELOAD] ✓ USGS stations transferred to Redis: ${usgsData.value?.timeSeries?.length || 0} stations`);
        usgsLoaded = true;
      } else {
        console.warn('[PRELOAD] ✗ Failed to transfer USGS stations to Redis');
      }
    } else {
      console.warn(`[PRELOAD] ✗ USGS stations file not found: ${usgsFile}`);
    }
    
    console.log('[PRELOAD] Loading waterways from static file...');
    let waterwaysLoaded = false;
    const waterwaysData = loadStaticJson(waterwaysFile);
    if (waterwaysData) {
      console.log(`[PRELOAD] Transferring waterways data from static file to Redis...`);
      const success = await makeCacheRequest({
        action: 'set',
        key: 'waterways:texas:all',
        data: waterwaysData,
        ttl: 24 * 60 * 60 // 24 hours
      }, 3, serverInfo.host, serverInfo.port);
      
      if (success) {
        console.log(`[PRELOAD] ✓ Waterways transferred to Redis: ${waterwaysData.elements?.length || 0} elements`);
        waterwaysLoaded = true;
      } else {
        console.warn('[PRELOAD] ✗ Failed to transfer waterways to Redis');
      }
    } else {
      console.warn(`[PRELOAD] ✗ Waterways file not found: ${waterwaysFile}`);
    }
    
    console.log('[PRELOAD] Loading flood stages from static file...');
    let floodLoaded = false;
    const floodData = loadStaticJson(floodFile);
    if (floodData) {
      console.log(`[PRELOAD] Transferring flood stages data from static file to Redis...`);
      const success = await makeCacheRequest({
        action: 'set',
        key: 'flood:stages:texas:all',
        data: floodData,
        ttl: 7 * 24 * 60 * 60 // 7 days
      }, 3, serverInfo.host, serverInfo.port);
      
      if (success) {
        console.log(`[PRELOAD] ✓ Flood stages transferred to Redis: ${Object.keys(floodData).length || 0} entries`);
        floodLoaded = true;
      } else {
        console.warn('[PRELOAD] ✗ Failed to transfer flood stages to Redis');
      }
    } else {
      console.warn(`[PRELOAD] ✗ Flood stages file not found: ${floodFile}`);
    }
    
    // Update preload status
    const statusSuccess = await makeCacheRequest({
      action: 'set-status',
      usgs: usgsLoaded,
      waterways: waterwaysLoaded,
      flood: floodLoaded
    }, 3, serverInfo.host, serverInfo.port);
    
    if (statusSuccess) {
      console.log('[PRELOAD] ✓ Static data transfer from files to Redis completed successfully!');
      console.log('[PRELOAD] App will now serve data from Redis cache instead of live APIs');
    } else {
      console.warn('[PRELOAD] ✗ Failed to update preload status');
    }
    
  } catch (error) {
    console.error('[PRELOAD] Static data loading failed:', error);
  }
}

// Only run preload if this is the main module
if (require.main === module) {
  preloadData().catch((error) => {
    console.error('[PRELOAD] Preload failed:', error);
    process.exit(1);
  });
}

module.exports = { loadStaticJson, preloadData };
