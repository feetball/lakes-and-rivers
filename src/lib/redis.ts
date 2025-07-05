import { createClient } from 'redis';

let redis: any = null;

export async function getRedisClient() {
  if (!redis) {
    try {    redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 5000,
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
