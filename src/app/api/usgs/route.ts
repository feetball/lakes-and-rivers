// Texas bounding box for filtering
const TEXAS_BBOX = { north: 36.5, south: 25.8, east: -93.5, west: -106.7 };

// Function to check if a site is within Texas boundaries
function isWithinTexas(latitude: number, longitude: number): boolean {
  return latitude >= TEXAS_BBOX.south && latitude <= TEXAS_BBOX.north &&
         longitude >= TEXAS_BBOX.west && longitude <= TEXAS_BBOX.east;
}

// Validate bounding box for USGS API
function isValidBbox(bbox: { north: number; south: number; east: number; west: number }): boolean {
  // Basic coordinate validation
  if (!(bbox.west < bbox.east &&
        bbox.south < bbox.north &&
        bbox.west >= -180 && bbox.east <= 180 &&
        bbox.south >= -90 && bbox.north <= 90)) {
    return false;
  }

  // USGS API specific size constraints
  const width = bbox.east - bbox.west;
  const height = bbox.north - bbox.south;
  
  // Maximum height is generally 10 degrees
  if (height > 10) {
    console.warn(`Bounding box height too large: ${height.toFixed(2)} degrees (max: 10)`);
    return false;
  }
  
  // Width constraints depend on latitude - USGS uses a formula based on latitude
  // At higher latitudes, maximum width decreases due to meridian convergence
  const centerLat = (bbox.north + bbox.south) / 2;
  const latRadians = Math.abs(centerLat) * Math.PI / 180;
  
  // USGS formula approximation: max width decreases with cosine of latitude
  // Base max width is ~3.5 degrees at equator, scaling down with latitude
  const maxWidth = 3.5 * Math.cos(latRadians);
  
  if (width > maxWidth) {
    console.warn(`Bounding box width too large: ${width.toFixed(2)} degrees (max: ${maxWidth.toFixed(2)} at lat ${centerLat.toFixed(1)})`);
    return false;
  }
  
  return true;
}
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cacheGet, cacheSet, generateBboxCacheKey, CACHE_TTL } from '@/lib/redis';
import { recordCacheStat } from '../admin/cache/route';
import { CachedUSGSService } from '@/services/cachedUsgs';

const USGS_BASE_URL = 'https://waterservices.usgs.gov/nwis/iv/';

// Control whether to allow live USGS API fetching (default: false - Redis only)
const ALLOW_LIVE_USGS_FETCH = process.env.ALLOW_LIVE_USGS_FETCH === 'true';

// Make this route dynamic to avoid build-time static generation
export const dynamic = 'force-dynamic';

// Utility functions for grid-based fetching
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round7(v: number): number {
  return Math.round(v * 1e7) / 1e7;
}

// Fetch data using grid approach to avoid USGS API size limits
async function fetchUSGSDataWithGrid(
  bbox: { north: number; south: number; east: number; west: number },
  hours: number
): Promise<any> {
  console.log('Using grid-based fetch for large bounding box:', bbox);
  
  const gridRows = 6;
  const gridCols = 6;
  const latStep = (bbox.north - bbox.south) / gridRows;
  const lonStep = (bbox.east - bbox.west) / gridCols;
  
  let allTimeSeries: any[] = [];
  let allIds = new Set<string>();
  let totalFetched = 0;
  
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      let south = bbox.south + row * latStep;
      let north = south + latStep;
      let west = bbox.west + col * lonStep;
      let east = west + lonStep;
      
      // Clamp and round coordinates
      south = round7(clamp(south, -90, 90));
      north = round7(clamp(north, -90, 90));
      west = round7(clamp(west, -180, 180));
      east = round7(clamp(east, -180, 180));
      
      const cellBbox = { west, south, east, north };
      
      if (!isValidBbox(cellBbox)) {
        console.warn(`Skipping invalid grid cell: W${west} S${south} E${east} N${north}`);
        continue;
      }
      
      const period = `PT${hours}H`;
      const url = `${USGS_BASE_URL}?format=json&parameterCd=00065,00060,00062,00054,62614&siteStatus=active&period=${period}&bBox=${west},${south},${east},${north}`;
      
      console.log(`Fetching grid cell [${row},${col}]: W${west} S${south} E${east} N${north}`);
      
      // Retry logic for each cell
      let attempt = 0;
      const maxAttempts = 3;
      let success = false;
      
      while (attempt < maxAttempts && !success) {
        try {
          const response = await axios.get(url);
          
          if (response.data?.value?.timeSeries && response.data.value.timeSeries.length > 0) {
            let newCount = 0;
            for (const ts of response.data.value.timeSeries) {
              // Validate data structure before accessing nested properties
              if (ts?.sourceInfo?.siteCode?.length > 0) {
                const siteId = ts.sourceInfo.siteCode[0]?.value;
                if (siteId && !allIds.has(siteId)) {
                  allTimeSeries.push(ts);
                  allIds.add(siteId);
                  newCount++;
                }
              }
            }
            totalFetched += response.data.value.timeSeries.length;
            console.log(`Grid cell [${row},${col}] timeSeries: ${response.data.value.timeSeries.length}, new unique: ${newCount}`);
          } else {
            console.warn(`Grid cell [${row},${col}] data missing or empty`);
          }
          success = true;
        } catch (err: any) {
          attempt++;
          if (attempt < maxAttempts) {
            console.warn(`Grid cell [${row},${col}] failed (attempt ${attempt}/${maxAttempts}): ${err.message}, retrying in 1s...`);
            await new Promise(r => setTimeout(r, 1000));
          } else {
            console.warn(`Grid cell [${row},${col}] failed after ${maxAttempts} attempts: ${err.message}`);
          }
        }
      }
      
      // Delay between grid cells to be respectful to the API
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  console.log(`Grid fetch complete. Total unique timeSeries: ${allTimeSeries.length}, total fetched: ${totalFetched}`);
  return { value: { timeSeries: allTimeSeries } };
}

