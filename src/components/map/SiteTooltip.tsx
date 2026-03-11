'use client';

import React from 'react';
import { WaterSite } from '@/types/water';
import { determineFloodRisk, getFloodRiskDisplay, getChartColor, formatLastUpdated, formatWaterLevel } from '@/lib/floodRisk';
import WaterLevelChart from '../WaterLevelChart';

interface SiteTooltipContentProps {
  site: WaterSite;
  globalTrendHours: number;
}

const SiteTooltipContent: React.FC<SiteTooltipContentProps> = ({ site, globalTrendHours }) => {
  return (
    <div className="p-2 max-w-xs" style={{width: '280px', maxWidth: '95vw', fontSize: '13px'}}>
      <h3 className="font-bold text-base md:text-lg mb-2 break-words whitespace-normal">{site.name}</h3>
      <div className="space-y-1 text-xs">
        <div>
          <strong>Site ID:</strong> {site.id}
        </div>
        <div>
          <strong>Type:</strong> {site.siteType ? site.siteType.charAt(0).toUpperCase() + site.siteType.slice(1) : 'River'} Gauge
        </div>
        <div>
          <strong>Status:</strong>{' '}
          <span
            className={`inline-block px-1 py-0.5 rounded text-xs text-white ${getFloodRiskDisplay(site).bgColor}`}
          >
            {getFloodRiskDisplay(site).label}
          </span>
        </div>
        {site.gageHeight && (
          <div>
            <strong>Gage Height:</strong> {formatWaterLevel(site.gageHeight)}
          </div>
        )}
        {site.lakeElevation && (
          <div>
            <strong>Lake Elevation:</strong> {formatWaterLevel(site.lakeElevation)}
          </div>
        )}
        {site.reservoirStorage && (
          <div>
            <strong>Storage:</strong> {formatWaterLevel(site.reservoirStorage, 'acre-ft')}
          </div>
        )}
        {site.floodStage && (
          <div>
            <strong>Flood Stage:</strong> {formatWaterLevel(site.floodStage)}
            {site.gageHeight && site.floodStage && (
              <span className="text-xs ml-1">
                ({((site.gageHeight / site.floodStage) * 100).toFixed(0)}% of flood stage)
              </span>
            )}
          </div>
        )}
        {site.streamflow && (
          <div>
            <strong>Streamflow:</strong> {formatWaterLevel(site.streamflow, 'cfs')}
          </div>
        )}
        {site.waterLevelStatus && (
          <div className="text-xs text-gray-600">
            <strong>USGS Status:</strong> {site.waterLevelStatus.toUpperCase()}
          </div>
        )}
        <div>
          <strong>Coordinates:</strong> {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
        </div>
        <div>
          <strong>Last Updated:</strong> {formatLastUpdated(site.lastUpdated)}
        </div>
      </div>
      {site.chartData && site.chartData.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <div className="text-xs font-semibold text-gray-600 mb-1">
            <span className="break-words whitespace-normal">Last {globalTrendHours} Hour{globalTrendHours !== 1 ? 's' : ''} Water Level (Chart data: {site.chartData.length} points)</span>
          </div>
          <div className="w-full overflow-hidden" style={{maxWidth: '100%'}}>
            <WaterLevelChart
              data={site.chartData}
              color={getChartColor(site)}
              height={96}
              forTooltip={true}
            />
          </div>
        </div>
      )}
      <div className="mt-2 pt-1 border-t border-gray-200 text-xs">
        <span className="text-blue-600">
          Click for detailed view • View on USGS
        </span>
      </div>
    </div>
  );
};

export default SiteTooltipContent;
