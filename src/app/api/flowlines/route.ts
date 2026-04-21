import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cacheGet, cacheSet, CACHE_TTL } from '@/lib/redis';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const NHDPLUS_URL = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/4/query';
const TEXAS_BBOX = { north: 36.5, south: 25.8, east: -93.5, west: -106.7 } as const;
const PAGE_SIZE = 1000;
const TEXAS_EPSILON = 0.2;
const TEXASWIDE_MIN_STREAM_ORDER = 8;
const NHDPLUS_TIMEOUT_MS = 15000;

// Process-local cache — survives between requests within the same server
// process even if Redis is unavailable. Keys mirror the Redis cache keys.
const memoryWaterwayCache = new Map<string, { data: any; expiresAt: number }>();
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function memoryGet(key: string): any | null {
  const entry = memoryWaterwayCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memoryWaterwayCache.delete(key);
    return null;
  }
  return entry.data;
}

function memorySet(key: string, data: any): void {
  memoryWaterwayCache.set(key, { data, expiresAt: Date.now() + MEMORY_TTL_MS });
}

interface FlowlineFeature {
  id: string;
  name: string;
  type: 'river' | 'stream';
  coordinates: [number, number][];
}

interface FlowlineQueryBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

function isTexasWideRequest(bounds: FlowlineQueryBounds): boolean {
  return (
    Math.abs(bounds.north - TEXAS_BBOX.north) < TEXAS_EPSILON &&
    Math.abs(bounds.south - TEXAS_BBOX.south) < TEXAS_EPSILON &&
    Math.abs(bounds.east - TEXAS_BBOX.east) < TEXAS_EPSILON &&
    Math.abs(bounds.west - TEXAS_BBOX.west) < TEXAS_EPSILON
  );
}

async function fetchFlowlineFeatures(bounds: FlowlineQueryBounds, whereClause: string) {
  const geometry = JSON.stringify({
    xmin: bounds.west,
    ymin: bounds.south,
    xmax: bounds.east,
    ymax: bounds.north,
  });

  const allFeatures: any[] = [];
  let resultOffset = 0;

  while (true) {
    const params = new URLSearchParams({
      where: whereClause,
      geometry,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'OBJECTID,GNIS_NAME,FTYPE,COMID,StreamOrde,LevelPathI',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'json',
      resultRecordCount: String(PAGE_SIZE),
      resultOffset: String(resultOffset),
    });

    const response = await axios.get(`${NHDPLUS_URL}?${params.toString()}`, {
      timeout: NHDPLUS_TIMEOUT_MS,
    });

    const features = response.data?.features || [];
    const apiError = response.data?.error;
    if (apiError) {
      throw new Error(apiError.message || 'NHDPlus query failed');
    }

    allFeatures.push(...features);

    if (features.length < PAGE_SIZE) {
      break;
    }

    resultOffset += PAGE_SIZE;

    if (resultOffset > 10000) {
      logger.warn(`[flowlines] Reached pagination cap for bbox s=${bounds.south} w=${bounds.west} n=${bounds.north} e=${bounds.east}`);
      break;
    }
  }

  return allFeatures;
}

