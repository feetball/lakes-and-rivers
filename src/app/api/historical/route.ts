import { NextRequest, NextResponse } from 'next/server';
import { CachedUSGSService } from '@/services/cachedUsgs';

// Make this route dynamic to avoid build-time static generation
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const hours = parseInt(searchParams.get('hours') || '24');
    const parameterCode = searchParams.get('parameterCode') || '00065';

    if (!siteId) {
      return NextResponse.json(
        { error: 'siteId parameter is required' },
        { status: 400 }
      );
    }

    console.log(`Fetching historical data for site ${siteId}, ${hours} hours, parameter ${parameterCode}`);

    const historicalData = await CachedUSGSService.getHistoricalData(siteId, hours, parameterCode);

    return NextResponse.json({
      siteId,
      hours,
      parameterCode,
      data: historicalData,
      dataPoints: historicalData.length,
      cached: true // This will be set appropriately by the service
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Historical data API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}
