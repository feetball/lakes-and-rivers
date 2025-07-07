import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cacheGet, cacheSet, generateBboxCacheKey, CACHE_TTL } from '@/lib/redis';
import { recordCacheStat } from '../admin/cache/route';
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

    // Texas bounding box (approximate)
    const TEXAS_BBOX = { north: 36.5, south: 25.8, east: -93.5, west: -106.7 };
    // If no valid bounding box is provided, use Central Texas as default
    const hasValidBbox = bbox.north !== 0 || bbox.south !== 0 || bbox.east !== 0 || bbox.west !== 0;
    const defaultBbox = {
      north: 30.8,    // North of Austin
      south: 29.5,    // South of San Antonio
      east: -97.0,    // East boundary
      west: -99.0     // West boundary (covers Hill Country)
    };
    const activeBbox = hasValidBbox ? bbox : defaultBbox;

    // If bbox matches Texas, serve from preloaded cache
    const isTexasBbox = Math.abs(activeBbox.north - TEXAS_BBOX.north) < 0.2 &&
      Math.abs(activeBbox.south - TEXAS_BBOX.south) < 0.2 &&
      Math.abs(activeBbox.east - TEXAS_BBOX.east) < 0.2 &&
      Math.abs(activeBbox.west - TEXAS_BBOX.west) < 0.2;
    if (isTexasBbox) {
      const texasKey = 'usgs:stations:texas:all';
      const cachedTexas = await cacheGet(texasKey);
      if (cachedTexas) {
        recordCacheStat('usgs', true);
        return NextResponse.json({ ...cachedTexas, cached: true }, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }
    }

    // Get time range parameter (in hours), default to 8 hours
    const hours = parseInt(searchParams.get('hours') || '8');
    
    // Generate cache key for USGS data including time range
    const cacheKey = `usgs:${generateBboxCacheKey(activeBbox)}:${hours}h`;
    
    // Try to get from cache first
    console.log('Checking cache for USGS data:', cacheKey);
    const cachedData = await cacheGet(cacheKey);
    if (cachedData) {
      recordCacheStat('usgs', true);
      console.log('Returning cached USGS data:', cacheKey);
      return NextResponse.json({ ...cachedData, cached: true }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    } else {
      recordCacheStat('usgs', false);
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
    
    // Process the USGS response into site data format
    let sites: any[] = [];
    
    if (response.data?.value?.timeSeries) {
      console.log('Processing', response.data.value.timeSeries.length, 'time series records');
      
      sites = response.data.value.timeSeries.map((timeSeries: any) => {
        const sourceInfo = timeSeries.sourceInfo;
        const siteCode = sourceInfo.siteCode[0]?.value || '';
        const location = sourceInfo.geoLocation.geogLocation;
        
        // Get the most recent value and historical data
        const values = timeSeries.values[0]?.value || [];
        const latestValue = values[values.length - 1];
        
        // Process chart data based on requested hours
        const chartData = values
          .filter((v: any) => v.value !== '-999999')
          .map((v: any) => ({
            time: new Date(v.dateTime).getTime(),
            value: parseFloat(v.value)
          }))
          .slice(-Math.min(values.length, Math.ceil(hours * 6))); // Approximate points based on hours (10-min intervals)
        
        let waterLevel: number | undefined;
        let waterLevelStatus: 'high' | 'normal' | 'low' | 'unknown' = 'unknown';
        let siteType: 'river' | 'lake' | 'reservoir' | 'stream' = 'river'; // Default to river
        
        // Determine site type based on variable name and site name
        const siteName = sourceInfo.siteName.toLowerCase();
        const variableName = timeSeries.variable.variableName.toLowerCase();
        
        if (siteName.includes('lake') || siteName.includes('reservoir') || 
            variableName.includes('lake') || variableName.includes('reservoir') || 
            variableName.includes('elevation') || variableName.includes('storage')) {
          siteType = siteName.includes('reservoir') ? 'reservoir' : 'lake';
        }
        
        if (latestValue && latestValue.value !== '-999999') {
          waterLevel = parseFloat(latestValue.value);
          
          // Enhanced classification based on site type and variable
          if (variableName.includes('gage height') || variableName.includes('elevation')) {
            if (siteType === 'lake' || siteType === 'reservoir') {
              // For lake/reservoir elevation, use different thresholds
              if (waterLevel > 500) waterLevelStatus = 'normal'; // Most lake elevations are in hundreds of feet
              else if (waterLevel > 200) waterLevelStatus = 'low';
              else waterLevelStatus = 'low';
            } else {
              // For river gage height, use existing logic
              if (waterLevel > 15) waterLevelStatus = 'high';
              else if (waterLevel > 2) waterLevelStatus = 'normal';
              else waterLevelStatus = 'low';
            }
          } else if (variableName.includes('streamflow')) {
            // For streamflow, classify based on typical ranges
            if (waterLevel > 1000) waterLevelStatus = 'high';
            else if (waterLevel > 100) waterLevelStatus = 'normal';
            else waterLevelStatus = 'low';
          } else if (variableName.includes('storage')) {
            // For reservoir storage, classify based on capacity
            if (waterLevel > 50000) waterLevelStatus = 'high';
            else if (waterLevel > 10000) waterLevelStatus = 'normal';
            else waterLevelStatus = 'low';
          }
        }

        return {
          id: siteCode,
          name: sourceInfo.siteName,
          latitude: location.latitude,
          longitude: location.longitude,
          waterLevel,
          waterLevelStatus,
          lastUpdated: latestValue?.dateTime,
          chartData,
          siteType, // Add site type to the returned data
          ...(variableName.includes('gage height') && {
            gageHeight: waterLevel
          }),
          ...(variableName.includes('streamflow') && {
            streamflow: waterLevel
          }),
          ...(variableName.includes('elevation') && {
            lakeElevation: waterLevel
          }),
          ...(variableName.includes('storage') && {
            reservoirStorage: waterLevel
          })
        };
      });

      // Remove duplicates by site ID and merge data
      const uniqueSitesMap = new Map();
      sites.forEach(site => {
        if (uniqueSitesMap.has(site.id)) {
          const existing = uniqueSitesMap.get(site.id);
          // Merge data if we have multiple parameters for the same site
          if (site.gageHeight) existing.gageHeight = site.gageHeight;
          if (site.streamflow) existing.streamflow = site.streamflow;
          if (site.lakeElevation) existing.lakeElevation = site.lakeElevation;
          if (site.reservoirStorage) existing.reservoirStorage = site.reservoirStorage;
          // Keep the most descriptive site type
          if (site.siteType && (site.siteType === 'lake' || site.siteType === 'reservoir')) {
            existing.siteType = site.siteType;
          }
          // Use chart data from the most recent/complete dataset
          if (site.chartData && site.chartData.length > (existing.chartData?.length || 0)) {
            existing.chartData = site.chartData;
          }
        } else {
          uniqueSitesMap.set(site.id, site);
        }
      });
      
      sites = Array.from(uniqueSitesMap.values());
      
      // Cache site metadata for future use
      const siteMetadata = sites.map(site => ({
        id: site.id,
        name: site.name,
        latitude: site.latitude,
        longitude: site.longitude
      }));
      
      if (siteMetadata.length > 0) {
        console.log(`Caching metadata for ${siteMetadata.length} sites`);
        await CachedUSGSService.cacheSiteMetadata(siteMetadata);
      }
    }
    
    // Return processed sites data
    const result = { sites, cached: false };
    
    // Cache the processed results with shorter TTL for current conditions
    console.log('Caching USGS data for key:', cacheKey);
    await cacheSet(cacheKey, result, CACHE_TTL.USGS_CURRENT);
    
    // Add CORS headers
    return NextResponse.json(result, {
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
