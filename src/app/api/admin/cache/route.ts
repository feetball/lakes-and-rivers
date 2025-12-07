import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { cacheSet } from '@/lib/redis';
import { authenticate, isPreloadRequest, isFormBasedRequest } from '@/lib/auth';
import { isSafeJson, validateAdminAction } from '@/lib/security';

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

// Use shared helpers from lib/auth

// Use shared helpers from lib/auth

// GET - Show cache admin interface (for browser access)
export async function GET(request: NextRequest) {
  if (!authenticate(request) && !isPreloadRequest(request)) {
    // For form-based requests, don't send WWW-Authenticate header to avoid browser dialog
    if (isFormBasedRequest(request)) {
      return new NextResponse(JSON.stringify({
        error: 'Authentication required',
        message: 'Please provide valid credentials'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } else {
      // For traditional Basic Auth requests (like curl), send WWW-Authenticate header
      return new NextResponse('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Cache Admin"',
        },
      });
    }
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
    // For form-based requests, don't send WWW-Authenticate header to avoid browser dialog
    if (isFormBasedRequest(request)) {
      return NextResponse.json(
        { 
          error: 'Authentication required',
          message: 'Please provide valid credentials'
        },
        { status: 401 }
      );
    } else {
      // For traditional requests, we can still use the standard response
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
  }

  try {
    const body = await request.json();
    const { action, key, data, ttl, usgs, waterways, flood } = body;

    // Validate action and incoming payload types to avoid unsafe deserialization
    const allowedActions = ['set', 'set-status', 'clear_all', 'clear_waterways', 'clear_usgs', 'clear_pattern'];
    if (!validateAdminAction(action, allowedActions)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Validate key if present
    if (key && typeof key !== 'string') {
      return NextResponse.json({ error: 'Invalid key; expected string' }, { status: 400 });
    }

    // Validate pattern for clear_pattern
    if (action === 'clear_pattern') {
      const patternVal = body.pattern;
      if (!patternVal || typeof patternVal !== 'string' || patternVal.length > 128) {
        return NextResponse.json({ error: 'Invalid pattern' }, { status: 400 });
      }
    }

    // Validate data only allows plain JSON
    if (data && !isSafeJson(data)) {
      return NextResponse.json({ error: 'Invalid data payload' }, { status: 400 });
    }

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
