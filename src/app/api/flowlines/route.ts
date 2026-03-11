import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cacheGet, cacheSet, CACHE_TTL } from '@/lib/redis';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const NHDPLUS_URL = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/4/query';

interface FlowlineFeature {
  id: string;
  name: string;
  type: 'river' | 'stream';
  coordinates: [number, number][];
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
    const cacheKey = `flowlines:${rs},${rw},${rn},${re}`;

    // Check cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      logger.debug(`[flowlines] Cache hit: ${cacheKey}`);
      return NextResponse.json({ waterways: cached, cached: true });
    }

    logger.debug(`[flowlines] Fetching NHDPlus for bbox s=${south} w=${west} n=${north} e=${east}`);

    // Query NHDPlus for named flowlines in the bbox.
    // Layer 4 = Flowline - Small Scale (visible at larger map scales).
    // We only fetch named rivers/streams (GNIS_NAME IS NOT NULL) to keep
    // the response size manageable and match-able to gauge sites.
    const geometry = JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north });

    // Fetch up to 500 named flowlines
    const params = new URLSearchParams({
      where: 'GNIS_NAME IS NOT NULL',
      geometry,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'GNIS_NAME,FTYPE,COMID,StreamOrde,LevelPathI',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'json',
      resultRecordCount: '1000',
    });

    const response = await axios.get(`${NHDPLUS_URL}?${params.toString()}`, {
      timeout: 30000,
    });

    const features = response.data?.features || [];
    logger.debug(`[flowlines] NHDPlus returned ${features.length} features`);

    // Convert ArcGIS JSON to our Waterway format.
    // Group segments that share the same LevelPathI (same river) and
    // concatenate their paths for a longer continuous line.
    const pathGroups = new Map<string, {
      name: string;
      type: 'river' | 'stream';
      segments: [number, number][][];
      streamOrder: number;
    }>();

    for (const feat of features) {
      const attrs = feat.attributes || {};
      const geom = feat.geometry || {};
      const paths: number[][][] = geom.paths || [];
      const name: string = attrs.GNIS_NAME || '';
      if (!name || paths.length === 0) continue;

      const levelPath = String(attrs.LevelPathI || attrs.COMID || '');
      const streamOrder = attrs.StreamOrde || 1;
      const ftype: string = attrs.FTYPE || 'StreamRiver';
      const type: 'river' | 'stream' = streamOrder >= 3 ? 'river' : 'stream';

      // Use LevelPathI to group segments of the same river together
      const key = `${levelPath}-${name}`;
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
    await cacheSet(cacheKey, waterways, CACHE_TTL.WATERWAYS || 86400);

    return NextResponse.json({ waterways, cached: false });
  } catch (error) {
    logger.error('[flowlines] Error:', error);
    return NextResponse.json({ waterways: [], error: 'Failed to fetch flowlines' });
  }
}
