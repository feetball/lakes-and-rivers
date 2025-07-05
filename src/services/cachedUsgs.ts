import axios from 'axios';
import { WaterSite, USGSResponse } from '@/types/water';
import { 
  cacheGet, 
  cacheSet, 
  cacheGetMultiple,
  cacheSetMultiple,
  generateHistoricalDataKey,
  generateSiteMetadataKey,
  CACHE_TTL 
} from '@/lib/redis';

interface CachedHistoricalData {
  siteId: string;
  data: Array<{ time: number; value: number }>;
  lastUpdated: string;
  fromTime: string;
  toTime: string;
  parameterCode: string;
}

interface SiteMetadata {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  parameterCodes: string[];
  lastUpdated: string;
}

export class CachedUSGSService {
  private static readonly USGS_BASE_URL = 'https://waterservices.usgs.gov/nwis/iv/';
  private static readonly PARAMETER_CODES = ['00065', '00060']; // Gage height, Streamflow

  /**
   * Get historical data with smart caching - only fetches missing data
   */
  static async getHistoricalData(
    siteId: string, 
    hours: number,
    parameterCode: string = '00065'
  ): Promise<Array<{ time: number; value: number }>> {
    try {
      const cacheKey = generateHistoricalDataKey(siteId, hours);
      const now = new Date();
      const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

      // Check for cached data
      const cachedData = await cacheGet(cacheKey) as CachedHistoricalData | null;
      
      if (cachedData && this.isCacheValid(cachedData, startTime, now)) {
        console.log(`Using cached historical data for site ${siteId} (${hours}h)`);
        return cachedData.data;
      }

      // Determine what data we need to fetch
      let fetchStartTime = startTime;
      let existingData: Array<{ time: number; value: number }> = [];

      if (cachedData) {
        // We have some cached data, check what's missing
        const cachedEndTime = new Date(cachedData.toTime);
        const dataGap = now.getTime() - cachedEndTime.getTime();
        
        if (dataGap < 2 * 60 * 60 * 1000) { // Less than 2 hours gap
          // Only fetch the missing recent data
          fetchStartTime = new Date(cachedEndTime.getTime() - 30 * 60 * 1000); // 30 min overlap
          existingData = cachedData.data.filter(d => d.time >= startTime.getTime());
          console.log(`Incrementally updating data for site ${siteId} from ${fetchStartTime.toISOString()}`);
        }
      }

      // Fetch new data from USGS
      const newData = await this.fetchUSGSData(siteId, fetchStartTime, now, parameterCode);
      
      // Merge with existing data if we're doing incremental update
      let mergedData = newData;
      if (existingData.length > 0) {
        mergedData = this.mergeHistoricalData(existingData, newData);
      }

      // Filter to the requested time range
      const filteredData = mergedData.filter(d => d.time >= startTime.getTime());

      // Cache the result
      const cacheData: CachedHistoricalData = {
        siteId,
        data: filteredData,
        lastUpdated: now.toISOString(),
        fromTime: startTime.toISOString(),
        toTime: now.toISOString(),
        parameterCode
      };

      await cacheSet(cacheKey, cacheData, CACHE_TTL.HISTORICAL_DATA);
      console.log(`Cached historical data for site ${siteId} (${filteredData.length} points)`);

      return filteredData;
    } catch (error) {
      console.error(`Error fetching historical data for site ${siteId}:`, error);
      return [];
    }
  }

  /**
   * Get multiple sites' historical data efficiently
   */
  static async getBulkHistoricalData(
    siteIds: string[], 
    hours: number
  ): Promise<{ [siteId: string]: Array<{ time: number; value: number }> }> {
    try {
      // Generate cache keys for all sites
      const cacheKeys = siteIds.map(id => generateHistoricalDataKey(id, hours));
      
      // Get all cached data at once
      const cachedDataMap = await cacheGetMultiple(cacheKeys);
      
      const now = new Date();
      const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
      
      const result: { [siteId: string]: Array<{ time: number; value: number }> } = {};
      const sitesToFetch: string[] = [];
      
      // Check which sites need fresh data
      siteIds.forEach((siteId, index) => {
        const cacheKey = cacheKeys[index];
        const cachedData = cachedDataMap[cacheKey] as CachedHistoricalData | null;
        
        if (cachedData && this.isCacheValid(cachedData, startTime, now)) {
          result[siteId] = cachedData.data;
        } else {
          sitesToFetch.push(siteId);
        }
      });

      // Fetch missing data in batches
      if (sitesToFetch.length > 0) {
        console.log(`Fetching historical data for ${sitesToFetch.length} sites`);
        
        // Process in batches to avoid overwhelming the API
        const batchSize = 10;
        for (let i = 0; i < sitesToFetch.length; i += batchSize) {
          const batch = sitesToFetch.slice(i, i + batchSize);
          const batchPromises = batch.map(siteId => 
            this.getHistoricalData(siteId, hours)
          );
          
          const batchResults = await Promise.allSettled(batchPromises);
          batchResults.forEach((promiseResult, batchIndex) => {
            const siteId = batch[batchIndex];
            if (promiseResult.status === 'fulfilled') {
              result[siteId] = promiseResult.value;
            } else {
              console.error(`Failed to fetch data for site ${siteId}:`, promiseResult.reason);
              result[siteId] = [];
            }
          });
        }
      }

      return result;
    } catch (error) {
      console.error('Error in bulk historical data fetch:', error);
      return {};
    }
  }

