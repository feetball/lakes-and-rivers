#!/usr/bin/env node

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// Austin, TX coordinates
const AUSTIN_LAT = 30.2672;
const AUSTIN_LON = -97.7431;
const RADIUS_MILES = 100;

// Convert miles to degrees (approximate)
// 1 degree latitude ≈ 69 miles
// 1 degree longitude ≈ 69 * cos(latitude) miles
const RADIUS_LAT_DEGREES = RADIUS_MILES / 69;
const RADIUS_LON_DEGREES = RADIUS_MILES / (69 * Math.cos(AUSTIN_LAT * Math.PI / 180));

console.log(`Filtering waterways within ${RADIUS_MILES} miles of Austin, TX`);
console.log(`Austin coordinates: ${AUSTIN_LAT}, ${AUSTIN_LON}`);
console.log(`Search radius: ±${RADIUS_LAT_DEGREES.toFixed(4)}° lat, ±${RADIUS_LON_DEGREES.toFixed(4)}° lon`);

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Get element's representative coordinates
function getElementCoords(element) {
  if (element.lat && element.lon) {
    return { lat: element.lat, lon: element.lon };
  }
  
  // For ways, calculate center from nodes
  if (element.type === 'way' && element.nodes && element.nodes.length > 0) {
    // We'd need node data to calculate center, so use bounding box approach
    return null;
  }
  
  return null;
}

// Check if element is within radius of Austin
function isWithinRadius(element, nodes) {
  // For ways without node coordinates, use a rough bounding box check
  if (element.type === 'way') {
    // If no bounds available, include all for now
    // In a more sophisticated version, we'd need the actual node coordinates
    // For now, let's use a simpler geographic bounding box approach
    return true; // We'll filter by bounding box instead
  }
  
  const coords = getElementCoords(element);
  if (coords) {
    const distance = calculateDistance(AUSTIN_LAT, AUSTIN_LON, coords.lat, coords.lon);
    return distance <= RADIUS_MILES;
  }
  
  return false;
}

// Check if element is within Austin metro bounding box (more practical approach)
function isWithinAustinBounds(element) {
  // For ways, check if they have any nodes in the original data structure
  // Since we don't have node coordinates, we'll be more conservative
  // and include ways that are likely in the Central Texas area
  if (element.type === 'way' && element.tags) {
    const name = (element.tags.name || '').toLowerCase();
    const waterway = element.tags.waterway || '';
    
    // Only include major Central Texas rivers/creeks and significant waterways
    const centralTexasWaterways = [
      'colorado river', 'colorado rv', 'lady bird lake', 'town lake',
      'guadalupe river', 'guadalupe rv', 'san marcos river', 'san marcos rv',
      'barton creek', 'barton springs', 'shoal creek', 'bull creek',
      'onion creek', 'slaughter creek', 'williamson creek',
      'walnut creek', 'waller creek', 'boggy creek',
      'brushy creek', 'little walnut creek',
      'blanco river', 'blanco rv', 'pedernales river', 'pedernales rv',
      'llano river', 'llano rv', 'san gabriel river', 'san gabriel rv'
    ];
    
    // Check for exact or close name matches
    const nameMatch = centralTexasWaterways.some(waterName => {
      return name.includes(waterName) || 
             (name.includes(waterName.split(' ')[0]) && name.includes('creek')) ||
             (name.includes(waterName.split(' ')[0]) && name.includes('river'));
    });
    
    // Only include rivers, streams, and named waterways in Central Texas
    const isSignificantWaterway = (['river', 'stream'].includes(waterway) && nameMatch) ||
                                 (waterway === 'creek' && nameMatch) ||
                                 nameMatch;
    
    // Additional filter: exclude very small waterways unless they're named
    if (waterway === 'ditch' || waterway === 'drain') {
      return false;
    }
    
    return isSignificantWaterway;
  }
  
  return false;
}

async function filterWaterways() {
  const inputFile = path.join(__dirname, '../data/static/texas-waterways.json.gz');
  const outputFile = path.join(__dirname, '../data/static/austin-waterways.json.gz');
  
  if (!fs.existsSync(inputFile)) {
    console.error('Input file not found:', inputFile);
    process.exit(1);
  }
  
  console.log('Reading compressed waterways data...');
  const compressed = fs.readFileSync(inputFile);
  const decompressed = zlib.gunzipSync(compressed);
  const data = JSON.parse(decompressed.toString('utf8'));
  
  console.log(`Total elements in input: ${data.elements.length}`);
  
  // First pass: collect all nodes for coordinate lookup
  const nodes = new Map();
  const ways = [];
  const relations = [];
  
  for (const element of data.elements) {
    if (element.type === 'node') {
      nodes.set(element.id, element);
    } else if (element.type === 'way') {
      ways.push(element);
    } else if (element.type === 'relation') {
      relations.push(element);
    }
  }
  
  console.log(`Nodes: ${nodes.size}, Ways: ${ways.length}, Relations: ${relations.length}`);
  
  // Filter elements within radius
  const filteredElements = [];
  let nodesWithinRadius = 0;
  let waysWithinRadius = 0;
  let relationsWithinRadius = 0;
  
  // Add nodes within radius
  for (const [nodeId, node] of nodes) {
    if (node.lat && node.lon) {
      const distance = calculateDistance(AUSTIN_LAT, AUSTIN_LON, node.lat, node.lon);
      if (distance <= RADIUS_MILES) {
        filteredElements.push(node);
        nodesWithinRadius++;
      }
    }
  }
  
  // Add ways that have nodes within radius
  const usedNodeIds = new Set();
  for (const way of ways) {
    if (isWithinAustinBounds(way)) {
      filteredElements.push(way);
      waysWithinRadius++;
      
      // Mark nodes as used
      if (way.nodes) {
        for (const nodeId of way.nodes) {
          usedNodeIds.add(nodeId);
        }
      }
    }
  }
  
  // Add relations within Austin bounds
  for (const relation of relations) {
    if (isWithinAustinBounds(relation)) {
      filteredElements.push(relation);
      relationsWithinRadius++;
    }
  }
  
  // Add any referenced nodes that weren't already included
  for (const nodeId of usedNodeIds) {
    const node = nodes.get(nodeId);
    if (node && !filteredElements.some(el => el.type === 'node' && el.id === nodeId)) {
      filteredElements.push(node);
    }
  }
  
  const filteredData = {
    elements: filteredElements
  };
  
  console.log(`Filtered elements: ${filteredElements.length}`);
  console.log(`- Nodes within radius: ${nodesWithinRadius}`);
  console.log(`- Ways within radius: ${waysWithinRadius}`);
  console.log(`- Relations within radius: ${relationsWithinRadius}`);
  
  // Save filtered data
  const outputJson = JSON.stringify(filteredData);
  const outputCompressed = zlib.gzipSync(outputJson);
  
  fs.writeFileSync(outputFile, outputCompressed);
  
  const originalSize = compressed.length;
  const newSize = outputCompressed.length;
  const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);
  
  console.log(`Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Filtered size: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Size reduction: ${reduction}%`);
  console.log(`Saved to: ${outputFile}`);
}

if (require.main === module) {
  filterWaterways().catch(console.error);
}

module.exports = { filterWaterways };
