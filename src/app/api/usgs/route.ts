import { promises as fs } from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';
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
    logger.warn(`Bounding box height too large: ${height.toFixed(2)} degrees (max: 10)`);
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
    logger.warn(`Bounding box width too large: ${width.toFixed(2)} degrees (max: ${maxWidth.toFixed(2)} at lat ${centerLat.toFixed(1)})`);
    return false;
  }
  
  return true;
}
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cacheGet, cacheSet, generateBboxCacheKey, CACHE_TTL } from '@/lib/redis';
import { recordCacheStat } from '../admin/cache/route';
import { CachedUSGSService } from '@/services/cachedUsgs';
import { validateHours } from '@/lib/security';
import { logger } from '@/lib/logger';

const USGS_BASE_URL = 'https://waterservices.usgs.gov/nwis/iv/';
const STATIC_USGS_GZ_PATH = path.join(process.cwd(), 'data', 'static', 'texas-usgs-stations.json.gz');
const STATIC_USGS_JSON_PATH = path.join(process.cwd(), 'data', 'static', 'texas-usgs-stations.json');

// Control whether to allow live USGS API fetching (default: false - Redis only)
const ALLOW_LIVE_USGS_FETCH = process.env.ALLOW_LIVE_USGS_FETCH === 'true';

type UsgsSite = {
  latitude: number;
  longitude: number;
  [key: string]: unknown;
};

const staticSitesByHours = new Map<number, UsgsSite[]>();

// Guards against spawning multiple concurrent Texas refreshes.
const inflightTexasRefresh = new Map<string, Promise<void>>();

async function refreshTexasCacheInBackground(
  bbox: { north: number; south: number; east: number; west: number },
  hours: number,
  cacheKey: string
): Promise<void> {
  if (inflightTexasRefresh.has(cacheKey)) return;
  const task = (async () => {
    try {
      logger.debug('[background] Refreshing Texas USGS cache via live grid fetch');
      const gridResponse = await fetchUSGSDataWithGrid(bbox, hours);
      const sites = processUSGSResponse(gridResponse, hours);
      if (sites.length === 0) {
        logger.warn('[background] Grid fetch returned zero Texas sites; leaving cache untouched');
        return;
      }
      const siteMetadata = sites.map((site: any) => ({
        id: site.id, name: site.name, latitude: site.latitude, longitude: site.longitude,
      }));
      await CachedUSGSService.cacheSiteMetadata(siteMetadata);
      await cacheSet(cacheKey, { sites, cached: false }, CACHE_TTL.USGS_CURRENT);
      logger.debug(`[background] Cached ${sites.length} Texas sites`);
    } catch (err) {
      logger.warn('[background] Texas cache refresh failed:', err);
    } finally {
      inflightTexasRefresh.delete(cacheKey);
    }
  })();
  inflightTexasRefresh.set(cacheKey, task);
}

// Make this route dynamic to avoid build-time static generation
export const dynamic = 'force-dynamic';

function isSiteWithinBbox(
  site: { latitude?: number; longitude?: number },
  bbox: { north: number; south: number; east: number; west: number }
): boolean {
  if (!Number.isFinite(site.latitude) || !Number.isFinite(site.longitude)) return false;
  return (
    site.latitude! >= bbox.south &&
    site.latitude! <= bbox.north &&
    site.longitude! >= bbox.west &&
    site.longitude! <= bbox.east
  );
}

async function loadStaticTexasSites(hours: number): Promise<UsgsSite[]> {
  if (staticSitesByHours.has(hours)) {
    return staticSitesByHours.get(hours) || [];
  }

  try {
    let rawData: unknown;
    try {
      const compressed = await fs.readFile(STATIC_USGS_GZ_PATH);
      rawData = JSON.parse(gunzipSync(compressed).toString('utf8'));
    } catch {
      const json = await fs.readFile(STATIC_USGS_JSON_PATH, 'utf8');
      rawData = JSON.parse(json);
    }

    const processed = processUSGSResponse(rawData, hours) as UsgsSite[];
    staticSitesByHours.set(hours, processed);
    logger.debug(`Loaded ${processed.length} static USGS sites for ${hours}h fallback`);
    return processed;
  } catch (error) {
    logger.warn('Static USGS fallback unavailable:', error);
    staticSitesByHours.set(hours, []);
    return [];
  }
}