// Process USGS API response data into site format
function processUSGSResponse(responseData: any, hours: number): any[] {
  let sites: any[] = [];
  
  if (responseData?.value?.timeSeries) {
    console.log('Processing', responseData.value.timeSeries.length, 'time series records');
    
    sites = responseData.value.timeSeries
      .filter((timeSeries: any) => {
        // Validate required data structure
        return timeSeries?.sourceInfo?.siteCode?.length > 0 &&
               timeSeries?.sourceInfo?.geoLocation?.geogLocation &&
               timeSeries?.values?.length > 0;
      })
      .map((timeSeries: any) => {
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
        siteType: siteType === 'lake' || siteType === 'reservoir' ? siteType : 'river', // Add site type to the returned data
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
    
    // Filter to only include sites within Texas boundaries
    sites = sites.filter(site => isWithinTexas(site.latitude, site.longitude));
    
    console.log(`Filtered to ${sites.length} sites within Texas boundaries`);
  }
  
  return sites;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get time range parameter (in hours), default to 8 hours
    const hours = parseInt(searchParams.get('hours') || '8');
    
    const bbox = {
      north: parseFloat(parseFloat(searchParams.get('north') || '0').toFixed(6)),
      south: parseFloat(parseFloat(searchParams.get('south') || '0').toFixed(6)),
      east: parseFloat(parseFloat(searchParams.get('east') || '0').toFixed(6)),
      west: parseFloat(parseFloat(searchParams.get('west') || '0').toFixed(6)),
    };

    // Texas bounding box (approximate)
    const TEXAS_BBOX = { north: 36.5, south: 25.8, east: -93.5, west: -106.7 };
    // If no valid bounding box is provided, use full Texas as default
    const hasValidBbox = bbox.north !== 0 || bbox.south !== 0 || bbox.east !== 0 || bbox.west !== 0;
    const defaultBbox = TEXAS_BBOX; // Use full Texas as default
    const activeBbox = hasValidBbox ? bbox : defaultBbox;

    // Check if bbox matches Texas first (before validation)
    const isTexasBbox = Math.abs(activeBbox.north - TEXAS_BBOX.north) < 0.2 &&
      Math.abs(activeBbox.south - TEXAS_BBOX.south) < 0.2 &&
      Math.abs(activeBbox.east - TEXAS_BBOX.east) < 0.2 &&
      Math.abs(activeBbox.west - TEXAS_BBOX.west) < 0.2;
    
    if (isTexasBbox) {
      console.log('Texas bounding box detected, checking cache first');
      const texasKey = 'usgs:stations:texas:all';
      const cachedTexas = await cacheGet(texasKey);
      if (cachedTexas) {
        recordCacheStat('usgs', true);
        // Check if the cached data is already in the processed format
        if (cachedTexas.sites) {
          // Already processed format
          return NextResponse.json({ ...cachedTexas, cached: true }, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        } else if (cachedTexas.value?.timeSeries) {
          // Raw USGS format - need to process it
          console.log('Processing cached raw USGS data for Texas');
          const processedSites = processUSGSResponse(cachedTexas, hours);
          const result = { sites: processedSites, cached: true };
          return NextResponse.json(result, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        }
      }
      
      // No Texas cache available, check if live fetching is allowed
      if (!ALLOW_LIVE_USGS_FETCH) {
        console.log('No Texas cache available and live fetching disabled');
        return NextResponse.json(
          { 
            error: 'No cached Texas data available and live USGS API fetching is disabled',
            sites: [],
            cached: false 
          },
          { 
            status: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          }
        );
      }
      
      // Use grid-based approach for Texas
      console.log('Fetching Texas data using grid approach');
      try {
        const gridResponse = await fetchUSGSDataWithGrid(activeBbox, hours);
        const sites = processUSGSResponse(gridResponse, hours);
        
        // Cache site metadata for future use  
        const siteMetadata = sites.map(site => ({
          id: site.id,
          name: site.name,
          latitude: site.latitude,
          longitude: site.longitude
        }));
        
        if (siteMetadata.length > 0) {
          console.log(`Caching metadata for ${siteMetadata.length} sites from Texas grid fetch`);
          await CachedUSGSService.cacheSiteMetadata(siteMetadata);
        }
        
        // Return processed sites data
        const result = { sites, cached: false };
        
        // Cache the processed results for Texas
        console.log('Caching Texas grid-fetched USGS data for key:', texasKey);
        await cacheSet(texasKey, result, CACHE_TTL.USGS_CURRENT);
        
        return NextResponse.json(result, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      } catch (error) {
        console.error('Texas grid-based USGS fetch failed:', error);
        return NextResponse.json(
          { error: 'Failed to fetch Texas data', sites: [], cached: false },
          {
            status: 500,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          }
        );
      }
    }

    // Validate bounding box before making USGS API call
    if (!isValidBbox(activeBbox)) {
      console.warn('Bounding box too large for USGS API:', activeBbox);
      
      // Check if this is a Texas-sized bbox that needs grid approach
      const bboxWidth = activeBbox.east - activeBbox.west;
      const bboxHeight = activeBbox.north - activeBbox.south;
      
      if (bboxWidth > 10 || bboxHeight > 8) {
        console.log('Large bounding box detected, using grid-based fetch approach');
        
        // Check cache first for the full bbox
        const cacheKey = `usgs:${generateBboxCacheKey(activeBbox)}:${hours}h`;
        const cachedData = await cacheGet(cacheKey);
        if (cachedData) {
          recordCacheStat('usgs', true);
          return NextResponse.json({ ...cachedData, cached: true }, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        }
        
        if (!ALLOW_LIVE_USGS_FETCH) {
          console.log('Live USGS API fetching disabled, cannot fetch large bbox without cache');
          return NextResponse.json(
            { error: 'Large bounding box requires live fetching which is disabled', sites: [], cached: false },
            {
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
              },
            }
          );
        }
        
        // Use grid-based approach for large bounding boxes
        try {
          const gridResponse = await fetchUSGSDataWithGrid(activeBbox, hours);
          const sites = processUSGSResponse(gridResponse, hours);
          
          // Cache site metadata for future use  
          const siteMetadata = sites.map(site => ({
            id: site.id,
            name: site.name,
            latitude: site.latitude,
            longitude: site.longitude
          }));
          
          if (siteMetadata.length > 0) {
            console.log(`Caching metadata for ${siteMetadata.length} sites from grid fetch`);
            await CachedUSGSService.cacheSiteMetadata(siteMetadata);
          }
          
          // Return processed sites data
          const result = { sites, cached: false };
          
          // Cache the processed results
          console.log('Caching grid-fetched USGS data for key:', cacheKey);
          await cacheSet(cacheKey, result, CACHE_TTL.USGS_CURRENT);
          
          return NextResponse.json(result, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        } catch (error) {
          console.error('Grid-based USGS fetch failed:', error);
          return NextResponse.json(
            { error: 'Failed to fetch large bounding box data', sites: [], cached: false },
            {
              status: 500,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
              },
            }
          );
        }
      }
      
      // Instead of failing, try to use a smaller default bounding box
      const fallbackBbox = {
        north: Math.min(activeBbox.north, activeBbox.south + 3.0),  // Limit height to 3 degrees
        south: activeBbox.south,
        east: Math.min(activeBbox.east, activeBbox.west + 2.0),    // Limit width to 2 degrees
        west: activeBbox.west
      };
      
      // Check if the fallback bbox is valid
      if (isValidBbox(fallbackBbox)) {
        console.log('Using fallback bounding box:', fallbackBbox);
        // Update activeBbox to use the valid fallback
        Object.assign(activeBbox, fallbackBbox);
      } else {
        // If even the fallback fails, return an error
        console.warn('Even fallback bbox is invalid, using cached data only');
        const cacheKey = `usgs:${generateBboxCacheKey(activeBbox)}:${hours}h`;
        const cachedData = await cacheGet(cacheKey);
        if (cachedData) {
          recordCacheStat('usgs', true);
          return NextResponse.json({ ...cachedData, cached: true }, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        }
        
        return NextResponse.json(
          { error: 'Bounding box too large for USGS API and no cached data available', sites: [], cached: false },
          {
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          }
        );
      }
    }

    // Check if live USGS API fetching is disabled
    if (!ALLOW_LIVE_USGS_FETCH) {
      console.log('Live USGS API fetching is disabled, checking cache only');
      // Try to get from cache first
      const cacheKey = `usgs:${generateBboxCacheKey(activeBbox)}:${hours}h`;
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
        console.log('No cached data available and live fetching disabled');
        return NextResponse.json(
          { 
            error: 'No cached data available and live USGS API fetching is disabled',
            sites: [],
            cached: false 
          },
          { 
            status: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          }
        );
      }
    }

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

    if (!ALLOW_LIVE_USGS_FETCH) {
      console.log('Live USGS fetching is disabled. Returning cached data if available.');
      return NextResponse.json({ sites: [], cached: true }, {
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
    
    // Process the USGS response into site data format
    const sites = processUSGSResponse(response.data, hours);
    
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
