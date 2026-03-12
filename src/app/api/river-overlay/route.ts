import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { cacheGet, cacheSet, cacheDelete, CACHE_TTL } from '@/lib/redis';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const NHDPLUS_URL = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query';

/**
 * Fetches the full geometry of a river by name from NHDPlus.
 * Uses Layer 6 (NHDFlowline) which has detailed flowline geometry.
 * Paginates through results to get the complete river path.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const riverName = searchParams.get('name');

    if (!riverName) {
      return NextResponse.json({ error: 'River name is required' }, { status: 400 });
    }

    const cacheKey = `river-overlay:${riverName.toLowerCase().replace(/\s+/g, '-')}`;
    const forceRefresh = searchParams.get('force') === '1';

    if (!forceRefresh) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        // Don't serve cached empty results — treat them as a miss
        if (Array.isArray(cached) && cached.length > 0) {
          logger.debug(`[river-overlay] Cache hit: ${cacheKey} (${cached.length} segments)`);
          return NextResponse.json({ segments: cached, cached: true });
        }
        logger.debug(`[river-overlay] Cached result was empty — refetching for ${cacheKey}`);
        await cacheDelete(cacheKey);
      }
    } else {
      logger.debug(`[river-overlay] Force refresh requested for ${cacheKey}`);
      await cacheDelete(cacheKey);
    }

    logger.debug(`[river-overlay] Fetching NHDPlus geometry for "${riverName}"`);

    // Texas bounding box to scope the query
    const geometry = JSON.stringify({
      xmin: -106.7, ymin: 25.8, xmax: -93.5, ymax: 36.5,
    });

    const allSegments: { coordinates: [number, number][] }[] = [];
    let offset = 0;
    const pageSize = 2000;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        where: `GNIS_Name = '${riverName}'`,
        geometry,
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'GNIS_Name,StreamOrde,LevelPathI,Hydroseq',
        returnGeometry: 'true',
        outSR: '4326',
        f: 'json',
        resultRecordCount: String(pageSize),
        resultOffset: String(offset),
        orderByFields: 'Hydroseq DESC',
      });

      const response = await axios.get(`${NHDPLUS_URL}?${params.toString()}`, {
        timeout: 30000,
      });

      const features = response.data?.features || [];
      logger.debug(`[river-overlay] Page at offset ${offset}: ${features.length} features`);

      for (const feat of features) {
        const paths: number[][][] = feat.geometry?.paths || [];
        for (const path of paths) {
          // Convert ArcGIS [lon, lat] → Leaflet [lat, lon]
          const coords: [number, number][] = path.map(
            ([lon, lat]) => [lat, lon] as [number, number]
          );
          if (coords.length > 1) {
            allSegments.push({ coordinates: coords });
          }
        }
      }

      hasMore = features.length === pageSize;
      offset += pageSize;

      // Safety limit
      if (offset > 10000) break;
    }

    logger.debug(`[river-overlay] Total segments for "${riverName}": ${allSegments.length}`);

    if (allSegments.length === 0) {
      logger.warn(`[river-overlay] No segments found for "${riverName}" — not caching empty result`);
      return NextResponse.json({ segments: [], cached: false });
    }

    // Try to join contiguous segments for smoother rendering
    const joined = joinSegments(allSegments.map(s => s.coordinates));

    const result = joined.map((coords, i) => ({
      id: `overlay-${i}`,
      coordinates: coords,
    }));

    await cacheSet(cacheKey, result, CACHE_TTL.WATERWAYS || 86400);

    return NextResponse.json({ segments: result, cached: false });
  } catch (error) {
    logger.error('[river-overlay] Error:', error);
    return NextResponse.json({ segments: [], error: 'Failed to fetch river geometry' });
  }
}

/**
 * Joins segments that share endpoints into longer continuous lines.
 */
function joinSegments(segments: [number, number][][]): [number, number][][] {
  if (segments.length === 0) return [];

  const SNAP_THRESHOLD = 0.001; // ~100m

  function coordsMatch(a: [number, number], b: [number, number]): boolean {
    return Math.abs(a[0] - b[0]) < SNAP_THRESHOLD && Math.abs(a[1] - b[1]) < SNAP_THRESHOLD;
  }

  const remaining = segments.map(s => [...s]);
  const result: [number, number][][] = [];

  while (remaining.length > 0) {
    const current = remaining.shift()!;
    let extended = true;

    while (extended) {
      extended = false;
      const tail = current[current.length - 1];

      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        if (coordsMatch(tail, seg[0])) {
          current.push(...seg.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (coordsMatch(tail, seg[seg.length - 1])) {
          seg.reverse();
          current.push(...seg.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }

      if (!extended) {
        const head = current[0];
        for (let i = 0; i < remaining.length; i++) {
          const seg = remaining[i];
          if (coordsMatch(head, seg[seg.length - 1])) {
            current.unshift(...seg.slice(0, -1));
            remaining.splice(i, 1);
            extended = true;
            break;
          }
          if (coordsMatch(head, seg[0])) {
            seg.reverse();
            current.unshift(...seg.slice(0, -1));
            remaining.splice(i, 1);
            extended = true;
            break;
          }
        }
      }
    }

    result.push(current);
  }

  return result;
}