async function getStaticFallbackSites(
  hours: number,
  bbox: { north: number; south: number; east: number; west: number }
): Promise<UsgsSite[]> {
  const sites = await loadStaticTexasSites(hours);
  return sites.filter((site) => isSiteWithinBbox(site, bbox));
}

// Utility functions for grid-based fetching
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round7(v: number): number {
  return Math.round(v * 1e7) / 1e7;
}

// Fetch data using grid approach to avoid USGS API size limits.
// Cells are fetched in parallel with a small concurrency limit rather than
// one-at-a-time — the previous serial version took 18+ seconds of artificial
// delay on every cold load.
async function fetchUSGSDataWithGrid(
  bbox: { north: number; south: number; east: number; west: number },
  hours: number
): Promise<any> {
  logger.debug('Using grid-based fetch for large bounding box:', bbox);

  const gridRows = 4;
  const gridCols = 4;
  const concurrency = 6;
  const latStep = (bbox.north - bbox.south) / gridRows;
  const lonStep = (bbox.east - bbox.west) / gridCols;

  type Cell = { row: number; col: number; bbox: { west: number; south: number; east: number; north: number } };
  const cells: Cell[] = [];
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const south = round7(clamp(bbox.south + row * latStep, -90, 90));
      const north = round7(clamp(south + latStep, -90, 90));
      const west = round7(clamp(bbox.west + col * lonStep, -180, 180));
      const east = round7(clamp(west + lonStep, -180, 180));
      const cellBbox = { west, south, east, north };
      if (!isValidBbox(cellBbox)) {
        logger.warn(`Skipping invalid grid cell: W${west} S${south} E${east} N${north}`);
        continue;
      }
      cells.push({ row, col, bbox: cellBbox });
    }
  }

  const period = `PT${hours}H`;
  const allTimeSeries: any[] = [];
  const seenKeys = new Set<string>();
  let totalFetched = 0;

  const fetchCell = async (cell: Cell): Promise<any[]> => {
    const { west, south, east, north } = cell.bbox;
    const url = `${USGS_BASE_URL}?format=json&parameterCd=00065,00060,00062,00054,62614&siteStatus=active&period=${period}&bBox=${west},${south},${east},${north}`;
    try {
      const response = await axios.get(url, { timeout: 20000 });
      return response.data?.value?.timeSeries || [];
    } catch (err: any) {
      logger.warn(`Grid cell [${cell.row},${cell.col}] failed: ${err.message}`);
      return [];
    }
  };

  for (let i = 0; i < cells.length; i += concurrency) {
    const batch = cells.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(fetchCell));
    for (const tsList of results) {
      totalFetched += tsList.length;
      for (const ts of tsList) {
        if (ts?.sourceInfo?.siteCode?.length > 0) {
          const siteId = ts.sourceInfo.siteCode[0]?.value;
          const varName = ts.variable?.variableName || '';
          const dedupKey = `${siteId}:${varName}`;
          if (siteId && !seenKeys.has(dedupKey)) {
            allTimeSeries.push(ts);
            seenKeys.add(dedupKey);
          }
        }
      }
    }
  }

  logger.debug(`Grid fetch complete. Total unique timeSeries: ${allTimeSeries.length}, total fetched: ${totalFetched}`);
  return { value: { timeSeries: allTimeSeries } };
}

