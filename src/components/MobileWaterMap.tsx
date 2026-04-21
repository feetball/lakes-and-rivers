'use client';

import React, { useState, useEffect } from 'react';
import MapView from '@/components/MapView';
import { useWaterData, BBox } from '@/hooks/useWaterData';
import { TEXAS_BBOX } from '@/constants/texas';

export default function MobileWaterMap() {
  const {
    sites,
    waterways,
    loading,
    error,
    loadAll,
    loadSitesForBounds,
    loadWaterwaysForBounds,
  } = useWaterData();
  const [globalTrendHours, setGlobalTrendHours] = useState(24);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load statewide waterways once along with the initial statewide site set.
  useEffect(() => {
    loadAll(TEXAS_BBOX, globalTrendHours);
  }, [loadAll]);

  useEffect(() => {
    loadSitesForBounds(TEXAS_BBOX, globalTrendHours);
  }, [globalTrendHours, loadSitesForBounds]);

  const handleTrendHoursChange = (hours: number) => {
    setGlobalTrendHours(hours);
  };

  const handleRefresh = () => {
    loadAll(TEXAS_BBOX, globalTrendHours);
  };

  const handleMapBoundsChange = (bounds: BBox) => {
    const texasBounds = {
      north: Math.min(bounds.north, TEXAS_BBOX.north),
      south: Math.max(bounds.south, TEXAS_BBOX.south),
      east: Math.min(bounds.east, TEXAS_BBOX.east),
      west: Math.max(bounds.west, TEXAS_BBOX.west),
    };

    loadWaterwaysForBounds(texasBounds);
  };

  const statusBanner = error ? (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1100] bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-1 rounded shadow">
      {error}{' '}
      <button onClick={handleRefresh} className="underline ml-2">Retry</button>
    </div>
  ) : loading && sites.length === 0 ? (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1100] bg-white border border-gray-200 text-gray-600 text-xs px-3 py-1 rounded shadow flex items-center gap-2">
      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
      Loading gauges…
    </div>
  ) : null;

  return (
    <div className="h-screen w-full relative">
      {statusBanner}
      {/* Mobile-Optimized Header */}
      <div className={`absolute top-0 left-0 right-0 z-[1000] bg-white shadow-md ${isMobile ? 'pb-2' : ''}`}>
        <div className={`p-4 ${isMobile ? 'pb-2' : ''}`}>
          {/* Main Header Row */}
          <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : ''}`}>
            <h1 className={`font-bold text-gray-800 ${isMobile ? 'text-base' : 'text-2xl'}`}>
              {isMobile ? 'DK Texas Water' : 'DK&apos;s Texas Lake And River Flood Overview'}
            </h1>
            
            {isMobile ? (
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            ) : (
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600">
                  {sites.length} monitoring sites
                </div>
                <button 
                  onClick={handleRefresh}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Refresh Data
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu or Desktop Stats */}
          {isMobile && (
            <>
              <div className="text-xs text-gray-600 text-center">
                {sites.length} monitoring sites
              </div>
              
              {showMobileMenu && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg border">
                  <div className="flex flex-col space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Time Range
                      </label>
                      <select
                        className="w-full border rounded px-2 py-1 text-xs bg-white"
                        value={globalTrendHours}
                        onChange={e => handleTrendHoursChange(Number(e.target.value))}
                      >
                        <option value={1}>1 hour</option>
                        <option value={8}>8 hours</option>
                        <option value={24}>24 hours</option>
                        <option value={48}>48 hours</option>
                      </select>
                    </div>
                    
                    <button 
                      onClick={handleRefresh}
                      className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                      Refresh Data
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Legend - Mobile Optimized */}
      <div className={`absolute ${isMobile ? 'bottom-4 left-4 right-4' : 'top-20 left-4'} z-[1000] bg-white p-3 rounded-lg shadow-md ${isMobile ? 'max-w-none' : 'max-w-xs'}`}>
        <h3 className={`font-semibold mb-2 ${isMobile ? 'text-sm text-center' : ''}`}>
          Water Level Status
        </h3>
        <div className={`grid ${isMobile ? 'grid-cols-3 gap-2 text-xs' : 'space-y-1 text-sm'}`}>
          <div className="flex items-center">
            <div className={`bg-red-600 rounded-full mr-2 ${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`}></div>
            <span>High</span>
          </div>
          <div className="flex items-center">
            <div className={`bg-green-600 rounded-full mr-2 ${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`}></div>
            <span>Normal</span>
          </div>
          <div className="flex items-center">
            <div className={`bg-yellow-600 rounded-full mr-2 ${isMobile ? 'w-3 h-3' : 'w-4 h-4'}`}></div>
            <span>Low</span>
          </div>
        </div>
        
        {isMobile && (
          <div className="mt-2 text-xs text-gray-500 text-center">
            Tap gauges for details
          </div>
        )}
      </div>

      {/* Map Container with proper mobile spacing */}
      <div className={`absolute inset-0 ${isMobile ? 'top-16 bottom-24' : 'top-20'}`}>
        <MapView
          sites={sites}
          waterways={waterways}
          globalTrendHours={globalTrendHours}
          onTrendHoursChange={handleTrendHoursChange}
          onMapBoundsChange={handleMapBoundsChange}
        />
      </div>
    </div>
  );
}
