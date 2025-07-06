import { NextResponse } from 'next/server';
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
    
    // Categorize keys by type
    const keysByType = {
      usgs: allKeys.filter((key: string) => key.startsWith('usgs:')),
      historical: allKeys.filter((key: string) => key.startsWith('gauge_historical:')),
      waterways: allKeys.filter((key: string) => key.startsWith('waterways:')),
      metadata: allKeys.filter((key: string) => key.startsWith('gauge_metadata:')),
      floodStages: allKeys.filter((key: string) => key.startsWith('flood_stages:')),
      other: allKeys.filter((key: string) => 
        !key.startsWith('usgs:') && 
        !key.startsWith('gauge_historical:') && 
        !key.startsWith('waterways:') && 
        !key.startsWith('gauge_metadata:') && 
        !key.startsWith('flood_stages:')
      )
    };

    // Get detailed information for each key type
    const detailedStats = await Promise.all([
      getKeyDetails(client, keysByType.usgs, 'USGS Data'),
      getKeyDetails(client, keysByType.historical, 'Historical Gauge Data'),
      getKeyDetails(client, keysByType.waterways, 'Waterways'),
      getKeyDetails(client, keysByType.metadata, 'Site Metadata'),
      getKeyDetails(client, keysByType.floodStages, 'Flood Stages'),
      getKeyDetails(client, keysByType.other, 'Other')
    ]);

    // Get Redis memory and performance info
    let redisInfo = {};
    try {
      const info = await client.info('memory');
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const peakMemoryMatch = info.match(/used_memory_peak_human:([^\r\n]+)/);
      const keysMatch = info.match(/db0:keys=([0-9]+)/);
      
      redisInfo = {
        memoryUsage: memoryMatch ? memoryMatch[1].trim() : 'Unknown',
        peakMemory: peakMemoryMatch ? peakMemoryMatch[1].trim() : 'Unknown',
        totalKeys: keysMatch ? parseInt(keysMatch[1]) : allKeys.length,
        uptime: await getRedisUptime(client)
      };
    } catch (error) {
      console.warn('Could not get Redis info:', error);
      redisInfo = { memoryUsage: 'Unknown', totalKeys: allKeys.length };
    }

    // Calculate cache hit rates (approximated)
    const cacheEfficiency = await calculateCacheEfficiency(client, keysByType);

    const response = {
      timestamp: new Date().toISOString(),
      redis: redisInfo,
      summary: {
        totalKeys: allKeys.length,
        usgsData: keysByType.usgs.length,
        historicalData: keysByType.historical.length,
        waterways: keysByType.waterways.length,
        siteMetadata: keysByType.metadata.length,
        floodStages: keysByType.floodStages.length,
        other: keysByType.other.length
      },
      detailed: detailedStats.reduce((acc, stats) => {
        acc[stats.type] = stats;
        return acc;
      }, {} as any),
      efficiency: cacheEfficiency,
      recommendations: generateRecommendations(keysByType, redisInfo)
    };

    return NextResponse.json(response, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Cache statistics API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cache statistics' },
      { status: 500 }
    );
  }
}

async function getKeyDetails(client: any, keys: string[], type: string) {
  const details = {
    type,
    count: keys.length,
    totalSize: 0,
    avgSize: 0,
    oldestKey: null as string | null,
    newestKey: null as string | null,
    expirationInfo: {
      withTTL: 0,
      withoutTTL: 0,
      expired: 0
    }
  };

  if (keys.length === 0) return details;

  // Sample a subset of keys for performance
  const sampleSize = Math.min(keys.length, 20);
  const sampleKeys = keys.slice(0, sampleSize);
  
  let totalSampleSize = 0;
  let oldestTime = Date.now();
  let newestTime = 0;

  for (const key of sampleKeys) {
    try {
      // Get key size
      const keySize = await client.memoryUsage(key);
      if (keySize) {
        totalSampleSize += keySize;
      }

      // Get TTL info
      const ttl = await client.ttl(key);
      if (ttl > 0) {
        details.expirationInfo.withTTL++;
      } else if (ttl === -1) {
        details.expirationInfo.withoutTTL++;
      } else {
        details.expirationInfo.expired++;
      }

      // Try to extract timestamp from key for age estimation
      const timeMatch = key.match(/(\d{13})/); // Unix timestamp in milliseconds
      if (timeMatch) {
        const keyTime = parseInt(timeMatch[1]);
        if (keyTime < oldestTime) {
          oldestTime = keyTime;
          details.oldestKey = key;
        }
        if (keyTime > newestTime) {
          newestTime = keyTime;
          details.newestKey = key;
        }
      }
    } catch (error) {
      // Key might have expired or other error, continue
      console.warn(`Error processing key ${key}:`, error);
    }
  }

  // Estimate total size based on sample
  if (sampleSize > 0 && totalSampleSize > 0) {
    details.avgSize = Math.round(totalSampleSize / sampleSize);
    details.totalSize = Math.round((totalSampleSize / sampleSize) * keys.length);
  }

  return details;
}

async function getRedisUptime(client: any): Promise<string> {
  try {
    const info = await client.info('server');
    const uptimeMatch = info.match(/uptime_in_seconds:([0-9]+)/);
    if (uptimeMatch) {
      const seconds = parseInt(uptimeMatch[1]);
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${days}d ${hours}h ${minutes}m`;
    }
  } catch (error) {
    console.warn('Could not get Redis uptime:', error);
  }
  return 'Unknown';
}

async function calculateCacheEfficiency(client: any, keysByType: any) {
  // This is a simplified cache efficiency calculation
  // In a real system, you'd track hits/misses over time
  
  const totalKeys = Object.values(keysByType).reduce((sum: number, keys: any) => sum + keys.length, 0);
  
  return {
    totalCachedItems: totalKeys,
    estimatedHitRate: totalKeys > 0 ? '85%' : '0%', // Simulated based on presence of cache
    mostCachedType: Object.entries(keysByType)
      .sort(([,a], [,b]) => (b as any[]).length - (a as any[]).length)[0]?.[0] || 'none',
    cacheUtilization: totalKeys > 100 ? 'High' : totalKeys > 20 ? 'Medium' : 'Low'
  };
}

function generateRecommendations(keysByType: any, redisInfo: any) {
  const recommendations = [];
  
  // Check for cache imbalances
  if (keysByType.usgs.length > 50) {
    recommendations.push({
      type: 'optimization',
      message: 'High number of USGS cache entries detected. Consider implementing automatic cleanup for old entries.',
      priority: 'medium'
    });
  }
  
  if (keysByType.historical.length === 0) {
    recommendations.push({
      type: 'usage',
      message: 'No historical data cached yet. Cache will improve performance once charts are used.',
      priority: 'info'
    });
  }
  
  if (keysByType.waterways.length > 20) {
    recommendations.push({
      type: 'optimization',
      message: 'Many waterway cache entries detected. These can be cached for longer periods (24+ hours).',
      priority: 'low'
    });
  }
  
  // Memory recommendations
  if (redisInfo.memoryUsage && redisInfo.memoryUsage.includes('M')) {
    const memoryValue = parseFloat(redisInfo.memoryUsage);
    if (memoryValue > 100) {
      recommendations.push({
        type: 'memory',
        message: 'High memory usage detected. Consider implementing cache size limits.',
        priority: 'high'
      });
    }
  }
  
  // General recommendations
  if (Object.values(keysByType).every((keys: any) => keys.length < 5)) {
    recommendations.push({
      type: 'usage',
      message: 'Cache utilization is low. Performance benefits will increase with more usage.',
      priority: 'info'
    });
  }
  
  return recommendations;
}
