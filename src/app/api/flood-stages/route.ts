import { NextRequest, NextResponse } from 'next/server';
import { cacheGet, cacheSet, CACHE_TTL } from '@/lib/redis';

// Make this route dynamic to avoid build-time static generation
export const dynamic = 'force-dynamic';

interface FloodStageData {
  siteId: string;
  floodStage?: number;
  moderateFloodStage?: number;
  majorFloodStage?: number;
  actionStage?: number;
  lastUpdated: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json(
        { error: 'siteId parameter is required' },
        { status: 400 }
      );
    }

    const cacheKey = `flood_stages:${siteId}`;
    
    // Try to get from cache first
    console.log('Checking cache for flood stage data:', cacheKey);
    const cachedData = await cacheGet(cacheKey);
    
    if (cachedData) {
      console.log('Returning cached flood stage data for site:', siteId);
      return NextResponse.json({...cachedData, cached: true}, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Fetch flood stage data from NWS Advanced Hydrologic Prediction Service (AHPS)
    // This is a simplified example - in reality you'd need to map USGS sites to NWS locations
    console.log('Fetching flood stage data for site:', siteId);
    
    // For now, return sample flood stage data based on known Texas sites
    const floodStageData: FloodStageData = {
      siteId,
      lastUpdated: new Date().toISOString(),
      // Sample flood stages for common Texas sites
      ...(getFloodStageForSite(siteId))
    };

    // Cache the results for 7 days since flood stages don't change often
    console.log('Caching flood stage data for site:', siteId);
    await cacheSet(cacheKey, floodStageData, CACHE_TTL.FLOOD_STAGES);
    
    return NextResponse.json({...floodStageData, cached: false}, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Flood stage API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch flood stage data' },
      { status: 500 }
    );
  }
}

// Sample flood stage data for known Texas sites
function getFloodStageForSite(siteId: string): Partial<FloodStageData> {
  const floodStages: { [key: string]: Partial<FloodStageData> } = {
    // Guadalupe River sites
    '08167000': { // Guadalupe River at Comfort
      floodStage: 15.0,
      moderateFloodStage: 18.0,
      majorFloodStage: 22.0,
      actionStage: 12.0
    },
    '08168500': { // Guadalupe River at Spring Branch
      floodStage: 12.0,
      moderateFloodStage: 15.0,
      majorFloodStage: 20.0,
      actionStage: 10.0
    },
    '08169000': { // Guadalupe River at Canyon Lake
      floodStage: 910.0, // Lake elevation in feet MSL
      moderateFloodStage: 920.0,
      majorFloodStage: 930.0,
      actionStage: 900.0
    },
    
    // Blanco River sites
    '08171000': { // Blanco River at Wimberley
      floodStage: 13.0,
      moderateFloodStage: 16.0,
      majorFloodStage: 20.0,
      actionStage: 10.0
    },
    
    // San Gabriel River sites
    '08104900': { // South Fork San Gabriel River at Georgetown
      floodStage: 16.0,
      moderateFloodStage: 19.0,
      majorFloodStage: 23.0,
      actionStage: 13.0
    },
    
    // Colorado River sites
    '08158000': { // Colorado River at Austin
      floodStage: 21.0,
      moderateFloodStage: 25.0,
      majorFloodStage: 30.0,
      actionStage: 18.0
    },
    
    // Pedernales River sites
    '08153500': { // Pedernales River near Johnson City
      floodStage: 14.0,
      moderateFloodStage: 17.0,
      majorFloodStage: 22.0,
      actionStage: 11.0
    }
  };
  
  // Return flood stage data if available, otherwise default values
  return floodStages[siteId] || {
    floodStage: 15.0, // Default flood stage
    moderateFloodStage: 18.0,
    majorFloodStage: 22.0,
    actionStage: 12.0
  };
}
