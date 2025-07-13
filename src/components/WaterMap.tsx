'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { WaterSite } from '@/types/water';
import { USGSService } from '@/services/usgs';
import { WaterwayService, Waterway } from '@/services/waterways';
import CacheManager from './CacheManager';
import DraggableBox from './DraggableBox';

// Dynamically import MapView to avoid SSR issues with higher priority
const DynamicMap = dynamic(() => import('../components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-blue-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-lg font-medium text-gray-700">Loading water data...</p>
        <p className="mt-1 text-sm text-gray-500">Fetching latest gauge readings</p>
      </div>
    </div>
  ),
}) as React.ComponentType<{ 
  sites: WaterSite[]; 
  waterways: Waterway[];
  globalTrendHours: number;
  onTrendHoursChange: (hours: number) => void;
  onVisibilityStatsChange?: (stats: { totalSites: number; visibleSites: number; gaugeSitesVisible: boolean }) => void;
  onMapBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  chartControlsVisible?: boolean;
  floodPanelVisible?: boolean;
  onChartControlsVisibilityChange?: (visible: boolean) => void;
  onFloodPanelVisibilityChange?: (visible: boolean) => void;
}>;

export default function WaterMap() {
  const [sites, setSites] = useState<WaterSite[]>([]);
  const [waterways, setWaterways] = useState<Waterway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState('');
  const [globalTrendHours, setGlobalTrendHours] = useState(24);
  const [legendVisible, setLegendVisible] = useState(true);
  const [chartControlsVisible, setChartControlsVisible] = useState(false); // Closed by default
  const [floodPanelVisible, setFloodPanelVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [lastUpdated, setLastUpdated] = useState<{
    usgs?: string;
    floodStages?: string;
  }>({});
  const [visibilityStats, setVisibilityStats] = useState({
    totalSites: 0,
    visibleSites: 0,
    gaugeSitesVisible: true
  });
  const [currentViewBounds, setCurrentViewBounds] = useState<any>(null);

  // Memoize the trend hours change handler to prevent unnecessary re-renders
  const handleTrendHoursChange = useCallback((hours: number) => {
    setGlobalTrendHours(hours);
  }, []);

  // Memoize visibility stats handler
  const handleVisibilityStatsChange = useCallback((stats: { totalSites: number; visibleSites: number; gaugeSitesVisible: boolean }) => {
    setVisibilityStats(stats);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Format timestamp for display
  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Load data when map bounds change significantly
  const [lastLoadedBounds, setLastLoadedBounds] = useState<any>(null);
  
  // Load water sites for specific bounds
  const loadWaterSitesForBounds = useCallback(async (bbox: any) => {
    try {
      setLoading(true);
      setError(null);
      
      const currentTime = new Date().toISOString();
      
      console.log('Loading water sites for bounds:', bbox);
      
      const waterSites = await USGSService.getWaterSites(bbox, globalTrendHours);
      
      // Update USGS data timestamp
      setLastUpdated(prev => ({ ...prev, usgs: currentTime }));
      
      // Filter and prioritize sites for better performance
      const activeSites = waterSites
        .filter(site => site.chartData && site.chartData.length > 0) // Only sites with chart data
        .sort((a, b) => {
          // Prioritize by last updated time (most recent first)
          const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
          const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, 200); // Limit for better performance
      
      setSites(activeSites);
      console.log(`Loaded ${activeSites.length} active sites (from ${waterSites.length} total)`);
      
    } catch (err) {
      console.error('Error loading water sites:', err);
      setError('Failed to load water sites');
    } finally {
      setLoading(false);
    }
  }, [globalTrendHours]);

  // Load waterways for specific bounds
  const loadWaterwaysForBounds = useCallback(async (bbox: any) => {
    try {
      console.log('Loading waterways for bounds:', bbox);
      
      const waterwayData = await WaterwayService.getWaterways(bbox);
      setWaterways(waterwayData);
      
      console.log('Loaded waterways:', waterwayData.length);
    } catch (err) {
      console.error('Error loading waterways:', err);
      // Don't set error state for waterways, just continue without them
    }
  }, []);

  // Texas bounding box
  const TEXAS_BOUNDS = {
    north: 36.5,    // Full Texas north boundary
    south: 25.8,    // Full Texas south boundary  
    east: -93.5,    // Full Texas east boundary
    west: -106.7    // Full Texas west boundary
  };

  // Function to check if bounds are within Texas
  const isWithinTexas = useCallback((bounds: any) => {
    return bounds.north <= TEXAS_BOUNDS.north && 
           bounds.south >= TEXAS_BOUNDS.south &&
           bounds.east <= TEXAS_BOUNDS.east && 
           bounds.west >= TEXAS_BOUNDS.west;
  }, []);

  // Function to clamp bounds to Texas boundaries
  const clampToTexas = useCallback((bounds: any) => {
    return {
      north: Math.min(bounds.north, TEXAS_BOUNDS.north),
      south: Math.max(bounds.south, TEXAS_BOUNDS.south),
      east: Math.min(bounds.east, TEXAS_BOUNDS.east),
      west: Math.max(bounds.west, TEXAS_BOUNDS.west)
    };
  }, []);

  // Callback to handle map bounds changes - MUCH more responsive threshold
  const handleMapBoundsChange = useCallback(async (bounds: any) => {
    console.log('Map bounds changed:', bounds);
    
    // Clamp bounds to Texas only
    const texasBounds = clampToTexas(bounds);
    console.log('Clamped to Texas bounds:', texasBounds);
    
    // Very small threshold for immediate response - 0.01 degrees ≈ 1km
    if (!lastLoadedBounds || 
        Math.abs(texasBounds.north - lastLoadedBounds.north) > 0.01 ||
        Math.abs(texasBounds.south - lastLoadedBounds.south) > 0.01 ||
        Math.abs(texasBounds.east - lastLoadedBounds.east) > 0.01 ||
        Math.abs(texasBounds.west - lastLoadedBounds.west) > 0.01) {
      
      console.log('Loading new data for Texas bounds:', texasBounds);
      setLastLoadedBounds(texasBounds);
      setCurrentViewBounds(texasBounds);
      
      // Load both gauge sites and waterways for the Texas area only
      await Promise.all([
        loadWaterSitesForBounds(texasBounds),
        loadWaterwaysForBounds(texasBounds)
      ]);
    } else {
      console.log('Map movement too small, not loading new data');
    }
  }, [lastLoadedBounds, loadWaterSitesForBounds, loadWaterwaysForBounds, clampToTexas]);
  
  // Initialize with full Texas on mount
  useEffect(() => {
    console.log('Initial load for full Texas:', TEXAS_BOUNDS);
    
    // Load both water sites and waterways for initial area
    Promise.all([
      loadWaterSitesForBounds(TEXAS_BOUNDS),
      loadWaterwaysForBounds(TEXAS_BOUNDS)
    ]);
    
    setLastLoadedBounds(TEXAS_BOUNDS);
    setCurrentViewBounds(TEXAS_BOUNDS);
  }, [loadWaterSitesForBounds, loadWaterwaysForBounds]);

  // Update sites when trend hours change
  useEffect(() => {
    if (currentViewBounds) {
      const timeoutId = setTimeout(() => {
        loadWaterSitesForBounds(currentViewBounds);
      }, 300); // Debounce API calls by 300ms

      return () => clearTimeout(timeoutId);
    }
  }, [globalTrendHours, currentViewBounds, loadWaterSitesForBounds]);

  // Utility function to update water level status based on flood stages
  const updateWaterLevelStatus = (site: WaterSite): WaterSite => {
    if (!site.gageHeight || !site.floodStage) {
      return site; // Can't determine flood status without both values
    }
    
    const { gageHeight, floodStage, moderateFloodStage, majorFloodStage } = site;
    let waterLevelStatus: 'high' | 'normal' | 'low' | 'unknown' = 'normal';
    
    // Determine status based on flood stage thresholds
    if (majorFloodStage && gageHeight >= majorFloodStage) {
      waterLevelStatus = 'high'; // Major flooding
    } else if (moderateFloodStage && gageHeight >= moderateFloodStage) {
      waterLevelStatus = 'high'; // Moderate flooding  
    } else if (gageHeight >= floodStage) {
      waterLevelStatus = 'high'; // Minor flooding
    } else if (gageHeight >= floodStage * 0.8) {
      waterLevelStatus = 'high'; // Approaching flood stage
    } else if (gageHeight >= floodStage * 0.3) {
      waterLevelStatus = 'normal'; // Normal range
    } else {
      waterLevelStatus = 'low'; // Below normal
    }
    
    return { ...site, waterLevelStatus };
  };

  const handleStateChange = async (state: string) => {
    setSelectedState(state);
    // You could implement state-specific loading here
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
            onClick={() => currentViewBounds && loadWaterSitesForBounds(currentViewBounds)}
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
            DK&apos;s Texas Lake And River Flood Overview
            {visibilityStats.gaugeSitesVisible && (
              <span className="ml-3 text-sm font-normal text-red-600">
                🌊 Flood conditions detected
              </span>
            )}
          </h1>
          <div className="flex items-center space-x-3">
            {/* Dropdown Menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-lg flex items-center gap-2"
              >
                <span>⚙️</span>
                Controls
                <span className={`transform transition-transform ${menuOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>
              
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                  <div className="py-1">
                    {!chartControlsVisible && (
                      <button
                        onClick={() => {
                          setChartControlsVisible(true);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <span>⚙️</span>
                        Show Chart Controls
                      </button>
                    )}
                    {chartControlsVisible && (
                      <button
                        onClick={() => {
                          setChartControlsVisible(false);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <span>⚙️</span>
                        Hide Chart Controls
                      </button>
                    )}
                    
                    {!floodPanelVisible && (
                      <button
                        onClick={() => {
                          setFloodPanelVisible(true);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <span>🌊</span>
                        Show Flood Status
                      </button>
                    )}
                    {floodPanelVisible && (
                      <button
                        onClick={() => {
                          setFloodPanelVisible(false);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <span>🌊</span>
                        Hide Flood Status
                      </button>
                    )}
                    
                    {!legendVisible && (
                      <button
                        onClick={() => {
                          setLegendVisible(true);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <span>📊</span>
                        Show Legend
                      </button>
                    )}
                    {legendVisible && (
                      <button
                        onClick={() => {
                          setLegendVisible(false);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <span>📊</span>
                        Hide Legend
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="text-sm text-gray-600">
              {visibilityStats.gaugeSitesVisible 
                ? `Showing ${visibilityStats.visibleSites} of ${sites.length} sites in current view`
                : `${sites.length} gauge sites available (currently hidden)`
              }
              <div className="text-xs text-gray-500 mt-1">
                USGS: {formatTimestamp(lastUpdated.usgs)} • Flood Stages: {formatTimestamp(lastUpdated.floodStages)}
              </div>
            </div>
            <button 
              onClick={() => currentViewBounds && loadWaterSitesForBounds(currentViewBounds)}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Legend - Now Draggable */}
      {legendVisible && (
        <DraggableBox 
          id="water-level-legend"
          title="Water Level Status"
          initialPosition={{ x: 16, y: 80 }}
          onClose={() => setLegendVisible(false)}
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
      )}

      {/* Map */}
      <div className="pt-16 h-full">
        <DynamicMap 
          sites={sites} 
          waterways={waterways} 
          globalTrendHours={globalTrendHours}
          onTrendHoursChange={handleTrendHoursChange}
          onVisibilityStatsChange={handleVisibilityStatsChange}
          onMapBoundsChange={handleMapBoundsChange}
          chartControlsVisible={chartControlsVisible}
          floodPanelVisible={floodPanelVisible}
          onChartControlsVisibilityChange={setChartControlsVisible}
          onFloodPanelVisibilityChange={setFloodPanelVisible}
        />
        
        {/* Cache Management */}
        <CacheManager />
      </div>
    </div>
  );
}
