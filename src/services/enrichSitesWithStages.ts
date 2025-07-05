import { WaterSite } from '@/types/water';
import { gageCodeMap } from '@/data/gageCodeMap';
import { fetchNwsStages } from './nwsAhps';

// Enrich only the visible sites with flood/record stage from NWS
export async function enrichSitesWithStages(sites: WaterSite[]): Promise<WaterSite[]> {
  return Promise.all(
    sites.map(async (site) => {
      const gageCode = gageCodeMap[site.id];
      if (!gageCode) return site;
      const { floodStage, recordStage } = await fetchNwsStages(gageCode);
      return { ...site, floodStage, recordStage };
    })
  );
}
