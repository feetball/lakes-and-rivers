import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

// This route should be dynamic to avoid static generation during build
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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
      } catch (error) {
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