/**
 * Fetches NHDPlus flowlines (river/stream geometry) for a bounding box
 * from the USGS National Map service. Returns detailed polyline coordinates
 * suitable for rendering on a Leaflet map.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const north = parseFloat(searchParams.get('north') || '0');
    const south = parseFloat(searchParams.get('south') || '0');
    const east = parseFloat(searchParams.get('east') || '0');
    const west = parseFloat(searchParams.get('west') || '0');

    if (!north && !south && !east && !west) {
      return NextResponse.json({ error: 'Bounding box required' }, { status: 400 });
    }

    // Round to 2 decimal places for cache key granularity
    const rn = Math.round(north * 100) / 100;
    const rs = Math.round(south * 100) / 100;
    const re = Math.round(east * 100) / 100;
    const rw = Math.round(west * 100) / 100;
    const requestedBounds = { north, south, east, west };
    const isTexasWide = isTexasWideRequest(requestedBounds);
    const cacheKey = isTexasWide
      ? 'flowlines:texas:all:v4'
      : `flowlines:${rs},${rw},${rn},${re}`;

    // Check in-memory cache first, then Redis. The in-memory copy lets the
    // server respond instantly on subsequent requests even when Redis is
    // unavailable (dev / preview deployments).
    const cachedMemory = memoryGet(cacheKey);
    if (cachedMemory) {
      logger.debug(`[flowlines] Memory cache hit: ${cacheKey}`);
      return NextResponse.json({ waterways: cachedMemory, cached: true });
    }

    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.debug(`[flowlines] Redis cache hit: ${cacheKey}`);
      memorySet(cacheKey, cached);
      return NextResponse.json({ waterways: cached, cached: true });
    }

    logger.debug(
      `[flowlines] Fetching NHDPlus for bbox s=${south} w=${west} n=${north} e=${east} (texasWide=${isTexasWide})`
    );

    const whereClause = isTexasWide
      ? `GNIS_NAME IS NOT NULL AND StreamOrde >= ${TEXASWIDE_MIN_STREAM_ORDER}`
      : "GNIS_NAME IS NOT NULL";
    const rawFeatures: any[] = [];
    const seenFeatureIds = new Set<string>();

    const features = await fetchFlowlineFeatures(requestedBounds, whereClause);

    for (const feature of features) {
      const attrs = feature?.attributes || {};
      const dedupeKey = String(attrs.COMID || attrs.OBJECTID || '');
      if (dedupeKey && seenFeatureIds.has(dedupeKey)) {
        continue;
      }
      if (dedupeKey) {
        seenFeatureIds.add(dedupeKey);
      }
      rawFeatures.push(feature);
    }

    logger.debug(`[flowlines] NHDPlus returned ${rawFeatures.length} unique features`);

    // Convert ArcGIS JSON to our Waterway format.
    // Group segments that share the same LevelPathI (same river) and
    // concatenate their paths for a longer continuous line.
    const pathGroups = new Map<string, {
      name: string;
      type: 'river' | 'stream';
      segments: [number, number][][];
      streamOrder: number;
    }>();

    for (const feat of rawFeatures) {
      const attrs = feat.attributes || {};
      const geom = feat.geometry || {};
      const paths: number[][][] = geom.paths || [];
      const name: string = attrs.GNIS_NAME || 'Unnamed stream';
      if (paths.length === 0) continue;

      const levelPath = String(attrs.LevelPathI || attrs.COMID || '');
      const streamOrder = attrs.StreamOrde || 1;
      const ftype: string = attrs.FTYPE || 'StreamRiver';
      const type: 'river' | 'stream' = streamOrder >= 3 ? 'river' : 'stream';

      // Use LevelPathI to group segments of the same river together
      const key = `${levelPath || attrs.OBJECTID}-${name}`;
      const existing = pathGroups.get(key);

      // Convert ArcGIS [lon, lat] → Leaflet [lat, lon]
      const coords: [number, number][][] = paths.map(path =>
        path.map(([lon, lat]) => [lat, lon] as [number, number])
      );

      if (existing) {
        existing.segments.push(...coords);
        if (streamOrder > existing.streamOrder) existing.streamOrder = streamOrder;
      } else {
        pathGroups.set(key, { name, type, segments: coords, streamOrder });
      }
    }

    // Build final waterway array. Try to join contiguous segments.
    const waterways: FlowlineFeature[] = [];

    for (const [key, group] of pathGroups) {
      // Simple concatenation — segments from the same LevelPathI are
      // generally in order, so joining them gives a reasonable polyline.
      const allCoords: [number, number][] = [];
      for (const seg of group.segments) {
        if (allCoords.length > 0 && seg.length > 0) {
          // Check if this segment connects to the end of the current line
          const last = allCoords[allCoords.length - 1];
          const first = seg[0];
          const gap = Math.abs(last[0] - first[0]) + Math.abs(last[1] - first[1]);
          if (gap > 0.01) {
            // Gap too large — emit current line and start a new one
            if (allCoords.length > 1) {
              waterways.push({
                id: `nhd-${key}-${waterways.length}`,
                name: group.name,
                type: group.type,
                coordinates: [...allCoords],
              });
            }
            allCoords.length = 0;
          }
        }
        allCoords.push(...seg);
      }
      if (allCoords.length > 1) {
        waterways.push({
          id: `nhd-${key}-${waterways.length}`,
          name: group.name,
          type: group.type,
          coordinates: allCoords,
        });
      }
    }

    logger.debug(`[flowlines] Processed ${waterways.length} waterways from ${pathGroups.size} river groups`);

    // Cache for 24 hours — NHD geometry doesn't change
    memorySet(cacheKey, waterways);
    await cacheSet(cacheKey, waterways, CACHE_TTL.WATERWAYS || 86400);

    return NextResponse.json({ waterways, cached: false });
  } catch (error) {
    logger.error('[flowlines] Error:', error);
    return NextResponse.json({ waterways: [], error: 'Failed to fetch flowlines' });
  }
}
