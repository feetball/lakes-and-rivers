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
  lakeElevation?: number;
  reservoirStorage?: number;
  siteType?: 'river' | 'lake' | 'reservoir' | 'stream';
  chartData?: Array<{
    time: number;
    value: number;
  }>;
  floodStage?: number;
  moderateFloodStage?: number;
  majorFloodStage?: number;
  actionStage?: number;
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
