import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { cacheTexasStations, cacheTexasWaterways } from '@/lib/redis';
import { setTexasPreloadStatus } from '../admin/cache/route';

// Control whether to allow live USGS API fetching (default: false - Redis only)
const ALLOW_LIVE_USGS_FETCH = process.env.ALLOW_LIVE_USGS_FETCH === 'true';

// This route should be dynamic to avoid static generation during build
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Skip live data preloading in health checks - use dedicated preload service instead
    // Only check if preloaded data exists in Redis
    const redisClient = await getRedisClient();
    if (redisClient) {
      try {
        const texasUsgs = await redisClient.get('usgs:stations:texas:all');
        const texasWaterways = await redisClient.get('waterways:texas:all');
        setTexasPreloadStatus('usgs', !!texasUsgs);
        setTexasPreloadStatus('waterways', !!texasWaterways);
      } catch (err: any) {
        setTexasPreloadStatus('usgs', false, err?.message || String(err));
        setTexasPreloadStatus('waterways', false, err?.message || String(err));
      }
    }
    
    // Check if REDIS_URL is configured
    const redisConfigured = !!process.env.REDIS_URL;
    
    // Check Redis connection
    const redis = await getRedisClient();
    let redisStatus = 'disconnected';
    
    if (!redisConfigured) {
      redisStatus = 'not_configured';
    } else if (redis) {
      try {
        await redis.ping();
        redisStatus = 'connected';
      } catch {
        redisStatus = 'error';
      }
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisStatus,
        app: 'running'
      },
      config: {
        redis_url_configured: redisConfigured,
        node_env: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
