'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { WaterSite } from '@/types/water';
import { USGSService } from '@/services/usgs';
import { WaterwayService, Waterway } from '@/services/waterways';
import CacheManager from './CacheManager';
import DraggableBox from './DraggableBox';

// Dynamically import MapView to avoid SSR issues
const DynamicMap = dynamic(() => import('../components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="text-lg">Loading map...</div>
    </div>
  ),
}) as React.ComponentType<{ 
  sites: WaterSite[]; 
  waterways: Waterway[];
  globalTrendHours: number;
  onTrendHoursChange: (hours: number) => void;
  onVisibilityStatsChange?: (stats: { totalSites: number; visibleSites: number; gaugeSitesVisible: boolean }) => void;
}>;

export default function WaterMap() {
  const [sites, setSites] = useState<WaterSite[]>([]);
  const [waterways, setWaterways] = useState<Waterway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState('');
  const [globalTrendHours, setGlobalTrendHours] = useState(24);
  const [visibilityStats, setVisibilityStats] = useState({
    totalSites: 0,
    visibleSites: 0,
    gaugeSitesVisible: true
  });

  useEffect(() => {
    loadWaterSites();
    loadWaterways();
  }, [globalTrendHours]); // Reload when time range changes

  const loadWaterways = async () => {
    try {
      // Load waterways for a 100-mile area around Austin (about 1.45 degrees)
      const bbox = {
        north: parseFloat((30.2672 + 1.45).toFixed(6)),  // ~31.717
        south: parseFloat((30.2672 - 1.45).toFixed(6)),  // ~28.817
        east: parseFloat((-97.7431 + 1.45).toFixed(6)),  // ~-96.293
        west: parseFloat((-97.7431 - 1.45).toFixed(6))   // ~-99.193
      };
      
      console.log('Loading waterways for 100-mile radius around Austin with bbox:', bbox);
      
      const waterwayData = await WaterwayService.getWaterways(bbox);
      setWaterways(waterwayData);
      
      console.log('Loaded waterways:', waterwayData);
    } catch (err) {
      console.error('Error loading waterways:', err);
      // Don't set error state for waterways, just continue without them
    }
  };

  const loadWaterSites = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load sites within 100-mile radius of Austin, TX (about 1.45 degrees)
      // Austin coordinates: 30.2672, -97.7431
      const bbox = {
        north: parseFloat((30.2672 + 1.45).toFixed(6)),  // ~31.717
        south: parseFloat((30.2672 - 1.45).toFixed(6)),  // ~28.817
        east: parseFloat((-97.7431 + 1.45).toFixed(6)),  // ~-96.293
        west: parseFloat((-97.7431 - 1.45).toFixed(6))   // ~-99.193
      };
      
      console.log('Loading water sites for 100-mile radius around Austin with bbox:', bbox);
      
      const waterSites = await USGSService.getWaterSites(bbox, globalTrendHours);
      
      console.log('Received sites:', waterSites);
      
      // If no sites found, add some test sites for demonstration
      if (waterSites.length === 0) {
        console.log('No USGS sites found, adding test sites');
        // Generate sample chart data for the specified hours
        const generateSampleChartData = (baseLevel: number) => {
          const data = [];
          const now = Date.now();
          const totalPoints = Math.max(globalTrendHours * 6, 6); // 6 points per hour (10-minute intervals)
          for (let i = totalPoints - 1; i >= 0; i--) {
            data.push({
              time: now - (i * 10 * 60 * 1000), // 10-minute intervals
              value: baseLevel + (Math.random() - 0.5) * 0.5 // Small random variation
            });
          }
          return data;
        };

        const testSites: WaterSite[] = [
          {
            id: 'test-001',
            name: 'San Gabriel River at Georgetown',
            latitude: 30.6327,
            longitude: -97.6769,
            waterLevel: 4.5,
            gageHeight: 4.5,
            waterLevelStatus: 'normal',
            lastUpdated: new Date().toISOString(),
            chartData: generateSampleChartData(4.5),
            floodStage: 14.0,
            streamflow: 45
          },
          {
            id: 'test-002', 
            name: 'South Fork San Gabriel River',
            latitude: 30.6100,
            longitude: -97.7000,
            waterLevel: 2.8,
            gageHeight: 2.8,
            waterLevelStatus: 'low',
            lastUpdated: new Date().toISOString(),
            chartData: generateSampleChartData(2.8),
            floodStage: 10.0,
            streamflow: 12
          },
          {
            id: 'test-003',
            name: 'Guadalupe River near Spring Branch',
            latitude: 29.8669,
            longitude: -98.3864,
            waterLevel: 12.2,
            gageHeight: 12.2,
            waterLevelStatus: 'high',
            lastUpdated: new Date().toISOString(),
            chartData: generateSampleChartData(12.2),
            floodStage: 11.0,
            streamflow: 2400
          },
          {
            id: 'test-004',
            name: 'Blanco River at Wimberley',
            latitude: 29.9966,
            longitude: -98.1000,
            waterLevel: 8.8,
            gageHeight: 8.8,
            waterLevelStatus: 'high',
            lastUpdated: new Date().toISOString(),
            chartData: generateSampleChartData(8.8),
            floodStage: 7.5,
            streamflow: 1850
          },
          {
            id: 'test-005',
            name: 'Guadalupe River at Comfort',
            latitude: 30.0267,
            longitude: -98.9095,
            waterLevel: 2.1,
            gageHeight: 2.1,
            waterLevelStatus: 'normal',
            lastUpdated: new Date().toISOString(),
            chartData: generateSampleChartData(2.1),
            floodStage: 8.0,
            streamflow: 95
          },
          {
            id: 'test-006',
            name: 'Pedernales River near Johnson City',
            latitude: 30.2756,
            longitude: -98.4095,
            waterLevel: 11.5,
            gageHeight: 11.5,
            waterLevelStatus: 'high',
            lastUpdated: new Date().toISOString(),
            chartData: generateSampleChartData(11.5),
            floodStage: 9.0,
            streamflow: 3200
          }
        ];
        setSites(testSites);
      } else {
        setSites(waterSites);
      }
    } catch (err) {
      console.error('Error loading water sites:', err);
      setError('Failed to load water sites');
      
      // Set test sites on error
      const generateSampleChartData = (baseLevel: number) => {
        const data = [];
        const now = Date.now();
        const totalPoints = Math.max(globalTrendHours * 6, 6); // 6 points per hour (10-minute intervals)
        for (let i = totalPoints - 1; i >= 0; i--) {
          data.push({
            time: now - (i * 10 * 60 * 1000), // 10-minute intervals
            value: baseLevel + (Math.random() - 0.5) * 0.5 // Small random variation
          });
        }
        return data;
      };

      const testSites: WaterSite[] = [
        {
          id: 'test-001',
          name: 'San Gabriel River at Georgetown (Test)',
          latitude: 30.6327,
          longitude: -97.6769,
          waterLevel: 4.5,
          gageHeight: 4.5,
          waterLevelStatus: 'normal',
          lastUpdated: new Date().toISOString(),
          chartData: generateSampleChartData(4.5),
          floodStage: 14.0,
          streamflow: 45
        }
      ];
      setSites(testSites);
    } finally {
      setLoading(false);
    }
  };

  const handleStateChange = async (state: string) => {
    setSelectedState(state);
    // You could implement state-specific loading here
  };

  const handleTrendHoursChange = (hours: number) => {
    setGlobalTrendHours(hours);
  };

  const handleVisibilityStatsChange = (stats: { totalSites: number; visibleSites: number; gaugeSitesVisible: boolean }) => {
    setVisibilityStats(stats);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-700">Loading water level data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-red-50">
        <div className="text-center">
          <p className="text-lg text-red-700">{error}</p>
          <button 
            onClick={loadWaterSites}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-white shadow-md">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-2xl font-bold text-gray-800">
            DK's Texas Lake And River Flood Overview
            {visibilityStats.gaugeSitesVisible && (
              <span className="ml-3 text-sm font-normal text-red-600">
                🌊 Flood conditions detected
              </span>
            )}
          </h1>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600">
              {visibilityStats.gaugeSitesVisible 
                ? `Showing ${visibilityStats.visibleSites} of ${sites.length} sites within 100 miles of Austin`
                : `${sites.length} gauge sites available (currently hidden)`
              }
            </div>
            <button 
              onClick={loadWaterSites}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Legend - Now Draggable */}
      <DraggableBox 
        id="water-level-legend"
        title="Water Level Status"
        initialPosition={{ x: 16, y: 80 }}
      >
        <div className="space-y-1 text-sm mb-4">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-600 rounded-full mr-2"></div>
            <span>High</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-600 rounded-full mr-2"></div>
            <span>Normal</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-yellow-600 rounded-full mr-2"></div>
            <span>Low</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-gray-600 rounded-full mr-2"></div>
            <span>Unknown</span>
          </div>
        </div>
        
        <h3 className="font-semibold mb-2">Rivers & Flood Risk</h3>
        <div className="space-y-1 text-sm mb-2">
          <div className="flex items-center">
            <div className="w-8 h-1 bg-blue-600 mr-2"></div>
            <span>Normal Mode</span>
          </div>
        </div>
        <div className="space-y-1 text-sm text-xs text-gray-600 mb-2">
          <div>🌊 Flood Awareness Mode:</div>
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex items-center">
            <div className="w-8 h-2 bg-red-600 mr-2"></div>
            <span className="text-xs">Extreme Risk</span>
          </div>
          <div className="flex items-center">
            <div className="w-8 h-1.5 bg-orange-600 mr-2"></div>
            <span className="text-xs">High Risk</span>
          </div>
          <div className="flex items-center">
            <div className="w-8 h-1 bg-yellow-600 mr-2"></div>
            <span className="text-xs">Moderate Risk</span>
          </div>
          <div className="flex items-center">
            <div className="w-8 h-1 bg-green-600 mr-2"></div>
            <span className="text-xs">Normal</span>
          </div>
          <div className="flex items-center">
            <div className="w-8 h-0.5 bg-blue-600 mr-2"></div>
            <span className="text-xs">Low Water</span>
          </div>
        </div>
      </DraggableBox>

      {/* Map */}
      <div className="pt-16 h-full">
        <DynamicMap 
          sites={sites} 
          waterways={waterways} 
          globalTrendHours={globalTrendHours}
          onTrendHoursChange={handleTrendHoursChange}
          onVisibilityStatsChange={handleVisibilityStatsChange}
        />
        
        {/* Cache Management */}
        <CacheManager />
      </div>
    </div>
  );
}
