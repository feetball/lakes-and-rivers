import { NextRequest, NextResponse } from 'next/server';
import { CachedUSGSService } from '@/services/cachedUsgs';
import { validateSiteId, validateHours, validateParameterCode } from '@/lib/security';
import { logger } from '@/lib/logger';

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

    if (!validateSiteId(siteId)) {
      return NextResponse.json(
        { error: 'Invalid siteId format. Must be 8-15 digits.' },
        { status: 400 }
      );
    }

    if (!validateHours(hours)) {
      return NextResponse.json(
        { error: 'Invalid hours value. Must be an integer between 1 and 168.' },
        { status: 400 }
      );
    }

    if (!validateParameterCode(parameterCode)) {
      return NextResponse.json(
        { error: 'Invalid parameterCode format. Must be a 5-digit code.' },
        { status: 400 }
      );
    }

    logger.debug(`Fetching historical data for site ${siteId}, ${hours} hours, parameter ${parameterCode}`);

    const historicalData = await CachedUSGSService.getHistoricalData(siteId, hours, parameterCode);

    return NextResponse.json({
      siteId,
      hours,
      parameterCode,
      data: historicalData,
      dataPoints: historicalData.length,
      cached: true // This will be set appropriately by the service
    });
  } catch (error) {
    logger.error('Historical data API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}
