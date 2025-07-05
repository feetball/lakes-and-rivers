import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cacheGet, cacheSet, generateBboxCacheKey } from '@/lib/redis';

const USGS_BASE_URL = 'https://waterservices.usgs.gov/nwis/iv/';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bbox = {
      north: parseFloat(parseFloat(searchParams.get('north') || '0').toFixed(6)),
      south: parseFloat(parseFloat(searchParams.get('south') || '0').toFixed(6)),
      east: parseFloat(parseFloat(searchParams.get('east') || '0').toFixed(6)),
      west: parseFloat(parseFloat(searchParams.get('west') || '0').toFixed(6)),
    };

    // Generate cache key for USGS data
    const cacheKey = `usgs:${generateBboxCacheKey(bbox)}`;
    
    // Try to get from cache first
    console.log('Checking cache for USGS data:', cacheKey);
    const cachedData = await cacheGet(cacheKey);
    
    if (cachedData) {
      console.log('Returning cached USGS data');
      return NextResponse.json({...cachedData, cached: true}, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    let url = `${USGS_BASE_URL}?format=json&parameterCd=00065,00060&siteStatus=active&period=PT8H`;
    
    if (bbox.north && bbox.south && bbox.east && bbox.west) {
      url += `&bBox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
    }

    console.log('Fetching from USGS:', url);

    const response = await axios.get(url);
    
    // Cache the results for 15 minutes (900 seconds) since water data changes frequently
    console.log('Caching USGS data for key:', cacheKey);
    await cacheSet(cacheKey, {...response.data, cached: false}, 900);
    
    // Add CORS headers
    return NextResponse.json({...response.data, cached: false}, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('USGS API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch USGS data' },
      { status: 500 }
    );
  }
}
