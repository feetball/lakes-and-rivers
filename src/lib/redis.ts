import { createClient } from 'redis';

let redis: any = null;

export async function getRedisClient() {
  if (!redis) {
    // Skip Redis connection if no REDIS_URL is provided (Railway will set this when Redis addon is added)
    // Also skip during build time
    if (!process.env.REDIS_URL || process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
      console.log('No REDIS_URL found or build time, running without cache');
      return null;
    }
    
    console.log('Attempting Redis connection with URL:', process.env.REDIS_URL?.replace(/:[^:]*@/, ':***@')); // Hide password in logs
    
    try {
      redis = createClient({
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: 10000,
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              console.log('Redis max retries exceeded, disabling cache');
              return false;
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      redis.on('error', (err: any) => {
        console.log('Redis Client Error', err);
        redis = null; // Reset client on error
      });

      redis.on('connect', () => {
        console.log('Redis client connected');
      });

      await redis.connect();
    } catch (error) {
      console.warn('Redis connection failed, continuing without cache:', error);
      redis = null;
    }
  }

  return redis;
}

export async function cacheGet(key: string): Promise<any> {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.warn('Redis get error:', error);
    return null;
  }
}

export async function cacheSet(key: string, value: any, ttlSeconds: number = 3600): Promise<boolean> {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('Redis set error:', error);
    return false;
  }
}

export async function cacheDelete(key: string): Promise<boolean> {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    
    await client.del(key);
    return true;
  } catch (error) {
    console.warn('Redis delete error:', error);
    return false;
  }
}

// Generate cache key for bounding box
export function generateBboxCacheKey(bbox: { north: number; south: number; east: number; west: number }): string {
  // Round to 3 decimal places to create reasonable cache granularity
  const rounded = {
    north: Math.round(bbox.north * 1000) / 1000,
    south: Math.round(bbox.south * 1000) / 1000,
    east: Math.round(bbox.east * 1000) / 1000,
    west: Math.round(bbox.west * 1000) / 1000,
  };
  
  return `waterways:${rounded.south},${rounded.west},${rounded.north},${rounded.east}`;
}

// Enhanced cache utilities for historical data
export async function cacheGetMultiple(keys: string[]): Promise<{ [key: string]: any }> {
  try {
    const client = await getRedisClient();
    if (!client || keys.length === 0) return {};
    
    const values = await client.mGet(keys);
    const result: { [key: string]: any } = {};
    
    keys.forEach((key, index) => {
      if (values[index]) {
        try {
          result[key] = JSON.parse(values[index]);
        } catch (error) {
          console.warn(`Failed to parse cached value for key ${key}:`, error);
        }
      }
    });
    
    return result;
  } catch (error) {
    console.warn('Redis mGet error:', error);
    return {};
  }
}

export async function cacheSetMultiple(keyValuePairs: { [key: string]: any }, ttlSeconds: number = 3600): Promise<boolean> {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    
    const pipeline = client.multi();
    
    Object.entries(keyValuePairs).forEach(([key, value]) => {
      pipeline.setEx(key, ttlSeconds, JSON.stringify(value));
    });
    
    await pipeline.exec();
    return true;
  } catch (error) {
    console.warn('Redis mSet error:', error);
    return false;
  }
}

// Generate cache key for historical gauge data
export function generateHistoricalDataKey(siteId: string, hours: number): string {
  return `gauge_historical:${siteId}:${hours}h`;
}

// Generate cache key for site metadata
export function generateSiteMetadataKey(siteId: string): string {
  return `gauge_metadata:${siteId}`;
}

// Cache configuration constants
export const CACHE_TTL = {
  WATERWAYS: 24 * 60 * 60, // 24 hours - waterways change rarely
  USGS_CURRENT: 15 * 60,   // 15 minutes - current conditions
  HISTORICAL_DATA: 60 * 60, // 1 hour - historical data
  SITE_METADATA: 24 * 60 * 60, // 24 hours - site info rarely changes
  FLOOD_STAGES: 7 * 24 * 60 * 60 // 7 days - flood stage data
};



// Texas bounding box (approximate)
export const TEXAS_BBOX = {
  north: 36.5,
  south: 25.8,
  east: -93.5,
  west: -106.7
};

