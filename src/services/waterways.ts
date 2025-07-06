import axios from 'axios';

export interface Waterway {
  id: string;
  name: string;
  type: 'river' | 'stream' | 'canal' | 'ditch' | 'lake' | 'reservoir';
  coordinates: Array<[number, number]>;
}

export class WaterwayService {
  static async getWaterways(bbox: {
    north: number;
    south: number;
    east: number;
    west: number;
  }): Promise<Waterway[]> {
    try {
      const params = new URLSearchParams({
        north: bbox.north.toString(),
        south: bbox.south.toString(),
        east: bbox.east.toString(),
        west: bbox.west.toString(),
        _t: Date.now().toString(), // Cache busting timestamp
      });

      const response = await axios.get(`/api/waterways?${params.toString()}`);
      
      console.log('WaterwayService received response:', {
        status: response.status,
        dataType: typeof response.data,
        dataKeys: Object.keys(response.data || {}),
        waterwaysCount: response.data?.waterways?.length || 0,
        totalDataLength: Array.isArray(response.data) ? response.data.length : 'not array'
      });
      
      const waterways = response.data.waterways || [];
      const lakeCount = waterways.filter((w: any) => w.type === 'lake' || w.type === 'reservoir').length;
      console.log('WaterwayService filtered waterways:', {
        totalWaterways: waterways.length,
        lakesAndReservoirs: lakeCount,
        sampleLakes: waterways.filter((w: any) => w.type === 'lake' || w.type === 'reservoir').slice(0, 3).map((w: any) => ({ id: w.id, name: w.name, type: w.type }))
      });
      
      return waterways;
    } catch (error) {
      console.error('Error fetching waterways:', error);
      
      // Return empty array instead of fallback data to avoid test polygons
      return [];
    }
  }
}
