export interface WaterSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  waterLevel?: number;
  waterLevelStatus?: 'high' | 'normal' | 'low' | 'unknown';
  lastUpdated?: string;
  streamflow?: number;
  gageHeight?: number;
  chartData?: Array<{
    time: number;
    value: number;
  }>;
  floodStage?: number;
  recordStage?: number;
}

export interface USGSResponse {
  value: {
    timeSeries: Array<{
      sourceInfo: {
        siteName: string;
        geoLocation: {
          geogLocation: {
            latitude: number;
            longitude: number;
          };
        };
        siteCode: Array<{
          value: string;
        }>;
      };
      values: Array<{
        value: Array<{
          value: string;
          dateTime: string;
        }>;
      }>;
      variable: {
        variableName: string;
        variableDescription: string;
        unitCode: string;
      };
    }>;
  };
}
