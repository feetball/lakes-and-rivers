'use client';

import React from 'react';
import DraggableBox from '../DraggableBox';

interface MapControlsProps {
  controlsPosition: { x: number; y: number };
  onClose: () => void;
  globalTrendHours: number;
  onTrendHoursChange: (hours: number) => void;
  gaugeSitesVisible: boolean;
  onGaugeSitesVisibleChange: (visible: boolean) => void;
  chartsVisible: boolean;
  onChartsVisibleChange: (visible: boolean) => void;
  waterwaysVisible: boolean;
  onWaterwaysVisibleChange: (visible: boolean) => void;
  floodAwarenessEnabled: boolean;
  onFloodAwarenessChange: (enabled: boolean) => void;
  isLocalNetwork: boolean;
  cacheStats: any;
  onFetchCacheStats: () => void;
  onClearAllCache: () => void;
}

const MapControls: React.FC<MapControlsProps> = ({
  controlsPosition,
  onClose,
  globalTrendHours,
  onTrendHoursChange,
  gaugeSitesVisible,
  onGaugeSitesVisibleChange,
  chartsVisible,
  onChartsVisibleChange,
  waterwaysVisible,
  onWaterwaysVisibleChange,
  floodAwarenessEnabled,
  onFloodAwarenessChange,
  isLocalNetwork,
  cacheStats,
  onFetchCacheStats,
  onClearAllCache,
}) => {
  return (
    <DraggableBox
      id="chart-controls"
      title="Chart Time Range & Controls"
      initialPosition={controlsPosition}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Chart Time Range
          </label>
          <select
            className="border rounded px-2 py-1 text-sm bg-white text-gray-700 w-full"
            value={globalTrendHours}
            onChange={e => onTrendHoursChange(Number(e.target.value))}
          >
            <option value={1}>1 hour</option>
            <option value={8}>8 hours</option>
            <option value={24}>24 hours</option>
            <option value={48}>48 hours</option>
          </select>
        </div>

        <div>
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={gaugeSitesVisible}
              onChange={e => onGaugeSitesVisibleChange(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-700">Show Gauge Sites</span>
          </label>
        </div>

        <div>
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={chartsVisible}
              onChange={e => onChartsVisibleChange(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-700">Show Charts & Arrows</span>
          </label>
        </div>

        <div>
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={waterwaysVisible}
              onChange={e => onWaterwaysVisibleChange(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-700">Show Rivers & Lakes</span>
          </label>
        </div>

        <div>
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={floodAwarenessEnabled}
              onChange={e => onFloodAwarenessChange(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-700">🌊 Flood Awareness Mode</span>
          </label>
        </div>

        {isLocalNetwork && (
          <div className="pt-2 border-t border-gray-200 space-y-2">
            <div className="text-sm font-medium text-gray-700">Cache Management</div>

            {!cacheStats ? (
              <button
                onClick={onFetchCacheStats}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
              >
                📊 Load Cache Stats
              </button>
            ) : (
              <div className="space-y-2">
                <div className="bg-gray-50 p-2 rounded text-sm">
                  <div className="font-medium">Total Keys: {cacheStats.totalKeys}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    USGS: {cacheStats.usgsData} • Historical: {cacheStats.historicalData}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={onFetchCacheStats}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={onClearAllCache}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DraggableBox>
  );
};

export default MapControls;
