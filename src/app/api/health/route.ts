import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

// This route should be dynamic to avoid static generation during build
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check Redis connection
    const redis = await getRedisClient();
    let redisStatus = 'disconnected';
    
    if (redis) {
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
