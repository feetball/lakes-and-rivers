'use client';

import React from 'react';
import { WaterSite } from '@/types/water';
import { determineFloodRisk, getFloodRiskDisplay, getChartColor, formatLastUpdated, formatWaterLevel } from '@/lib/floodRisk';
import WaterLevelChart from '../WaterLevelChart';

interface SitePopupContentProps {
  site: WaterSite;
  globalTrendHours: number;
}

const SitePopupContent: React.FC<SitePopupContentProps> = ({ site, globalTrendHours }) => {
  return (
    <div className="p-3 max-w-none">
      <h3 className="font-bold text-lg mb-3 break-words">{site.name}</h3>

      {/* Single column layout for better content flow */}
      <div className="space-y-2 text-sm mb-3">
        <div>
          <strong>Site ID:</strong> {site.id}
        </div>
        <div>
          <strong>Type:</strong> {site.siteType ? site.siteType.charAt(0).toUpperCase() + site.siteType.slice(1) : 'River'} Gauge
        </div>
        <div>
          <strong>Status:</strong>{' '}
          <span
            className={`inline-block px-2 py-1 rounded text-xs text-white ${getFloodRiskDisplay(site).bgColor}`}
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
              <span className="text-xs ml-1 block">
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
        <div>
          <strong>Coordinates:</strong> {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
        </div>
        <div>
          <strong>Last Updated:</strong> {formatLastUpdated(site.lastUpdated)}
        </div>
        {site.waterLevelStatus && (
          <div className="text-xs text-gray-600">
            <strong>USGS Status:</strong> {site.waterLevelStatus.toUpperCase()}
          </div>
        )}
      </div>

      {site.chartData && site.chartData.length > 0 && (
        <div className="pt-2 border-t border-gray-200">
          <div className="text-xs font-semibold text-gray-600 mb-2">
            <span className="break-words whitespace-normal">Last {globalTrendHours} Hour{globalTrendHours !== 1 ? 's' : ''} Water Level ({site.chartData.length} points)</span>
          </div>
          <WaterLevelChart
            data={site.chartData}
            color={getChartColor(site)}
            showTooltip={true}
            height={100}
          />
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-gray-200">
        <a
          href={`https://waterdata.usgs.gov/monitoring-location/${site.id}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          View on USGS →
        </a>
      </div>
    </div>
  );
};

export default SitePopupContent;
