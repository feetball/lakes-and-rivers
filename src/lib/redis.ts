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
