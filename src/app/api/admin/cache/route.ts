import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

// In-memory cache hit/miss counters (reset on server restart)
let cacheStats = {
  waterways: { hit: 0, miss: 0 },
  usgs: { hit: 0, miss: 0 },
  other: { hit: 0, miss: 0 }
};

// Exported for use in API routes
export function recordCacheStat(type: 'waterways' | 'usgs' | 'other', hit: boolean) {
  if (!cacheStats[type]) cacheStats[type] = { hit: 0, miss: 0 };
  if (hit) cacheStats[type].hit++;
  else cacheStats[type].miss++;
}

// This route should be dynamic to avoid static generation during build
export const dynamic = 'force-dynamic';

// Simple authentication function
function authenticate(request: NextRequest): boolean {
  // DEBUG: Log if ADMIN_PASSWORD is set
  if (process.env.NODE_ENV !== 'production') {
    if (!process.env.ADMIN_PASSWORD) {
      console.warn('[DEBUG] ADMIN_PASSWORD is NOT set in process.env');
    } else {
      console.log('[DEBUG] ADMIN_PASSWORD is set in process.env');
    }
  }
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const base64Credentials = authHeader.slice(6); // Remove 'Basic '
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    // Check against environment variables
    const adminUsername = process.env.ADMIN_USERNAME || 'feetball';
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.warn('ADMIN_PASSWORD not set - cache admin disabled');
      return false;
    }

    return username === adminUsername && password === adminPassword;
  } catch (error) {
    console.error('Authentication error:', error);
    return false;
  }
}

// GET - Show cache admin interface (for browser access)
export async function GET(request: NextRequest) {
  if (!authenticate(request)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Cache Admin"',
      },
    });
  }

  try {
    const redis = await getRedisClient();
    let cacheInfo = { connected: false, keyCount: 0 };

    if (redis) {
      try {
        await redis.ping();
        // Get approximate key count (this is fast)
        const info = await redis.info('keyspace');
        const match = info.match(/keys=(\d+)/);
        cacheInfo = {
          connected: true,
          keyCount: match ? parseInt(match[1]) : 0
        };
      } catch (error) {
        console.error('Redis info error:', error);
      }
    }

    // Get Redis memory stats
    let redisStats = {};
    if (redis) {
      try {
        const info = await redis.info();
        const usedMemory = info.match(/used_memory:(\d+)/);
        const usedMemoryHuman = info.match(/used_memory_human:([\w\.]+)/);
        redisStats = {
          usedMemory: usedMemory ? parseInt(usedMemory[1]) : null,
          usedMemoryHuman: usedMemoryHuman ? usedMemoryHuman[1] : null
        };
      } catch (e) {}
    }

    return NextResponse.json({
      status: 'authenticated',
      timestamp: new Date().toISOString(),
      cache: cacheInfo,
      cacheStats,
      redisStats,
      actions: {
        clear_all: 'POST /api/admin/cache with action=clear_all',
        clear_waterways: 'POST /api/admin/cache with action=clear_waterways',
        clear_usgs: 'POST /api/admin/cache with action=clear_usgs'
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// POST - Perform cache operations
export async function POST(request: NextRequest) {
  if (!authenticate(request)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Cache Admin"',
      },
    });
  }

  try {
    const body = await request.json();
    const { action } = body;

    const redis = await getRedisClient();
    if (!redis) {
      return NextResponse.json(
        { error: 'Redis not connected' },
        { status: 503 }
      );
    }

    let result = {};

    switch (action) {
      case 'clear_all':
        await redis.flushAll();
        result = { message: 'All cache cleared' };
        break;

      case 'clear_waterways':
        const waterwayKeys = await redis.keys('waterways:*');
        if (waterwayKeys.length > 0) {
          await redis.del(waterwayKeys);
        }
        result = { message: `Cleared ${waterwayKeys.length} waterway cache entries` };
        break;

      case 'clear_usgs':
        const usgsKeys = await redis.keys('gauge_*');
        if (usgsKeys.length > 0) {
          await redis.del(usgsKeys);
        }
        result = { message: `Cleared ${usgsKeys.length} USGS cache entries` };
        break;

      case 'clear_pattern':
        const pattern = body.pattern;
        if (!pattern) {
          return NextResponse.json(
            { error: 'Pattern required for clear_pattern action' },
            { status: 400 }
          );
        }
        const patternKeys = await redis.keys(pattern);
        if (patternKeys.length > 0) {
          await redis.del(patternKeys);
        }
        result = { message: `Cleared ${patternKeys.length} entries matching pattern: ${pattern}` };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported: clear_all, clear_waterways, clear_usgs, clear_pattern' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      action,
      result
    });

  } catch (error) {
    console.error('Cache admin error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
