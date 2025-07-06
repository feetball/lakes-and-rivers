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

    // Overpass API query to get only major rivers (not small streams)
    const query = `
      [out:json][timeout:25];
      (
        way["waterway"="river"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        way["waterway"="stream"]["name"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      );
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

    const waterways = response.data.elements
      .filter((element: any) => {
        // Only include if it's a way with geometry
        if (element.type !== 'way' || !element.geometry) return false;
        
        // Filter for major waterways only
        const name = element.tags?.name;
        const waterway = element.tags?.waterway;
        
        // Include all rivers, but only named streams
        if (waterway === 'river') return true;
        if (waterway === 'stream' && name) return true;
        
        return false;
      })
      .map((element: any) => ({
        id: element.id.toString(),
        name: element.tags?.name || `Unnamed ${element.tags?.waterway || 'waterway'}`,
        type: element.tags?.waterway,
        coordinates: element.geometry.map((point: any) => [point.lat, point.lon])
      }))
      .filter((waterway: any) => {
        // Additional filtering for major rivers by name patterns
        const name = waterway.name.toLowerCase();
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
    
    // Return sample major waterways as fallback
    const fallbackWaterways = [
      {
        id: 'sample-1',
        name: 'San Gabriel River',
        type: 'river',
        coordinates: [
          [30.6500, -97.7000],
          [30.6400, -97.6900],
          [30.6300, -97.6800],
          [30.6200, -97.6700],
          [30.6100, -97.6600],
          [30.6000, -97.6500]
        ]
      },
      {
        id: 'sample-2',
        name: 'Guadalupe River',
        type: 'river',
        coordinates: [
          [29.9000, -98.5000],
          [29.9100, -98.4000],
          [29.9200, -98.3000],
          [29.9300, -98.2000],
          [29.9400, -98.1000]
        ]
      },
      {
        id: 'sample-3',
        name: 'Colorado River',
        type: 'river',
        coordinates: [
          [30.2000, -97.8000],
          [30.2100, -97.7500],
          [30.2200, -97.7000],
          [30.2300, -97.6500]
        ]
      },
      {
        id: 'sample-4',
        name: 'Pedernales River',
        type: 'river',
        coordinates: [
          [30.2500, -98.5000],
          [30.2600, -98.4000],
          [30.2700, -98.3000],
          [30.2800, -98.2000]
        ]
      }
    ];

    return NextResponse.json({ waterways: fallbackWaterways });
  }
}
