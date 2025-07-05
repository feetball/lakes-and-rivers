import axios from 'axios';

export interface Waterway {
  id: string;
  name: string;
  type: 'river' | 'stream' | 'canal' | 'ditch';
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
      });

      const response = await axios.get(`/api/waterways?${params.toString()}`);
      
      return response.data.waterways || [];
    } catch (error) {
      console.error('Error fetching waterways:', error);
      
      // Return some sample major waterways for Central Texas area as fallback
      return [
        {
          id: 'sample-1',
          name: 'San Gabriel River',
          type: 'river',
          coordinates: [
            [30.6500, -97.7000],
            [30.6400, -97.6900],
            [30.6300, -97.6800],
            [30.6200, -97.6700],
            [30.6100, -97.6600],
            [30.6000, -97.6500]
          ]
        },
        {
          id: 'sample-2',
          name: 'Guadalupe River',
          type: 'river',
          coordinates: [
            [29.9000, -98.5000],
            [29.9100, -98.4000],
            [29.9200, -98.3000],
            [29.9300, -98.2000],
            [29.9400, -98.1000]
          ]
        },
        {
          id: 'sample-3',
          name: 'Colorado River',
          type: 'river',
          coordinates: [
            [30.2000, -97.8000],
            [30.2100, -97.7500],
            [30.2200, -97.7000],
            [30.2300, -97.6500]
          ]
        },
        {
          id: 'sample-4',
          name: 'Pedernales River',
          type: 'river',
          coordinates: [
            [30.2500, -98.5000],
            [30.2600, -98.4000],
            [30.2700, -98.3000],
            [30.2800, -98.2000]
          ]
        }
      ];
    }
  }
}
