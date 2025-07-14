import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cacheGet, cacheSet, generateBboxCacheKey, CACHE_TTL } from '@/lib/redis';
import { recordCacheStat } from '../admin/cache/route';

// Make this route dynamic to avoid build-time static generation
export const dynamic = 'force-dynamic';

// Texas bounding box for filtering
const TEXAS_BBOX = { north: 36.5, south: 25.8, east: -93.5, west: -106.7 };

// Function to check if coordinates are within Texas boundaries
function isWithinTexas(coordinates: number[][]): boolean {
  if (!coordinates || coordinates.length === 0) return false;
  
  // Check if any coordinate is within Texas bounds
  return coordinates.some(([lat, lon]) => 
    lat >= TEXAS_BBOX.south && lat <= TEXAS_BBOX.north &&
    lon >= TEXAS_BBOX.west && lon <= TEXAS_BBOX.east
  );
}

// Process elements from Overpass API into waterway objects
function processElements(elements: any[], waysMap?: Map<any, any>): any[] {
  console.log('[DEBUG] processElements called with', elements.length, 'elements');
  
  // Create ways map if not provided
  if (!waysMap) {
    waysMap = new Map();
    elements.forEach((element: any) => {
      if (element.type === 'way') {
        waysMap!.set(element.id, element);
      }
    });
  }

  const filtered = elements
    .filter((element: any) => {
      // Handle both cached (simplified) and live (full geometry) data structures
      const hasGeometry = element.geometry || (element.type === 'way' && (element.lat !== undefined || element.nodes));
      const hasMembers = element.members || element.type !== 'relation';
      
      // Include ways with geometry and relations with members
      if (element.type === 'way' && !hasGeometry) {
        console.log('[DEBUG] Filtered out way without geometry:', element.id);
        return false;
      }
      if (element.type === 'relation' && !hasMembers) {
        console.log('[DEBUG] Filtered out relation without members:', element.id);
        return false;
      }
      
      // Filter for major waterways only
      const name = element.tags?.name;
      const waterway = element.tags?.waterway;
      const natural = element.tags?.natural;
      const landuse = element.tags?.landuse;
      
      // Include all rivers, named streams, and named water bodies
      if (waterway === 'river') return true;
      if (waterway === 'stream' && name) return true;
      if (natural === 'water' && name) return true;
      if (landuse === 'reservoir' && name) return true;
      
      console.log('[DEBUG] Filtered out element - name:', name, 'waterway:', waterway, 'natural:', natural, 'landuse:', landuse);
      return false;
    });
    
    console.log('[DEBUG] After initial filter:', filtered.length, 'elements remain');
    
    return filtered
    .map((element: any) => {
      // Determine the type
      let type = 'river';
      if (element.tags?.waterway === 'stream') type = 'stream';
      else if (element.tags?.natural === 'water') {
        // Check if it's a lake or reservoir based on name or other tags
        const name = element.tags?.name?.toLowerCase() || '';
        if (name.includes('reservoir') || name.includes('dam')) {
          type = 'reservoir';
        } else {
          type = 'lake';
        }
      }
      else if (element.tags?.landuse === 'reservoir') type = 'reservoir';
      
      // Handle coordinates for ways vs relations, supporting both cached and live data
      let coordinates = [];
      
      if (element.type === 'way') {
        if (element.geometry) {
          // Live data with full geometry
          coordinates = element.geometry.map((point: any) => [point.lat, point.lon]);
        } else if (element.lat !== undefined && element.lon !== undefined) {
          // Cached data with single point
          coordinates = [[element.lat, element.lon]];
        }
        // Note: cached data with nodes but no geometry would need node resolution
        // For now, skip ways that only have nodes without resolved geometry
      } else if (element.type === 'relation' && element.members) {
        // For relations, find outer ways and combine their geometries (live data only)
        const outerWays = element.members
          .filter((member: any) => member.role === 'outer' && member.type === 'way')
          .map((member: any) => waysMap.get(member.ref))
          .filter((way: any) => way && way.geometry);
        
        if (outerWays.length > 0) {
          // Combine all outer ways into a single coordinate array
          // This creates a more complete boundary for large lakes
          const allCoordinates: number[][] = [];
          
          outerWays.forEach((way: any) => {
            const wayCoords = way.geometry.map((point: any) => [point.lat, point.lon]);
            allCoordinates.push(...wayCoords);
          });
          
          coordinates = allCoordinates;
          
          // If the coordinates don't form a closed polygon, close it
          if (coordinates.length > 0 && 
              (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || 
               coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
            coordinates.push(coordinates[0]);
          }
        }
      }
      
      return {
        id: element.id.toString(),
        name: element.tags?.name || `Unnamed ${type}`,
        type,
        coordinates
      };
    });
    
    console.log('[DEBUG] After mapping:', filtered.length, 'waterways created');
    
    const withCoords = filtered
    .map((element: any) => {
      // Determine the type
      let type = 'river';
      if (element.tags?.waterway === 'stream') type = 'stream';
      else if (element.tags?.natural === 'water') {
        // Check if it's a lake or reservoir based on name or other tags
        const name = element.tags?.name?.toLowerCase() || '';
        if (name.includes('reservoir') || name.includes('dam')) {
          type = 'reservoir';
        } else {
          type = 'lake';
        }
      }
      else if (element.tags?.landuse === 'reservoir') type = 'reservoir';
      
      // Handle coordinates for ways vs relations, supporting both cached and live data
      let coordinates = [];
      
      if (element.type === 'way') {
        if (element.geometry) {
          // Live data with full geometry
          coordinates = element.geometry.map((point: any) => [point.lat, point.lon]);
        } else if (element.lat !== undefined && element.lon !== undefined) {
          // Cached data with single point
          coordinates = [[element.lat, element.lon]];
        }
        // Note: cached data with nodes but no geometry would need node resolution
        // For now, skip ways that only have nodes without resolved geometry
      } else if (element.type === 'relation' && element.members) {
        // For relations, find outer ways and combine their geometries (live data only)
        const outerWays = element.members
          .filter((member: any) => member.role === 'outer' && member.type === 'way')
          .map((member: any) => waysMap.get(member.ref))
          .filter((way: any) => way && way.geometry);
        
        if (outerWays.length > 0) {
          // Combine all outer ways into a single coordinate array
          // This creates a more complete boundary for large lakes
          const allCoordinates: number[][] = [];
          
          outerWays.forEach((way: any) => {
            const wayCoords = way.geometry.map((point: any) => [point.lat, point.lon]);
            allCoordinates.push(...wayCoords);
          });
          
          coordinates = allCoordinates;
          
          // If the coordinates don't form a closed polygon, close it
          if (coordinates.length > 0 && 
              (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || 
               coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
            coordinates.push(coordinates[0]);
          }
        }
      }
      
      return {
        id: element.id.toString(),
        name: element.tags?.name || `Unnamed ${type}`,
        type,
        coordinates
      };
    })
    .filter((waterway: any) => {
      if (waterway.coordinates.length === 0) {
        console.log('[DEBUG] Filtered out waterway with no coordinates:', waterway.name);
        return false;
      }
      return true;
    })
    .filter((waterway: any) => {
      // First filter: Only include waterways that are within Texas boundaries
      if (!isWithinTexas(waterway.coordinates)) {
        console.log('[DEBUG] Filtered out waterway outside Texas:', waterway.name, 'coords:', waterway.coordinates.slice(0, 2));
        return false;
      }
      
      // Additional filtering for major waterways by name patterns and type
      const name = waterway.name.toLowerCase();
      const type = waterway.type;
      
      // For lakes and reservoirs, only include major ones
      if (type === 'lake' || type === 'reservoir') {
        // Major Texas lakes by name patterns
        const isMajorLake = name.includes('lake travis') ||
                           name.includes('lake austin') ||
                           name.includes('lake georgetown') ||
                           name.includes('lake buchanan') ||
                           name.includes('canyon lake') ||
                           name.includes('lake marble falls') ||
                           name.includes('lake lyndon') ||
                           name.includes('lady bird lake') ||
                           name.includes('town lake') ||
                           name.includes('inks lake') ||
                           name.includes('lake walter') ||
                           name.includes('granger lake') ||
                           name.includes('stillhouse hollow') ||
                           name.includes('belton lake') ||
                           name.includes('somerville lake') ||
                           name.includes('caddo lake') ||
                           name.includes('sam rayburn') ||
                           name.includes('toledo bend') ||
                           (name.includes('lake') && waterway.coordinates.length > 50) || // Large lakes by coordinate count
                           (name.includes('reservoir') && waterway.coordinates.length > 30); // Large reservoirs
        
        if (!isMajorLake) {
          console.log('[DEBUG] Filtered out non-major lake/reservoir:', name, 'coords:', waterway.coordinates.length);
        }
        return isMajorLake;
      }
      
      // For rivers and streams, include major Texas waterways
      const isMajorTexasRiver = name.includes('river') || 
                               name.includes('colorado') || 
                               name.includes('guadalupe') || 
                               name.includes('san gabriel') || 
                               name.includes('blanco') || 
                               name.includes('pedernales') || 
                               name.includes('brazos') || 
                               name.includes('trinity') || 
                               name.includes('llano') || 
                               name.includes('nueces') ||
                               name.includes('rio grande') ||
                               name.includes('sabine') ||
                               name.includes('neches') ||
                               name.includes('angelina') ||
                               name.includes('red river') ||
                               name.includes('canadian') ||
                               name.includes('pecos') ||
                               name.includes('concho') ||
                               waterway.coordinates.length > 10; // Longer waterways are likely more significant
      
      if (!isMajorTexasRiver) {
        console.log('[DEBUG] Filtered out non-major river/stream:', name, 'coords:', waterway.coordinates.length);
      }
      return isMajorTexasRiver;
    });
}

export async function GET(request: NextRequest) {
  console.log('[DEBUG] Waterways API called');
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse bbox parameter (west,south,east,north format or individual params)
    const bboxParam = searchParams.get('bbox');
    let bbox: { north: number; south: number; east: number; west: number };
    
    if (bboxParam) {
      const coords = bboxParam.split(',').map(coord => parseFloat(coord));
      if (coords.length === 4) {
        bbox = {
          west: coords[0],
          south: coords[1], 
          east: coords[2],
          north: coords[3]
        };
      } else {
        throw new Error('Invalid bbox format. Expected: west,south,east,north');
      }
    } else {
      bbox = {
        north: parseFloat(searchParams.get('north') || '0'),
        south: parseFloat(searchParams.get('south') || '0'),
        east: parseFloat(searchParams.get('east') || '0'),
        west: parseFloat(searchParams.get('west') || '0'),
      };
    }

    // Generate cache key for this bounding box
    const cacheKey = generateBboxCacheKey(bbox);

    console.log('[DEBUG] Waterways request:', { bbox, cacheKey });

    // If bbox matches Texas, serve from preloaded cache
    const isTexasBbox = Math.abs(bbox.north - TEXAS_BBOX.north) < 0.2 &&
      Math.abs(bbox.south - TEXAS_BBOX.south) < 0.2 &&
      Math.abs(bbox.east - TEXAS_BBOX.east) < 0.2 &&
      Math.abs(bbox.west - TEXAS_BBOX.west) < 0.2;
    
    console.log('[DEBUG] isTexasBbox:', isTexasBbox, { 
      northDiff: Math.abs(bbox.north - TEXAS_BBOX.north),
      southDiff: Math.abs(bbox.south - TEXAS_BBOX.south),
      eastDiff: Math.abs(bbox.east - TEXAS_BBOX.east),
      westDiff: Math.abs(bbox.west - TEXAS_BBOX.west)
    });
    
    if (isTexasBbox) {
      const texasKey = 'waterways:texas:all';
      const cachedTexas = await cacheGet(texasKey);
      if (cachedTexas) {
        recordCacheStat('waterways', true);
        
        // Process cached elements through the same transformation logic
        // Ensure we're passing the elements array, not the whole object
        let elementsArray;
        if (Array.isArray(cachedTexas)) {
          elementsArray = cachedTexas;
        } else if (cachedTexas.elements && Array.isArray(cachedTexas.elements)) {
          elementsArray = cachedTexas.elements;
        } else {
          console.warn('[DEBUG] Cached Texas data has unexpected structure:', typeof cachedTexas, Object.keys(cachedTexas || {}));
          elementsArray = [];
        }
        
        console.log('[DEBUG] Processing', elementsArray.length, 'cached elements');
        
        // Debug: Check structure of first few cached elements
        console.log('[DEBUG] Sample cached elements structure:');
        elementsArray.slice(0, 3).forEach((el, i) => {
          console.log(`[DEBUG] Element ${i}:`, {
            type: el.type,
            id: el.id,
            hasGeometry: !!el.geometry,
            hasMembers: !!el.members,
            hasTags: !!el.tags,
            tags: el.tags ? {
              name: el.tags.name,
              waterway: el.tags.waterway,
              natural: el.tags.natural,
              landuse: el.tags.landuse
            } : null
          });
        });
        
        const processedWaterways = processElements(elementsArray);
        console.log('[DEBUG] After processing:', processedWaterways.length, 'waterways returned');
        
        return NextResponse.json({ waterways: processedWaterways, cached: true }, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }
    }

    // Try to get from cache first
    const cachedWaterways = await cacheGet(cacheKey);
    if (cachedWaterways) {
      recordCacheStat('waterways', true);
      
      // If cached data has elements, process them; otherwise return as-is
      const waterways = cachedWaterways.elements ? 
        processElements(cachedWaterways.elements) : 
        cachedWaterways;
      
      return NextResponse.json({ waterways, cached: true }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    } else {
      recordCacheStat('waterways', false);
    }

    // Overpass API query to get major rivers and lakes with full geometry
    // For relations, we'll get all ways that are members of water relations
    const query = `
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

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      {
        headers: {
          'Content-Type': 'text/plain',
        },
      }
    );

    // Create a map of ways for relation processing
    const waysMap = new Map();
    response.data.elements.forEach((element: any) => {
      if (element.type === 'way') {
        waysMap.set(element.id, element);
      }
    });

    const waterways = processElements(response.data.elements, waysMap);

    // Cache the results for 24 hours
    await cacheSet(cacheKey, waterways, CACHE_TTL.WATERWAYS);

    return NextResponse.json({ waterways, cached: false }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Waterway API error:', error);
    
    // Return empty array instead of fallback data to avoid test polygons
    return NextResponse.json({ waterways: [] });
  }
}
