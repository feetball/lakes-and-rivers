'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { WaterSite } from '@/types/water';
import { USGSService } from '@/services/usgs';
import { WaterwayService, Waterway } from '@/services/waterways';

// Dynamically import MapView to avoid SSR issues
const DynamicMap = dynamic(() => import('../components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-blue-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-700">Loading map...</p>
      </div>
    </div>
  ),
}) as React.ComponentType<{ 
  sites: WaterSite[]; 
  waterways: Waterway[];
  globalTrendHours: number;
  onTrendHoursChange: (hours: number) => void;
}>;

export default function MobileWaterMap() {
  const [sites, setSites] = useState<WaterSite[]>([]);
  const [waterways, setWaterways] = useState<Waterway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    loadWaterSites();
    loadWaterways();
  }, [globalTrendHours]);

  const loadWaterways = async () => {
    try {
      const bbox = {
        north: parseFloat((30.2672 + 1.45).toFixed(6)),
        south: parseFloat((30.2672 - 1.45).toFixed(6)),
        east: parseFloat((-97.7431 + 1.45).toFixed(6)),
        west: parseFloat((-97.7431 - 1.45).toFixed(6))
      };
      
      const waterwayData = await WaterwayService.getWaterways(bbox);
      setWaterways(waterwayData);
    } catch (error) {
      console.error('Failed to load waterways:', error);
    }
  };

  const loadWaterSites = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use the same bbox as the regular WaterMap for consistency
      const bbox = {
        north: parseFloat((30.2672 + 1.45).toFixed(6)),
        south: parseFloat((30.2672 - 1.45).toFixed(6)),
        east: parseFloat((-97.7431 + 1.45).toFixed(6)),
        west: parseFloat((-97.7431 - 1.45).toFixed(6))
      };
      
      const waterSites = await USGSService.getWaterSites(bbox, globalTrendHours);
      setSites(waterSites);
    } catch (error) {
      console.error('Failed to load water sites:', error);
      setError('Failed to load water level data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTrendHoursChange = (hours: number) => {
    setGlobalTrendHours(hours);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-700">Loading water level data...</p>
          {isMobile && <p className="mt-2 text-sm text-gray-500">This may take a moment on mobile</p>}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-red-50">
        <div className="text-center p-4">
          <p className="text-lg text-red-700 mb-4">{error}</p>
          <button 
            onClick={loadWaterSites}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative">
      {/* Mobile-Optimized Header */}
      <div className={`absolute top-0 left-0 right-0 z-[1000] bg-white shadow-md ${isMobile ? 'pb-2' : ''}`}>
        <div className={`p-4 ${isMobile ? 'pb-2' : ''}`}>
          {/* Main Header Row */}
          <div className={`flex items-center justify-between ${isMobile ? 'mb-2' : ''}`}>
            <h1 className={`font-bold text-gray-800 ${isMobile ? 'text-base' : 'text-2xl'}`}>
              {isMobile ? 'USGS Water' : 'USGS Water Levels - Central Texas'}
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
                  onClick={loadWaterSites}
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
                      onClick={loadWaterSites}
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
        <DynamicMap 
          sites={sites} 
          waterways={waterways}
          globalTrendHours={globalTrendHours}
          onTrendHoursChange={handleTrendHoursChange}
        />
      </div>
    </div>
  );
}
