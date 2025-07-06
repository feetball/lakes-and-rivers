import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

// Make this route dynamic to avoid build-time static generation
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = await getRedisClient();
    if (!client) {
      return NextResponse.json(
        { error: 'Redis client not available' },
        { status: 503 }
      );
    }

    // Get all keys and categorize them
    const allKeys = await client.keys('*');
    
    const stats: any = {
      totalKeys: allKeys.length,
      usgsData: allKeys.filter((key: string) => key.startsWith('usgs:')).length,
      historicalData: allKeys.filter((key: string) => key.startsWith('gauge_historical:')).length,
      waterways: allKeys.filter((key: string) => key.startsWith('waterways:')).length,
      siteMetadata: allKeys.filter((key: string) => key.startsWith('gauge_metadata:')).length,
      floodStages: allKeys.filter((key: string) => key.startsWith('flood_stages:')).length,
      other: allKeys.filter((key: string) => 
        !key.startsWith('usgs:') && 
        !key.startsWith('gauge_historical:') && 
        !key.startsWith('waterways:') && 
        !key.startsWith('gauge_metadata:') && 
        !key.startsWith('flood_stages:')
      ).length
    };

    // Get memory usage if available
    try {
      const info = await client.info('memory');
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      if (memoryMatch) {
        stats.memoryUsage = memoryMatch[1].trim();
      }
    } catch (error) {
      console.warn('Could not get Redis memory info:', error);
    }

    return NextResponse.json(stats, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Cache stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cache statistics' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cacheType = searchParams.get('type');

    const client = await getRedisClient();
    if (!client) {
      return NextResponse.json(
        { error: 'Redis client not available' },
        { status: 503 }
      );
    }

    let keysToDelete: string[] = [];

    if (cacheType === 'all') {
      // Delete all cache keys
      keysToDelete = await client.keys('*');
    } else {
      // Delete specific cache type
      switch (cacheType) {
        case 'usgs':
          keysToDelete = await client.keys('usgs:*');
          break;
        case 'historical':
          keysToDelete = await client.keys('gauge_historical:*');
          break;
        case 'waterways':
          keysToDelete = await client.keys('waterways:*');
          break;
        case 'metadata':
          keysToDelete = await client.keys('gauge_metadata:*');
          break;
        case 'flood':
          keysToDelete = await client.keys('flood_stages:*');
          break;
        default:
          return NextResponse.json(
            { error: 'Invalid cache type specified' },
            { status: 400 }
          );
      }
    }

    if (keysToDelete.length > 0) {
      await client.del(keysToDelete);
      console.log(`Deleted ${keysToDelete.length} keys for cache type: ${cacheType}`);
    }

    return NextResponse.json({
      success: true,
      deletedKeys: keysToDelete.length,
      cacheType
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Cache delete API error:', error);
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}
