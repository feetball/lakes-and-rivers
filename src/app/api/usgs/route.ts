import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cacheGet, cacheSet, generateBboxCacheKey, CACHE_TTL } from '@/lib/redis';
import { CachedUSGSService } from '@/services/cachedUsgs';

const USGS_BASE_URL = 'https://waterservices.usgs.gov/nwis/iv/';

// Make this route dynamic to avoid build-time static generation
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bbox = {
      north: parseFloat(parseFloat(searchParams.get('north') || '0').toFixed(6)),
      south: parseFloat(parseFloat(searchParams.get('south') || '0').toFixed(6)),
      east: parseFloat(parseFloat(searchParams.get('east') || '0').toFixed(6)),
      west: parseFloat(parseFloat(searchParams.get('west') || '0').toFixed(6)),
    };

    // If no valid bounding box is provided, use Central Texas as default
    const hasValidBbox = bbox.north !== 0 || bbox.south !== 0 || bbox.east !== 0 || bbox.west !== 0;
    const defaultBbox = {
      north: 30.8,    // North of Austin
      south: 29.5,    // South of San Antonio
      east: -97.0,    // East boundary
      west: -99.0     // West boundary (covers Hill Country)
    };
    
    const activeBbox = hasValidBbox ? bbox : defaultBbox;

    // Get time range parameter (in hours), default to 8 hours
    const hours = parseInt(searchParams.get('hours') || '8');
    
    // Generate cache key for USGS data including time range
    const cacheKey = `usgs:${generateBboxCacheKey(activeBbox)}:${hours}h`;
    
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

    // Convert hours to ISO 8601 duration format for USGS API
    const period = `PT${hours}H`;
    // Include additional parameter codes for lake levels and reservoir storage
    // 00062 = Lake elevation, above NGVD 1929
    // 00054 = Reservoir storage, total
    // 62614 = Lake elevation above NAVD 1988
    let url = `${USGS_BASE_URL}?format=json&parameterCd=00065,00060,00062,00054,62614&siteStatus=active&period=${period}`;
    
    // Always include bounding box (either provided or default)
    url += `&bBox=${activeBbox.west},${activeBbox.south},${activeBbox.east},${activeBbox.north}`;

    console.log('Fetching from USGS:', url);

    const response = await axios.get(url);
    
    // Process the response to extract site information for metadata caching
    if (response.data?.value?.timeSeries) {
      const sites = response.data.value.timeSeries.map((ts: any) => ({
        id: ts.sourceInfo.siteCode[0]?.value || '',
        name: ts.sourceInfo.siteName || '',
        latitude: ts.sourceInfo.geoLocation.geogLocation.latitude,
        longitude: ts.sourceInfo.geoLocation.geogLocation.longitude
      })).filter((site: any) => site.id);
      
      // Cache site metadata for future use
      if (sites.length > 0) {
        console.log(`Caching metadata for ${sites.length} sites`);
        await CachedUSGSService.cacheSiteMetadata(sites);
      }
    }
    
    // Cache the results with shorter TTL for current conditions
    console.log('Caching USGS data for key:', cacheKey);
    await cacheSet(cacheKey, {...response.data, cached: false}, CACHE_TTL.USGS_CURRENT);
    
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
