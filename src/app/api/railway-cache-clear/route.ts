import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

// This route should be dynamic to avoid static generation during build
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Check if this is a Railway deployment
    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (!isRailway || !isProduction) {
      return NextResponse.json(
        { error: 'Cache clear only available in Railway production' },
        { status: 403 }
      );
    }
    
    // Check if Redis is available
    if (!process.env.REDIS_URL) {
      return NextResponse.json(
        { error: 'Redis not configured' },
        { status: 500 }
      );
    }
    
    console.log('[RAILWAY-CACHE-CLEAR] Clearing Redis cache for deployment...');
    
    // Clear all Redis cache
    const redis = await getRedisClient();
    if (redis) {
      await redis.flushAll();
      console.log('[RAILWAY-CACHE-CLEAR] ✓ Redis cache cleared successfully');
      
      return NextResponse.json({
        success: true,
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json(
        { error: 'Redis connection failed' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('[RAILWAY-CACHE-CLEAR] Error:', error);
    return NextResponse.json(
      { 
        error: 'Cache clear failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
