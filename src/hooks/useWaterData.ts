'use client';

import { useState, useCallback } from 'react';
import { WaterSite } from '@/types/water';
import { USGSService } from '@/services/usgs';
import { WaterwayService, Waterway } from '@/services/waterways';
import { TEXAS_BBOX } from '@/constants/texas';

export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface UseWaterDataReturn {
  sites: WaterSite[];
  waterways: Waterway[];
  loading: boolean;
  error: string | null;
  loadSitesForBounds: (bbox: BBox, hours: number, options?: { maxSites?: number }) => Promise<void>;
  loadWaterwaysForBounds: (bbox: BBox) => Promise<void>;
  loadAll: (bbox: BBox, hours: number, options?: { maxSites?: number }) => Promise<void>;
  lastUpdated: { usgs?: string; floodStages?: string };
}

/**
 * Shared hook for fetching water sites and waterway data.
 *
 * Both WaterMap and MobileWaterMap use this to avoid duplicating
 * data-fetching logic around USGSService and WaterwayService.
 */
export function useWaterData(): UseWaterDataReturn {
  const [sites, setSites] = useState<WaterSite[]>([]);
  const [waterways, setWaterways] = useState<Waterway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<{
    usgs?: string;
    floodStages?: string;
  }>({});

  const isTexasWideBbox = useCallback((bbox: BBox) => {
    return (
      Math.abs(bbox.north - TEXAS_BBOX.north) < 0.2 &&
      Math.abs(bbox.south - TEXAS_BBOX.south) < 0.2 &&
      Math.abs(bbox.east - TEXAS_BBOX.east) < 0.2 &&
      Math.abs(bbox.west - TEXAS_BBOX.west) < 0.2
    );
  }, []);

  // Enrich a site with flood-stage-derived waterLevelStatus
  const enrichWithFloodStatus = (site: WaterSite): WaterSite => {
    if (!site.gageHeight || !site.floodStage) {
      return site;
    }

    const { gageHeight, floodStage, moderateFloodStage, majorFloodStage } = site;
    let waterLevelStatus: 'high' | 'normal' | 'low' | 'unknown' = 'normal';

    if (majorFloodStage && gageHeight >= majorFloodStage) {
      waterLevelStatus = 'high';
    } else if (moderateFloodStage && gageHeight >= moderateFloodStage) {
      waterLevelStatus = 'high';
    } else if (gageHeight >= floodStage) {
      waterLevelStatus = 'high';
    } else if (gageHeight >= floodStage * 0.8) {
      waterLevelStatus = 'high';
    } else if (gageHeight >= floodStage * 0.3) {
      waterLevelStatus = 'normal';
    } else {
      waterLevelStatus = 'low';
    }

    return { ...site, waterLevelStatus };
  };

  /**
   * Load water sites for a given bounding box.
   *
   * @param bbox      The geographic bounding box to query.
   * @param hours     Number of hours of trend data to request.
   * @param options.maxSites  If provided, cap to this many sites sorted by
   *                          most-recently-updated and filter to sites with chart data.
   */
  const loadSitesForBounds = useCallback(async (
    bbox: BBox,
    hours: number,
    options?: { maxSites?: number }
  ) => {
    try {
      setLoading(true);
      setError(null);

      const currentTime = new Date().toISOString();

      console.log('Loading water sites for bounds:', bbox);

      const waterSites = await USGSService.getWaterSites(bbox, hours);

      setLastUpdated(prev => ({ ...prev, usgs: currentTime }));

      let processedSites: WaterSite[];

      if (options?.maxSites) {
        // Filter to active sites, sort by most recent, cap, and enrich
        processedSites = waterSites
          .filter(site => site.chartData && site.chartData.length > 0)
          .sort((a, b) => {
            const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
            const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
            return bTime - aTime;
          })
          .slice(0, options.maxSites)
          .map(enrichWithFloodStatus);
      } else {
        processedSites = waterSites.map(enrichWithFloodStatus);
      }

      setSites(processedSites);
      console.log(`Loaded ${processedSites.length} sites (from ${waterSites.length} total)`);
    } catch (err) {
      console.error('Error loading water sites:', err);
      setError('Failed to load water sites');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load waterways for a given bounding box.
   * Merges new waterways with existing ones (keyed by id) so that
   * a slow/empty response never wipes out previously loaded geometry.
   */
  const loadWaterwaysForBounds = useCallback(async (bbox: BBox) => {
    try {
      console.log('Loading waterways for bounds:', bbox);
      const loadingStatewide = isTexasWideBbox(bbox);

      const waterwayData = await WaterwayService.getWaterways(bbox);

      const withCoords = waterwayData.filter(w => w.coordinates && w.coordinates.length > 1);
      console.log(`[useWaterData] Fetched ${waterwayData.length} waterways (${withCoords.length} with coords) for bbox`, bbox);

      if (waterwayData.length === 0) {
        console.log('[useWaterData] Empty response — keeping existing waterways');
        return;
      }

      setWaterways(prev => {
        const existingStatewide = prev.filter(w => w.detailLevel === 'statewide');
        const existingViewport = prev.filter(w => w.detailLevel !== 'statewide');

        const nextSegment = new Map<string, Waterway>();
        for (const waterway of waterwayData) {
          nextSegment.set(waterway.id, waterway);
        }

        const nextWaterways = loadingStatewide
          ? [...Array.from(nextSegment.values()), ...existingViewport]
          : [...existingStatewide, ...Array.from(nextSegment.values())];

        console.log(
          `[useWaterData] Stored ${loadingStatewide ? 'statewide' : 'viewport'} waterways: ${nextSegment.size}; total=${nextWaterways.length}`
        );

        return nextWaterways;
      });
    } catch (err) {
      console.error('Error loading waterways:', err);
      // Don't set error state or clear waterways — keep whatever we have
    }
  }, [isTexasWideBbox]);

  /**
   * Convenience: load both sites and waterways in parallel.
   */
  const loadAll = useCallback(async (
    bbox: BBox,
    hours: number,
    options?: { maxSites?: number }
  ) => {
    await Promise.all([
      loadSitesForBounds(bbox, hours, options),
      loadWaterwaysForBounds(bbox)
    ]);
  }, [loadSitesForBounds, loadWaterwaysForBounds]);

  return {
    sites,
    waterways,
    loading,
    error,
    loadSitesForBounds,
    loadWaterwaysForBounds,
    loadAll,
    lastUpdated,
  };
}
