import axios from 'axios';
import { WaterSite, USGSResponse } from '@/types/water';

export class USGSService {
  static async getWaterSites(
    bbox?: { north: number; south: number; east: number; west: number },
    hours: number = 8
  ): Promise<WaterSite[]> {
    try {
      let url = '/api/usgs';
      
      const params = new URLSearchParams();
      
      if (bbox) {
        params.append('north', bbox.north.toString());
        params.append('south', bbox.south.toString());
        params.append('east', bbox.east.toString());
        params.append('west', bbox.west.toString());
      }
      
      // Add hours parameter
      params.append('hours', hours.toString());
      
      url += `?${params.toString()}`;

      console.log('Fetching USGS data from API route:', url);
      
      const response = await axios.get<USGSResponse>(url);
      
      console.log('API response:', response.data);
      
      if (!response.data?.value?.timeSeries) {
        console.log('No timeSeries data found in response');
        return [];
      }

      console.log('Found', response.data.value.timeSeries.length, 'time series records');

      const sites: WaterSite[] = response.data.value.timeSeries.map((timeSeries: any) => {
        const sourceInfo = timeSeries.sourceInfo;
        const siteCode = sourceInfo.siteCode[0]?.value || '';
        const location = sourceInfo.geoLocation.geogLocation;
        
        // Get the most recent value and historical data
        const values = timeSeries.values[0]?.value || [];
        const latestValue = values[values.length - 1];
        
        // Process chart data based on requested hours
        const chartData = values
          .filter((v: any) => v.value !== '-999999')
          .map((v: any) => ({
            time: new Date(v.dateTime).getTime(),
            value: parseFloat(v.value)
          }))
          .slice(-Math.min(values.length, Math.ceil(hours * 6))); // Approximate points based on hours (10-min intervals)
        
        let waterLevel: number | undefined;
        let waterLevelStatus: 'high' | 'normal' | 'low' | 'unknown' = 'unknown';
        
        if (latestValue && latestValue.value !== '-999999') {
          waterLevel = parseFloat(latestValue.value);
          
          // Simple classification based on parameter type
          if (timeSeries.variable.variableName.includes('Gage height')) {
            // For gage height, classify based on typical ranges
            if (waterLevel > 10) waterLevelStatus = 'high';
            else if (waterLevel > 3) waterLevelStatus = 'normal';
            else waterLevelStatus = 'low';
          } else if (timeSeries.variable.variableName.includes('Streamflow')) {
            // For streamflow, classify based on typical ranges
            if (waterLevel > 1000) waterLevelStatus = 'high';
            else if (waterLevel > 100) waterLevelStatus = 'normal';
            else waterLevelStatus = 'low';
          }
        }

        return {
          id: siteCode,
          name: sourceInfo.siteName,
          latitude: location.latitude,
          longitude: location.longitude,
          waterLevel,
          waterLevelStatus,
          lastUpdated: latestValue?.dateTime,
          chartData,
          ...(timeSeries.variable.variableName.includes('Gage height') && {
            gageHeight: waterLevel
          }),
          ...(timeSeries.variable.variableName.includes('Streamflow') && {
            streamflow: waterLevel
          })
        };
      });

      // Remove duplicates by site ID
      const uniqueSites = sites.reduce((acc, site) => {
        const existing = acc.find(s => s.id === site.id);
        if (!existing) {
          acc.push(site);
        } else {
          // Merge data if we have multiple parameters for the same site
          if (site.gageHeight) existing.gageHeight = site.gageHeight;
          if (site.streamflow) existing.streamflow = site.streamflow;
        }
        return acc;
      }, [] as WaterSite[]);

      return uniqueSites;
    } catch (error) {
      console.error('Error fetching USGS data:', error);
      return [];
    }
  }

