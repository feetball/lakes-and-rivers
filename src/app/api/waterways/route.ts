import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cacheGet, cacheSet, generateBboxCacheKey, CACHE_TTL } from '@/lib/redis';

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

    // Generate cache key for this bounding box
    const cacheKey = generateBboxCacheKey(bbox);
    
    // Try to get from cache first
    console.log('Checking cache for waterways:', cacheKey);
    const cachedWaterways = await cacheGet(cacheKey);
    
    if (cachedWaterways) {
      console.log('Returning cached waterways:', cachedWaterways.length, 'waterways');
      return NextResponse.json({ waterways: cachedWaterways, cached: true }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Overpass API query to get major rivers and lakes with full geometry
    // For relations, we'll try to get the outer ways that define the boundaries
    const query = `
      [out:json][timeout:30];
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

    console.log('Fetching waterways from Overpass API for bbox:', bbox);

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      {
        headers: {
          'Content-Type': 'text/plain',
        },
      }
    );

    console.log('Overpass API returned', response.data.elements.length, 'elements');
    
    // Debug: Check what types of water elements we got
    const elementTypes = response.data.elements.reduce((acc: any, el: any) => {
      const waterway = el.tags?.waterway;
      const natural = el.tags?.natural;
      const landuse = el.tags?.landuse;
      const key = waterway || natural || landuse || 'other';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

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
            // Use the first outer way's geometry as the primary boundary
            // In a full implementation, we'd properly join all outer ways
            coordinates = outerWays[0].geometry.map((point: any) => [point.lat, point.lon]);
            
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

    // Debug: Check final waterway types
    const finalTypes = waterways.reduce((acc: any, w: any) => {
      acc[w.type] = (acc[w.type] || 0) + 1;
      return acc;
    }, {});
    console.log('Final waterway types after filtering:', finalTypes);
    console.log('Lake/reservoir examples:', waterways.filter((w: any) => w.type === 'lake' || w.type === 'reservoir').slice(0, 3));

    // Cache the results for 24 hours
    console.log('Caching waterways:', waterways.length, 'waterways for key:', cacheKey);
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
