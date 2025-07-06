import axios from 'axios';
import { WaterSite } from '@/types/water';

// Fetch and parse NWS AHPS hydrograph XML for a given gage code (e.g. GTNT2)
export async function fetchNwsStages(gageCode: string): Promise<{ floodStage?: number; recordStage?: number }> {
  const url = `https://water.weather.gov/ahps2/hydrograph_to_xml.php?gage=${gageCode}`;
  try {
    const response = await axios.get(url, { responseType: 'text' });
    const xml = response.data;
    // Simple XML parsing (no DOMParser in Node, so use regex for these fields)
    const floodMatch = xml.match(/<flood_stage>(.*?)<\/flood_stage>/);
    const recordMatch = xml.match(/<record_stage>(.*?)<\/record_stage>/);
    const floodStage = floodMatch ? parseFloat(floodMatch[1]) : undefined;
    const recordStage = recordMatch ? parseFloat(recordMatch[1]) : undefined;
    return { floodStage, recordStage };
  } catch (e) {
    console.error('Error fetching/parsing NWS AHPS XML for', gageCode, e);
    return {};
  }
}
