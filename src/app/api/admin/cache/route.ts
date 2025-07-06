import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

// This route should be dynamic to avoid static generation during build
export const dynamic = 'force-dynamic';

// Simple authentication function
function authenticate(request: NextRequest): boolean {
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

    return NextResponse.json({
      status: 'authenticated',
      timestamp: new Date().toISOString(),
      cache: cacheInfo,
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
