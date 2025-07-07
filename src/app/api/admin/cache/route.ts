import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { cacheSet } from '@/lib/redis';

// In-memory cache hit/miss counters (reset on server restart)

let cacheStats = {
  waterways: { hit: 0, miss: 0 },
  usgs: { hit: 0, miss: 0 },
  other: { hit: 0, miss: 0 }
};

// Track Texas preload status
let texasPreloadStatus = {
  usgs: null as null | boolean,
  waterways: null as null | boolean,
  usgsError: null as null | string,
  waterwaysError: null as null | string
};

// Exported for use in health/preload
export function setTexasPreloadStatus(type: 'usgs' | 'waterways', success: boolean, error?: string) {
  texasPreloadStatus[type] = success;
  if (!success && error) {
    if (type === 'usgs') texasPreloadStatus.usgsError = error;
    if (type === 'waterways') texasPreloadStatus.waterwaysError = error;
  }
}

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
    const adminUsername = process.env.ADMIN_USERNAME;
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

// Check if request is from preload script (localhost or container-to-container during startup)
function isPreloadRequest(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  const host = request.headers.get('host') || '';
  const xForwardedFor = request.headers.get('x-forwarded-for') || '';
  
  // Allow unauthenticated requests during startup from:
  // 1. localhost/127.0.0.1 (local development)
  // 2. app:3000 (Docker container-to-container communication)
  // 3. Internal Docker network ranges
  const isLocalOrInternal = host.includes('localhost') || 
                           host.includes('127.0.0.1') || 
                           host.includes('app:') ||
                           xForwardedFor.includes('172.') || // Docker default network
                           xForwardedFor.includes('192.168.') || // Common private networks
                           xForwardedFor.includes('10.'); // Private network range
  
  return isLocalOrInternal && userAgent.includes('node');
}

// GET - Show cache admin interface (for browser access)
export async function GET(request: NextRequest) {
  if (!authenticate(request) && !isPreloadRequest(request)) {
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
      texasPreloadStatus,
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
  // Allow preload requests from localhost, otherwise require authentication
  if (!authenticate(request) && !isPreloadRequest(request)) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { action, key, data, ttl, usgs, waterways, flood } = body;

    switch (action) {
      case 'set':
        if (!key || !data) {
          return NextResponse.json(
            { error: 'Missing key or data for set action' },
            { status: 400 }
          );
        }
        
        const cacheResult = await cacheSet(key, data, ttl || 3600);
        
        return NextResponse.json({
          status: 'success',
          timestamp: new Date().toISOString(),
          action: 'set',
          key,
          cached: cacheResult,
          dataSize: JSON.stringify(data).length
        });

      case 'set-status':
        // Update preload status
        if (typeof usgs === 'boolean') {
          setTexasPreloadStatus('usgs', usgs);
        }
        if (typeof waterways === 'boolean') {
          setTexasPreloadStatus('waterways', waterways);
        }
        // Note: flood stages don't have a current preload status, but we could add it
        
        return NextResponse.json({
          status: 'success',
          timestamp: new Date().toISOString(),
          action: 'set-status',
          preloadStatus: texasPreloadStatus
        });

      case 'clear_all':
        const redisClearAll = await getRedisClient();
        await redisClearAll?.flushAll();
        return NextResponse.json({ message: 'All cache cleared' });

      case 'clear_waterways':
        const redisClearWaterways = await getRedisClient();
        const waterwayKeys = await redisClearWaterways?.keys('waterways:*');
        if (waterwayKeys && waterwayKeys.length > 0) {
          await redisClearWaterways.del(waterwayKeys);
        }
        return NextResponse.json({ message: `Cleared ${waterwayKeys?.length} waterway cache entries` });

      case 'clear_usgs':
        const redisClearUsgs = await getRedisClient();
        const usgsKeys = await redisClearUsgs?.keys('gauge_*');
        if (usgsKeys && usgsKeys.length > 0) {
          await redisClearUsgs.del(usgsKeys);
        }
        return NextResponse.json({ message: `Cleared ${usgsKeys?.length} USGS cache entries` });

      case 'clear_pattern':
        const pattern = body.pattern;
        if (!pattern) {
          return NextResponse.json(
            { error: 'Pattern required for clear_pattern action' },
            { status: 400 }
          );
        }
        const redisClearPattern = await getRedisClient();
        const patternKeys = await redisClearPattern?.keys(pattern);
        if (patternKeys && patternKeys.length > 0) {
          await redisClearPattern.del(patternKeys);
        }
        return NextResponse.json({ message: `Cleared ${patternKeys?.length || 0} entries matching pattern: ${pattern}` });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported: set, set-status, clear_all, clear_waterways, clear_usgs, clear_pattern' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Cache admin POST error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