  static async getSiteDetails(siteId: string, hours: number = 8): Promise<WaterSite | null> {
    try {
      // Use the API route for historical data to leverage caching
      console.log(`Getting site details for ${siteId} using API route`);
      
      const response = await axios.get(`/api/historical?siteId=${siteId}&hours=${hours}&parameterCode=00065`);
      
      if (response.data && response.data.data.length > 0) {
        const chartData = response.data.data;
        const latestPoint = chartData[chartData.length - 1];
        
        // Try to get streamflow data too
        let streamflowData: Array<{ time: number; value: number }> = [];
        try {
          const streamflowResponse = await axios.get(`/api/historical?siteId=${siteId}&hours=${hours}&parameterCode=00060`);
          if (streamflowResponse.data && streamflowResponse.data.data.length > 0) {
            streamflowData = streamflowResponse.data.data;
          }
        } catch (error) {
          console.warn('Could not fetch streamflow data:', error);
        }
        
        return {
          id: siteId,
          name: `Site ${siteId}`, // Will be enhanced with metadata from cache
          latitude: 0, // Will be enhanced with metadata from cache
          longitude: 0, // Will be enhanced with metadata from cache
          waterLevel: latestPoint.value,
          lastUpdated: new Date(latestPoint.time).toISOString(),
          chartData,
          gageHeight: chartData.length > 0 ? latestPoint.value : undefined,
          streamflow: streamflowData.length > 0 ? streamflowData[streamflowData.length - 1].value : undefined
        };
      }
      
      // Fallback to direct USGS API call
      return this.getSiteDetailsDirectly(siteId, hours);
    } catch (error) {
      console.error('Error fetching site details via API:', error);
      
      // Fallback to direct USGS API call
      return this.getSiteDetailsDirectly(siteId, hours);
    }
  }

  // Fallback method using direct USGS API call
  private static async getSiteDetailsDirectly(siteId: string, hours: number = 8): Promise<WaterSite | null> {
    try {
      // Fetch data for specified hours (period=PT{hours}H)
      const USGS_BASE_URL = 'https://waterservices.usgs.gov/nwis/iv/';
      const url = `${USGS_BASE_URL}?format=json&sites=${siteId}&parameterCd=00065,00060&period=PT${hours}H`;
      
      console.log(`Fallback: Fetching directly from USGS for site ${siteId}`);
      const response = await axios.get<USGSResponse>(url);
      
      if (!response.data?.value?.timeSeries?.[0]) {
        return null;
      }

      const timeSeries = response.data.value.timeSeries[0];
      const sourceInfo = timeSeries.sourceInfo;
      const location = sourceInfo.geoLocation.geogLocation;
      const values = timeSeries.values[0]?.value || [];
      const latestValue = values[values.length - 1];

      let waterLevel: number | undefined;
      if (latestValue && latestValue.value !== '-999999') {
        waterLevel = parseFloat(latestValue.value);
      }

      // Process historical data for chart
      const chartData = values
        .filter((v: any) => v.value !== '-999999')
        .map((v: any) => ({
          time: new Date(v.dateTime).getTime(),
          value: parseFloat(v.value)
        }))
        .slice(-Math.min(values.length, Math.ceil(hours * 6))); // Approximate points based on hours (10-min intervals)

      return {
        id: siteId,
        name: sourceInfo.siteName,
        latitude: location.latitude,
        longitude: location.longitude,
        waterLevel,
        lastUpdated: latestValue?.dateTime,
        chartData
      };
    } catch (error) {
      console.error('Error in fallback site details fetch:', error);
      return null;
    }
  }

  // Enhanced method to get bulk historical data with caching
  static async getBulkHistoricalData(
    siteIds: string[], 
    hours: number = 24
  ): Promise<{ [siteId: string]: Array<{ time: number; value: number }> }> {
    try {
      console.log(`Getting bulk historical data for ${siteIds.length} sites via API`);
      
      const result: { [siteId: string]: Array<{ time: number; value: number }> } = {};
      
      // Process sites in batches to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < siteIds.length; i += batchSize) {
        const batch = siteIds.slice(i, i + batchSize);
        const batchPromises = batch.map(async (siteId) => {
          try {
            const response = await axios.get(`/api/historical?siteId=${siteId}&hours=${hours}&parameterCode=00065`);
            if (response.data && response.data.data.length > 0) {
              return { siteId, data: response.data.data };
            }
            return { siteId, data: [] };
          } catch (error) {
            console.warn(`Failed to fetch historical data for site ${siteId}:`, error);
            return { siteId, data: [] };
          }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        batchResults.forEach((promiseResult) => {
          if (promiseResult.status === 'fulfilled') {
            const { siteId, data } = promiseResult.value;
            result[siteId] = data;
          }
        });
      }
      
      return result;
    } catch (error) {
      console.error('Error in bulk historical data fetch:', error);
      return {};
    }
  }
}