// Fetch and cache all Texas USGS stations
export async function cacheTexasStations() {
  // Batch the Texas bbox into a grid (4x4)
  const gridRows = 4;
  const gridCols = 4;
  const latStep = (TEXAS_BBOX.north - TEXAS_BBOX.south) / gridRows;
  const lonStep = (TEXAS_BBOX.east - TEXAS_BBOX.west) / gridCols;
  const key = 'usgs:stations:texas:all';
  let allTimeSeries = [];
  let allIds = new Set();
  let totalFetched = 0;
  // Clamp helpers
  function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
  }
  function isValidBbox(west: number, south: number, east: number, north: number) {
    // USGS expects: west < east, south < north, all within valid lat/lon
    return (
      west < east &&
      south < north &&
      west >= -180 && east <= 180 &&
      south >= -90 && north <= 90
    );
  }
  try {
    console.log('[PRELOAD] Fetching all Texas USGS stations in batches...');
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        let south = TEXAS_BBOX.south + row * latStep;
        let north = south + latStep;
        let west = TEXAS_BBOX.west + col * lonStep;
        let east = west + lonStep;
        // Clamp to valid lat/lon
        south = clamp(south, -90, 90);
        north = clamp(north, -90, 90);
        west = clamp(west, -180, 180);
        east = clamp(east, -180, 180);
        // Round to 7 decimal places for USGS API
        const round7 = (v: number) => Math.round(v * 1e7) / 1e7;
        south = round7(south);
        north = round7(north);
        west = round7(west);
        east = round7(east);
        if (!isValidBbox(west, south, east, north)) {
          console.warn(`[PRELOAD] Skipping invalid bbox: W${west} S${south} E${east} N${north}`);
          continue;
        }
        const usgsUrl = `https://waterservices.usgs.gov/nwis/iv/?format=json&bBox=${west},${south},${east},${north}&parameterCd=00065,00060,00062,00054,62614&siteStatus=active`;
        console.log(`[PRELOAD] USGS batch row ${row} col ${col} bbox: W${west} S${south} E${east} N${north}`);
        // Retry logic and delay
        let attempt = 0;
        const maxAttempts = 3;
        let res = null;
        let fetchError = null;
        while (attempt < maxAttempts) {
          try {
            res = await fetch(usgsUrl);
            if (res.ok) break;
            fetchError = `[PRELOAD] USGS batch row ${row} col ${col} failed: ${res.status} ${await res.text()}`;
          } catch (err) {
            fetchError = `[PRELOAD] USGS batch row ${row} col ${col} fetch error: ${err}`;
          }
          attempt++;
          if (attempt < maxAttempts) {
            console.warn(`${fetchError} (retrying in 1s, attempt ${attempt+1}/${maxAttempts})`);
            await new Promise(r => setTimeout(r, 1000));
          } else {
            console.warn(`${fetchError} (giving up after ${maxAttempts} attempts)`);
          }
        }
        if (!res || !res.ok) continue;
        try {
          const data = await res.json();
          if (data && data.value && data.value.timeSeries && data.value.timeSeries.length > 0) {
            let newCount = 0;
            for (const ts of data.value.timeSeries) {
              if (!allIds.has(ts.sourceInfo.siteCode[0]?.value)) {
                allTimeSeries.push(ts);
                allIds.add(ts.sourceInfo.siteCode[0]?.value);
                newCount++;
              }
            }
            totalFetched += data.value.timeSeries.length;
            console.log(`[PRELOAD] USGS batch row ${row} col ${col} timeSeries: ${data.value.timeSeries.length}, new unique: ${newCount}`);
          } else {
            console.warn(`[PRELOAD] USGS batch row ${row} col ${col} data missing or empty`);
          }
        } catch (err) {
          console.warn(`[PRELOAD] USGS batch row ${row} col ${col} JSON parse error:`, err);
        }
        // Add a delay between batches to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      }
    }
    console.log(`[PRELOAD] Total unique USGS timeSeries: ${allTimeSeries.length}, total fetched: ${totalFetched}`);
    // Compose the merged data in the same format as the original API
    const mergedData = { value: { timeSeries: allTimeSeries } };
    const cacheResult = await cacheSet(key, mergedData, CACHE_TTL.WATERWAYS);
    console.log('[PRELOAD] USGS cache set result:', cacheResult);
    return mergedData;
  } catch (err) {
    console.error('Failed to preload Texas USGS stations:', err);
    return null;
  }
}

// Fetch and cache all Texas waterways (Overpass API)
export async function cacheTexasWaterways() {
  // Split Texas bbox into a grid (e.g., 4x4 = 16 queries)
  const gridRows = 4;
  const gridCols = 4;
  const latStep = (TEXAS_BBOX.north - TEXAS_BBOX.south) / gridRows;
  const lonStep = (TEXAS_BBOX.east - TEXAS_BBOX.west) / gridCols;
  const overpassUrl = 'https://overpass-api.de/api/interpreter';
  const key = 'waterways:texas:all';
  let allElements: any[] = [];
  let allIds = new Set();
  try {
    console.log('[PRELOAD] Fetching all Texas waterways from Overpass API in batches...');
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const south = TEXAS_BBOX.south + row * latStep;
        const north = south + latStep;
        const west = TEXAS_BBOX.west + col * lonStep;
        const east = west + lonStep;
        const overpassQuery = `
          [out:json][timeout:180];
          (
            way["waterway"](${south},${west},${north},${east});
            relation["waterway"](${south},${west},${north},${east});
          );
          out body;
          >;
          out skel qt;
        `;
        console.log(`[PRELOAD] Overpass batch row ${row} col ${col} bbox: S${south} W${west} N${north} E${east}`);
        const res = await fetch(overpassUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(overpassQuery)}`
        });
        if (!res.ok) {
          console.warn(`[PRELOAD] Overpass batch row ${row} col ${col} failed:`, res.status);
          continue;
        }
        const data = await res.json();
        if (data && data.elements && data.elements.length > 0) {
          let newCount = 0;
          for (const el of data.elements) {
            if (!allIds.has(el.id)) {
              allElements.push(el);
              allIds.add(el.id);
              newCount++;
            }
          }
          console.log(`[PRELOAD] Overpass batch row ${row} col ${col} elements: ${data.elements.length}, new unique: ${newCount}`);
        } else {
          console.warn(`[PRELOAD] Overpass batch row ${row} col ${col} data missing or empty`);
        }
      }
    }
    console.log(`[PRELOAD] Total unique Overpass elements: ${allElements.length}`);
    const cacheResult = await cacheSet(key, { elements: allElements }, CACHE_TTL.WATERWAYS);
    console.log('[PRELOAD] Overpass cache set result:', cacheResult);
    return { elements: allElements };
  } catch (err) {
    console.error('Failed to preload Texas waterways:', err);
    return null;
  }
}
