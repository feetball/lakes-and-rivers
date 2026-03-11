import axios from 'axios';

export interface Waterway {
  id: string;
  name: string;
  type: 'river' | 'stream' | 'canal' | 'ditch' | 'lake' | 'reservoir';
  coordinates: Array<[number, number]>;
}

export class WaterwayService {
  /**
   * Fetch waterway geometry for a bounding box.
   *
   * Uses the NHDPlus flowlines API (USGS National Map) as primary source
   * because it reliably returns detailed river geometry for any viewport.
   * Falls back to the Overpass-based /api/waterways endpoint on failure.
   */
  static async getWaterways(bbox: {
    north: number;
    south: number;
    east: number;
    west: number;
  }): Promise<Waterway[]> {
    const params = new URLSearchParams({
      north: bbox.north.toString(),
      south: bbox.south.toString(),
      east: bbox.east.toString(),
      west: bbox.west.toString(),
    });

    // Try NHDPlus flowlines first (reliable, USGS-hosted)
    try {
      const response = await axios.get(`/api/flowlines?${params.toString()}`);
      const waterways: Waterway[] = response.data?.waterways || [];
      const withCoords = waterways.filter(w => w.coordinates && w.coordinates.length > 1);

      console.log(`[WaterwayService] NHDPlus: ${waterways.length} waterways, ${withCoords.length} with coords`);

      if (withCoords.length > 0) {
        return waterways;
      }
      console.log('[WaterwayService] NHDPlus returned no usable data, falling back to Overpass');
    } catch (err) {
      console.warn('[WaterwayService] NHDPlus failed, falling back to Overpass:', err);
    }

    // Fallback: Overpass API
    try {
      params.set('_t', Date.now().toString());
      const response = await axios.get(`/api/waterways?${params.toString()}`);
      const waterways: Waterway[] = response.data?.waterways || [];
      console.log(`[WaterwayService] Overpass fallback: ${waterways.length} waterways`);
      return waterways;
    } catch (error) {
      console.error('[WaterwayService] Both sources failed:', error);
      return [];
    }
  }
}
