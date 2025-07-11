import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cacheGet, cacheSet, generateBboxCacheKey, CACHE_TTL } from '@/lib/redis';
import { recordCacheStat } from '../admin/cache/route';

// Make this route dynamic to avoid build-time static generation
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bbox = {
      north: parseFloat(searchParams.get('north') || '0'),
      south: parseFloat(searchParams.get('south') || '0'),
      east: parseFloat(searchParams.get('east') || '0'),
      west: parseFloat(searchParams.get('west') || '0'),
    };

    // Texas bounding box (approximate)
    const TEXAS_BBOX = { north: 36.5, south: 25.8, east: -93.5, west: -106.7 };
    // Generate cache key for this bounding box
    const cacheKey = generateBboxCacheKey(bbox);

    // If bbox matches Texas, serve from preloaded cache
    const isTexasBbox = Math.abs(bbox.north - TEXAS_BBOX.north) < 0.2 &&
      Math.abs(bbox.south - TEXAS_BBOX.south) < 0.2 &&
      Math.abs(bbox.east - TEXAS_BBOX.east) < 0.2 &&
      Math.abs(bbox.west - TEXAS_BBOX.west) < 0.2;
    if (isTexasBbox) {
      const texasKey = 'waterways:texas:all';
      const cachedTexas = await cacheGet(texasKey);
      if (cachedTexas) {
        recordCacheStat('waterways', true);
        return NextResponse.json({ waterways: cachedTexas, cached: true }, {
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
      return NextResponse.json({ waterways: cachedWaterways, cached: true }, {
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

    const waterways = response.data.elements
      .filter((element: any) => {
        // Include ways with geometry and relations with members
        if (element.type === 'way' && !element.geometry) return false;
        if (element.type === 'relation' && !element.members) return false;
        
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
        
        return false;
      })
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
        
        // Handle coordinates for ways vs relations
        let coordinates = [];
        if (element.type === 'way' && element.geometry) {
          coordinates = element.geometry.map((point: any) => [point.lat, point.lon]);
        } else if (element.type === 'relation' && element.members) {
          // For relations, find outer ways and combine their geometries
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
      .filter((waterway: any) => waterway.coordinates.length > 0)
      .filter((waterway: any) => {
        // Additional filtering for major waterways by name patterns and type
        const name = waterway.name.toLowerCase();
        const type = waterway.type;
        
        // For lakes and reservoirs, only include major ones
        if (type === 'lake' || type === 'reservoir') {
          // Major lakes by name patterns
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
                             (name.includes('lake') && waterway.coordinates.length > 50) || // Large lakes by coordinate count
                             (name.includes('reservoir') && waterway.coordinates.length > 30); // Large reservoirs
          
          return isMajorLake;
        }
        
        // For rivers and streams, use existing logic
        const isMajorRiver = name.includes('river') || 
                           name.includes('colorado') || 
                           name.includes('guadalupe') || 
                           name.includes('san gabriel') || 
                           name.includes('blanco') || 
                           name.includes('pedernales') || 
                           name.includes('brazos') || 
                           name.includes('trinity') || 
                           name.includes('llano') || 
                           name.includes('nueces') ||
                           waterway.coordinates.length > 10; // Longer waterways are likely more significant
        
        return isMajorRiver;
      });

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