// Process USGS API response data into site format
function processUSGSResponse(responseData: any, hours: number): any[] {
  let sites: any[] = [];
  
  if (responseData?.value?.timeSeries) {
    logger.debug('Processing', responseData.value.timeSeries.length, 'time series records');
    
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
    
    logger.debug(`Filtered to ${sites.length} sites within Texas boundaries`);
  }
  
  return sites;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get time range parameter (in hours), default to 8 hours
    const hours = parseInt(searchParams.get('hours') || '8');

    if (!validateHours(hours)) {
      return NextResponse.json(
        { error: 'Invalid hours value. Must be an integer between 1 and 168.' },
        { status: 400 }
      );
    }

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
      logger.debug('Texas bounding box detected, checking cache first');
      const texasKey = 'usgs:stations:texas:all';
      const cachedTexas = await cacheGet(texasKey);
      if (cachedTexas) {
        recordCacheStat('usgs', true);
        // Check if the cached data is already in the processed format
        if (cachedTexas.sites) {
          // Already processed format
          return NextResponse.json({ ...cachedTexas, cached: true });
        } else if (cachedTexas.value?.timeSeries) {
          // Raw USGS format - need to process it
          logger.debug('Processing cached raw USGS data for Texas');
          const processedSites = processUSGSResponse(cachedTexas, hours);
          const result = { sites: processedSites, cached: true };
          return NextResponse.json(result);
        }
      }

      recordCacheStat('usgs', false);

      // Cache miss for Texas. The grid-based live fetch takes many seconds,
      // so always prefer the bundled static snapshot if available — it gives
      // the client something to render immediately. A background refresh
      // below will populate the Redis cache for the next request.
      const staticSites = await getStaticFallbackSites(hours, activeBbox);

      if (ALLOW_LIVE_USGS_FETCH) {
        void refreshTexasCacheInBackground(activeBbox, hours, texasKey);
      }

      if (staticSites.length > 0) {
        return NextResponse.json({ sites: staticSites, cached: true, source: 'static' });
      }

      if (!ALLOW_LIVE_USGS_FETCH) {
        return NextResponse.json({
          error: 'No cached Texas data available and static fallback data is unavailable',
          sites: [],
          cached: false
        }, { status: 200 });
      }

      // No static fallback — fall through to a synchronous grid fetch.
      logger.debug('Fetching Texas data using grid approach (no static fallback)');
      try {
        const gridResponse = await fetchUSGSDataWithGrid(activeBbox, hours);
        const sites = processUSGSResponse(gridResponse, hours);
        const siteMetadata = sites.map(site => ({
          id: site.id, name: site.name, latitude: site.latitude, longitude: site.longitude,
        }));
        if (siteMetadata.length > 0) {
          await CachedUSGSService.cacheSiteMetadata(siteMetadata);
        }
        const result = { sites, cached: false };
        await cacheSet(texasKey, result, CACHE_TTL.USGS_CURRENT);
        return NextResponse.json(result);
      } catch (error) {
        logger.error('Texas grid-based USGS fetch failed:', error);
        return NextResponse.json(
          { error: 'Failed to fetch Texas data', sites: [], cached: false },
          { status: 500 }
        );
      }
    }

    // Validate bounding box before making USGS API call
    if (!isValidBbox(activeBbox)) {
      logger.warn('Bounding box too large for USGS API:', activeBbox);
      
      // Check if this is a Texas-sized bbox that needs grid approach
      const bboxWidth = activeBbox.east - activeBbox.west;
      const bboxHeight = activeBbox.north - activeBbox.south;
      
      if (bboxWidth > 10 || bboxHeight > 8) {
        logger.debug('Large bounding box detected, using grid-based fetch approach');
        
        // Check cache first for the full bbox
        const cacheKey = `usgs:${generateBboxCacheKey(activeBbox)}:${hours}h`;
        const cachedData = await cacheGet(cacheKey);
        if (cachedData) {
          recordCacheStat('usgs', true);
          return NextResponse.json({ ...cachedData, cached: true });
        }

        if (!ALLOW_LIVE_USGS_FETCH) {
          logger.debug('Live USGS API fetching disabled, cannot fetch large bbox without cache');
          return NextResponse.json(
            { error: 'Large bounding box requires live fetching which is disabled', sites: [], cached: false },
            {
              status: 400,
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
            logger.debug(`Caching metadata for ${siteMetadata.length} sites from grid fetch`);
            await CachedUSGSService.cacheSiteMetadata(siteMetadata);
          }
          
          // Return processed sites data
          const result = { sites, cached: false };
          
          // Cache the processed results
          logger.debug('Caching grid-fetched USGS data for key:', cacheKey);
          await cacheSet(cacheKey, result, CACHE_TTL.USGS_CURRENT);
          
          return NextResponse.json(result);
        } catch (error) {
          logger.error('Grid-based USGS fetch failed:', error);
          return NextResponse.json(
            { error: 'Failed to fetch large bounding box data', sites: [], cached: false },
            {
              status: 500,
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
        logger.debug('Using fallback bounding box:', fallbackBbox);
        // Update activeBbox to use the valid fallback
        Object.assign(activeBbox, fallbackBbox);
      } else {
        // If even the fallback fails, return an error
        logger.warn('Even fallback bbox is invalid, using cached data only');
        const cacheKey = `usgs:${generateBboxCacheKey(activeBbox)}:${hours}h`;
        const cachedData = await cacheGet(cacheKey);
        if (cachedData) {
          recordCacheStat('usgs', true);
          return NextResponse.json({ ...cachedData, cached: true });
        }

        return NextResponse.json(
          { error: 'Bounding box too large for USGS API and no cached data available', sites: [], cached: false },
          {
            status: 400,
          }
        );
      }
    }

    // Check if live USGS API fetching is disabled
    if (!ALLOW_LIVE_USGS_FETCH) {
      logger.debug('Live USGS API fetching is disabled, checking cache only');
      // Try to get from cache first
      const cacheKey = `usgs:${generateBboxCacheKey(activeBbox)}:${hours}h`;
      const cachedData = await cacheGet(cacheKey);
      if (cachedData) {
        recordCacheStat('usgs', true);
        logger.debug('Returning cached USGS data:', cacheKey);
        return NextResponse.json({ ...cachedData, cached: true });
      } else {
        recordCacheStat('usgs', false);
        logger.debug('No cached data available and live fetching disabled - trying static fallback');
        const staticSites = await getStaticFallbackSites(hours, activeBbox);
        if (staticSites.length > 0) {
          return NextResponse.json({ sites: staticSites, cached: true, source: 'static' });
        }
        return NextResponse.json({
          error: 'No cached data available and static fallback data is unavailable',
          sites: [],
          cached: false
        }, { status: 200 });
      }
    }

    // Generate cache key for USGS data including time range
    const cacheKey = `usgs:${generateBboxCacheKey(activeBbox)}:${hours}h`;
    
    // Try to get from cache first
    logger.debug('Checking cache for USGS data:', cacheKey);
    const cachedData = await cacheGet(cacheKey);
    if (cachedData) {
      recordCacheStat('usgs', true);
      logger.debug('Returning cached USGS data:', cacheKey);
      return NextResponse.json({ ...cachedData, cached: true });
    } else {
      recordCacheStat('usgs', false);
    }

    if (!ALLOW_LIVE_USGS_FETCH) {
      logger.debug('Live USGS fetching is disabled. Returning cached data if available.');
      return NextResponse.json({ sites: [], cached: true });
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

    logger.debug('Fetching from USGS:', url);

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
      logger.debug(`Caching metadata for ${siteMetadata.length} sites`);
      await CachedUSGSService.cacheSiteMetadata(siteMetadata);
    }
    
    // Return processed sites data
    const result = { sites, cached: false };
    
    // Cache the processed results with shorter TTL for current conditions
    logger.debug('Caching USGS data for key:', cacheKey);
    await cacheSet(cacheKey, result, CACHE_TTL.USGS_CURRENT);
    
    return NextResponse.json(result);
  } catch (error) {
    logger.error('USGS API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch USGS data' },
      { status: 500 }
    );
  }
}
