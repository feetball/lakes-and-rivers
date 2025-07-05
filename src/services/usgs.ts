import axios from 'axios';
import { WaterSite, USGSResponse } from '@/types/water';

export class USGSService {
  static async getWaterSites(
    bbox?: { north: number; south: number; east: number; west: number }
  ): Promise<WaterSite[]> {
    try {
      let url = '/api/usgs';
      
      if (bbox) {
        const params = new URLSearchParams({
          north: bbox.north.toString(),
          south: bbox.south.toString(),
          east: bbox.east.toString(),
          west: bbox.west.toString(),
        });
        url += `?${params.toString()}`;
      }

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
        
        // Process chart data (last 8 hours)
        const chartData = values
          .filter((v: any) => v.value !== '-999999')
          .map((v: any) => ({
            time: new Date(v.dateTime).getTime(),
            value: parseFloat(v.value)
          }))
          .slice(-48); // Last 48 points (8 hours at 10-min intervals)
        
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

  static async getSiteDetails(siteId: string): Promise<WaterSite | null> {
    try {
      // Fetch last 8 hours of data (period=PT8H for 8 hours)
      const USGS_BASE_URL = 'https://waterservices.usgs.gov/nwis/iv/';
      const url = `${USGS_BASE_URL}?format=json&sites=${siteId}&parameterCd=00065,00060&period=PT8H`;
      
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
        .filter(v => v.value !== '-999999')
        .map(v => ({
          time: new Date(v.dateTime).getTime(),
          value: parseFloat(v.value)
        }))
        .slice(-48); // Last 48 points (8 hours at 10-min intervals)

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
      console.error('Error fetching site details:', error);
      return null;
    }
  }
}