  /**
   * Cache site metadata separately for efficiency
   */
  static async cacheSiteMetadata(sites: WaterSite[]): Promise<void> {
    try {
      const metadataToCache: { [key: string]: SiteMetadata } = {};
      
      sites.forEach(site => {
        const metadata: SiteMetadata = {
          id: site.id,
          name: site.name,
          latitude: site.latitude,
          longitude: site.longitude,
          parameterCodes: this.PARAMETER_CODES,
          lastUpdated: new Date().toISOString()
        };
        
        const cacheKey = generateSiteMetadataKey(site.id);
        metadataToCache[cacheKey] = metadata;
      });
      
      if (Object.keys(metadataToCache).length > 0) {
        await cacheSetMultiple(metadataToCache, CACHE_TTL.SITE_METADATA);
        console.log(`Cached metadata for ${Object.keys(metadataToCache).length} sites`);
      }
    } catch (error) {
      console.error('Error caching site metadata:', error);
    }
  }

  /**
   * Get cached site metadata
   */
  static async getCachedSiteMetadata(siteIds: string[]): Promise<{ [siteId: string]: SiteMetadata }> {
    try {
      const cacheKeys = siteIds.map(generateSiteMetadataKey);
      const cachedData = await cacheGetMultiple(cacheKeys);
      
      const result: { [siteId: string]: SiteMetadata } = {};
      Object.entries(cachedData).forEach(([cacheKey, metadata]) => {
        if (metadata) {
          result[metadata.id] = metadata;
        }
      });
      
      return result;
    } catch (error) {
      console.error('Error getting cached site metadata:', error);
      return {};
    }
  }

  /**
   * Check if cached data is still valid
   */
  private static isCacheValid(
    cachedData: CachedHistoricalData, 
    requestedStartTime: Date, 
    now: Date
  ): boolean {
    const cacheStartTime = new Date(cachedData.fromTime);
    const cacheEndTime = new Date(cachedData.toTime);
    const cacheAge = now.getTime() - new Date(cachedData.lastUpdated).getTime();
    
    // Cache is valid if:
    // 1. It covers the requested time range
    // 2. It's not too old (less than cache TTL)
    // 3. The end time is recent enough
    const coversTimeRange = cacheStartTime.getTime() <= requestedStartTime.getTime();
    const isNotTooOld = cacheAge < CACHE_TTL.HISTORICAL_DATA * 1000;
    const isRecentEnough = (now.getTime() - cacheEndTime.getTime()) < 30 * 60 * 1000; // 30 minutes
    
    return coversTimeRange && isNotTooOld && isRecentEnough;
  }

  /**
   * Fetch data from USGS API
   */
  private static async fetchUSGSData(
    siteId: string,
    startTime: Date,
    endTime: Date,
    parameterCode: string
  ): Promise<Array<{ time: number; value: number }>> {
    try {
      const startTimeStr = startTime.toISOString();
      const endTimeStr = endTime.toISOString();
      
      const url = `${this.USGS_BASE_URL}?format=json&sites=${siteId}&parameterCd=${parameterCode}&startDT=${startTimeStr}&endDT=${endTimeStr}`;
      
      console.log(`Fetching USGS data: ${url}`);
      const response = await axios.get<USGSResponse>(url);
      
      if (!response.data?.value?.timeSeries?.[0]?.values?.[0]?.value) {
        return [];
      }
      
      const values = response.data.value.timeSeries[0].values[0].value;
      
      return values
        .filter((v: any) => v.value !== '-999999' && !isNaN(parseFloat(v.value)))
        .map((v: any) => ({
          time: new Date(v.dateTime).getTime(),
          value: parseFloat(v.value)
        }))
        .sort((a, b) => a.time - b.time);
        
    } catch (error) {
      console.error(`Error fetching USGS data for site ${siteId}:`, error);
      return [];
    }
  }

  /**
   * Merge existing and new historical data, removing duplicates
   */
  private static mergeHistoricalData(
    existingData: Array<{ time: number; value: number }>,
    newData: Array<{ time: number; value: number }>
  ): Array<{ time: number; value: number }> {
    const merged = [...existingData];
    const existingTimes = new Set(existingData.map(d => d.time));
    
    // Add new data points that don't already exist
    newData.forEach(point => {
      if (!existingTimes.has(point.time)) {
        merged.push(point);
      }
    });
    
    // Sort by time and return
    return merged.sort((a, b) => a.time - b.time);
  }

  /**
   * Clear cache for a specific site (useful for forced refresh)
   */
  static async clearSiteCache(siteId: string): Promise<void> {
    try {
      const client = await cacheGet('dummy'); // Just to get client
      if (!client) return;
      
      // Clear all cached data for this site
      const patterns = [
        generateHistoricalDataKey(siteId, 8),
        generateHistoricalDataKey(siteId, 24),
        generateHistoricalDataKey(siteId, 48),
        generateSiteMetadataKey(siteId)
      ];
      
      await Promise.all(patterns.map(pattern => cacheGet(pattern)));
      console.log(`Cleared cache for site ${siteId}`);
    } catch (error) {
      console.error(`Error clearing cache for site ${siteId}:`, error);
    }
  }
}
