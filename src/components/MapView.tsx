'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import L from 'leaflet';
import { WaterSite } from '@/types/water';
import { Waterway } from '@/services/waterways';
import WaterLevelChart from './WaterLevelChart';
import MapChartOverlay from './MapChartOverlay';
import WaterwayLayer from './WaterwayLayer';
import FloodAwareWaterwayLayer from './FloodAwareWaterwayLayer';
import FloodPredictionPanel from './FloodPredictionPanel';
import DraggableBox from './DraggableBox';

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapViewProps {
  sites: WaterSite[];
  waterways: Waterway[];
  globalTrendHours: number;
  onTrendHoursChange: (hours: number) => void;
  onVisibilityStatsChange?: (stats: { totalSites: number; visibleSites: number; gaugeSitesVisible: boolean }) => void;
  chartControlsVisible?: boolean;
  floodPanelVisible?: boolean;
  onChartControlsVisibilityChange?: (visible: boolean) => void;
  onFloodPanelVisibilityChange?: (visible: boolean) => void;
}

// Component to handle map events and overlay positioning
const MapOverlayHandler: React.FC<{ sites: WaterSite[]; globalTrendHours: number; chartsVisible: boolean }> = ({ sites, globalTrendHours, chartsVisible }) => {
  const map = useMap();
  const [overlayPositions, setOverlayPositions] = useState<Array<{ site: WaterSite; x: number; y: number; gaugeX: number; gaugeY: number; index: number }>>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Only show sites within 100 miles of Austin, and only display overlays for those in the viewport
  const AUSTIN_LAT = 30.2672;
  const AUSTIN_LON = -97.7431;
  const RADIUS_MILES = 100;
  // Haversine formula
  function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 3958.8; // Earth radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Only consider sites within 300 miles of Austin, but always re-filter from all sites on map move
  const [visibleSites, setVisibleSites] = useState<WaterSite[]>([]);
  const [layoutKey, setLayoutKey] = useState(0);

  React.useEffect(() => {
    function updateVisibleSites() {
      const bounds = map.getBounds();
      setVisibleSites(
        (Array.isArray(sites) ? sites : []).filter(site =>
          haversine(AUSTIN_LAT, AUSTIN_LON, site.latitude, site.longitude) <= RADIUS_MILES &&
          bounds.contains([site.latitude, site.longitude])
        )
      );
      setLayoutKey(k => k + 1);
    }
    updateVisibleSites();
    map.on('move', updateVisibleSites);
    map.on('moveend', updateVisibleSites);
    map.on('zoom', updateVisibleSites);
    map.on('zoomend', updateVisibleSites);
    map.on('resize', updateVisibleSites);
    return () => {
      map.off('move', updateVisibleSites);
      map.off('moveend', updateVisibleSites);
      map.off('zoom', updateVisibleSites);
      map.off('zoomend', updateVisibleSites);
      map.off('resize', updateVisibleSites);
    };
  }, [map, sites]);

  useEffect(() => {
    if (visibleSites.length === 0) {
      setOverlayPositions([]);
      return;
    }

    const chartRadius = 160;
    const minDistance = chartRadius * 2.5; // Increased minimum distance
    const mapContainer = map.getContainer();
    const rect = mapContainer.getBoundingClientRect();
    
    // Better initial positioning using grid-based layout
    let overlays = visibleSites.map((site, index) => {
      const point = map.latLngToContainerPoint([site.latitude, site.longitude]);
      
      // Use a more systematic initial placement
      const gridSize = Math.ceil(Math.sqrt(visibleSites.length));
      const row = Math.floor(index / gridSize);
      const col = index % gridSize;
      const spacing = minDistance * 0.8;
      
      return {
        site,
        x: rect.left + point.x + (col - gridSize/2) * spacing,
        y: rect.top + point.y + (row - gridSize/2) * spacing,
        gx: rect.left + point.x,
        gy: rect.top + point.y,
        index
      };
    });

    // Enhanced force-directed algorithm
    const attractStrength = 0.08; // Reduced to prevent overcorrection
    const repelStrength = 1.2; // Increased repulsion
    const iterations = 50; // More iterations for better settling
    const damping = 0.9; // Add damping to reduce oscillation

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < overlays.length; i++) {
        let dx = 0, dy = 0;
        
        // Repulsion from other overlays (stronger and longer range)
        for (let j = 0; j < overlays.length; j++) {
          if (i === j) continue;
          const ox = overlays[i].x - overlays[j].x;
          const oy = overlays[i].y - overlays[j].y;
          const dist = Math.sqrt(ox * ox + oy * oy) || 1;
          
          if (dist < minDistance) {
            const force = Math.pow((minDistance - dist) / minDistance, 2) * repelStrength;
            dx += (ox / dist) * force;
            dy += (oy / dist) * force;
          }
        }
        
        // Attraction to gauge (weaker)
        const toGaugeX = overlays[i].gx - overlays[i].x;
        const toGaugeY = overlays[i].gy - overlays[i].y;
        const gaugeDist = Math.sqrt(toGaugeX * toGaugeX + toGaugeY * toGaugeY);
        
        // Only attract if too far from gauge
        if (gaugeDist > minDistance * 0.7) {
          dx += toGaugeX * attractStrength;
          dy += toGaugeY * attractStrength;
        }
        
        // Apply damping and update position
        overlays[i].x += dx * damping;
        overlays[i].y += dy * damping;
      }
    }

    setOverlayPositions(
      overlays.map((o, idx) => ({
        site: o.site,
        x: o.x,
        y: o.y,
        gaugeX: o.gx,
        gaugeY: o.gy,
        index: o.index
      }))
    );
  }, [map, visibleSites, layoutKey]);

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <>
      {chartsVisible && overlayPositions.map(({ site, x, y, gaugeX, gaugeY, index }) => (
        <MapChartOverlay
          key={site.id}
          site={site}
          position={{ x, y }}
          gaugePosition={{ x: gaugeX, y: gaugeY }}
          index={index}
          totalSites={sites.length}
          globalTrendHours={globalTrendHours}
        />
      ))}
    </>,
    document.body
  );
};

// Unified flood risk assessment function (matches FloodAwareWaterwayLayer)
const determineFloodRisk = (site: WaterSite): 'extreme' | 'high' | 'moderate' | 'normal' | 'low' | 'unknown' => {
  if (!site.gageHeight) return 'unknown';
  
  // Enhanced flood risk assessment using flood stage data
  const { gageHeight, floodStage, streamflow } = site;
  
  // If we have flood stage data, use it for more accurate assessment (PRIORITY)
  if (floodStage && gageHeight) {
    const floodRatio = gageHeight / floodStage;
    if (floodRatio >= 1.2) return 'extreme';  // 20% above flood stage
    if (floodRatio >= 1.0) return 'high';     // At or above flood stage
    if (floodRatio >= 0.8) return 'moderate'; // Approaching flood stage
    if (floodRatio >= 0.5) return 'normal';   // Normal levels
    return 'low';                             // Below normal
  }
  
  // Fallback to basic status with streamflow consideration if no flood stage
  const waterLevelStatus = site.waterLevelStatus;
  if (waterLevelStatus === 'high') {
    // Consider streamflow for more nuanced assessment
    if (streamflow && streamflow > 1000) return 'extreme';
    if (streamflow && streamflow > 500) return 'high';
    return 'moderate';
  }
  
  if (waterLevelStatus === 'normal') return 'normal';
  if (waterLevelStatus === 'low') return 'low';
  return 'unknown';
};

const createCustomIcon = (site: WaterSite) => {
  const floodRisk = determineFloodRisk(site);
  
  const colors = {
    extreme: '#dc2626', // Bright red
    high: '#ea580c',    // Red-orange
    moderate: '#d97706', // Orange
    normal: '#16a34a',   // Green
    low: '#0891b2',      // Teal (low water)
    unknown: '#6b7280'   // Gray
  };

  const color = colors[floodRisk];

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); cursor: pointer;"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};


const MapView: React.FC<MapViewProps> = ({ 
  sites, 
  waterways, 
  globalTrendHours, 
  onTrendHoursChange, 
  onVisibilityStatsChange,
  chartControlsVisible = true,
  floodPanelVisible = true,
  onChartControlsVisibilityChange,
  onFloodPanelVisibilityChange
}) => {
  const defaultCenter: [number, number] = [30.6327, -97.6769]; // Georgetown, TX
  const defaultZoom = 11;
  const [visibleSites, setVisibleSites] = useState<WaterSite[]>(sites);
  const [chartsVisible, setChartsVisible] = useState(false);
  const [waterwaysVisible, setWaterwaysVisible] = useState(true);
  const [gaugeSitesVisible, setGaugeSitesVisible] = useState(true);
  const [floodAwarenessEnabled, setFloodAwarenessEnabled] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [controlsPosition, setControlsPosition] = useState({ x: 0, y: 16 });
  const [isLocalNetwork, setIsLocalNetwork] = useState(false);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const mapRef = useRef<any>(null);

  // Check if user is on local network for cache management
  useEffect(() => {
    const checkLocalNetwork = () => {
      const hostname = window.location.hostname;
      const isLocal = hostname === 'localhost' || 
                     hostname === '127.0.0.1' || 
                     hostname.startsWith('192.168.11.') ||
                     hostname.startsWith('10.') ||
                     hostname.startsWith('172.16.') ||
                     hostname.startsWith('172.17.') ||
                     hostname.startsWith('172.18.') ||
                     hostname.startsWith('172.19.') ||
                     hostname.startsWith('172.2') ||
                     hostname.startsWith('172.30.') ||
                     hostname.startsWith('172.31.');
      
      setIsLocalNetwork(isLocal);
    };

    checkLocalNetwork();
  }, []);

  // Cache management functions
  const fetchCacheStats = async () => {
    try {
      const response = await fetch('/api/cache');
      if (response.ok) {
        const data = await response.json();
        setCacheStats(data);
      }
    } catch (error) {
      console.error('Error fetching cache stats:', error);
    }
  };

  const clearAllCache = async () => {
    try {
      const response = await fetch('/api/cache?type=all', { method: 'DELETE' });
      if (response.ok) {
        console.log('Cache cleared successfully');
        setCacheStats(null);
        // Optionally reload data
        window.location.reload();
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  };

  // Mobile detection and controls positioning
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Position controls on the right side, accounting for screen width
      setControlsPosition({ 
        x: Math.max(window.innerWidth - 320, 16), 
        y: 16 
      });
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Austin-based filtering constants
  const AUSTIN_LAT = 30.2672;
  const AUSTIN_LON = -97.7431;
  const RADIUS_MILES = 100;

  // Haversine formula
  function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 3958.8; // Earth radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Helper: check if a site is within bounds
  const isSiteInBounds = (site: WaterSite, bounds: any) => {
    const lat = site.latitude;
    const lng = site.longitude;
    return (
      lat >= bounds.getSouth() &&
      lat <= bounds.getNorth() &&
      lng >= bounds.getWest() &&
      lng <= bounds.getEast()
    );
  };

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const updateVisibleSites = () => {
      const bounds = map.getBounds();
      const filteredSites = (Array.isArray(sites) ? sites : []).filter(site =>
        haversine(AUSTIN_LAT, AUSTIN_LON, site.latitude, site.longitude) <= RADIUS_MILES &&
        isSiteInBounds(site, bounds)
      );
      console.log(`Total sites: ${sites.length}, Within 100mi of Austin: ${sites.filter(site => haversine(AUSTIN_LAT, AUSTIN_LON, site.latitude, site.longitude) <= RADIUS_MILES).length}, Visible: ${filteredSites.length}`);
      setVisibleSites(filteredSites);
      
      // Update visibility stats
      if (onVisibilityStatsChange) {
        onVisibilityStatsChange({
          totalSites: sites.length,
          visibleSites: filteredSites.length,
          gaugeSitesVisible
        });
      }
    };
    map.on('moveend zoomend', updateVisibleSites);
    updateVisibleSites();
    return () => {
      map.off('moveend zoomend', updateVisibleSites);
    };
  }, [sites, gaugeSitesVisible, onVisibilityStatsChange]);

  // Update visibility stats when gauge sites visibility changes
  useEffect(() => {
    if (onVisibilityStatsChange) {
      onVisibilityStatsChange({
        totalSites: sites.length,
        visibleSites: visibleSites.length,
        gaugeSitesVisible
      });
    }
  }, [gaugeSitesVisible, onVisibilityStatsChange, sites.length, visibleSites.length]);

  // Utility functions (unchanged)
  const formatLastUpdated = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return 'Unknown';
    }
  };
  const formatWaterLevel = (level?: number, unit: string = 'ft') => {
    if (level === undefined) return 'No data';
    return `${level.toFixed(2)} ${unit}`;
  };
  const getChartColor = (site: WaterSite) => {
    const floodRisk = determineFloodRisk(site);
    const colors = {
      extreme: '#dc2626', // Bright red
      high: '#ea580c',    // Red-orange
      moderate: '#d97706', // Orange
      normal: '#16a34a',   // Green
      low: '#0891b2',      // Teal (low water)
      unknown: '#6b7280'   // Gray
    };
    return colors[floodRisk];
  };
  
  const getFloodRiskDisplay = (site: WaterSite) => {
    const floodRisk = determineFloodRisk(site);
    const labels = {
      extreme: 'EXTREME RISK',
      high: 'HIGH RISK',
      moderate: 'MODERATE RISK',
      normal: 'NORMAL',
      low: 'LOW WATER',
      unknown: 'UNKNOWN'
    };
    const bgColors = {
      extreme: 'bg-red-600',
      high: 'bg-orange-600', 
      moderate: 'bg-yellow-600',
      normal: 'bg-green-600',
      low: 'bg-blue-600',
      unknown: 'bg-gray-600'
    };
    return {
      label: labels[floodRisk],
      bgColor: bgColors[floodRisk],
      risk: floodRisk
    };
  };

  return (
    <div className="relative h-full w-full">
      {/* Chart Time Range and Controls - Now Draggable */}
      {chartControlsVisible && (
        <DraggableBox
          id="chart-controls"
          title="Chart Time Range & Controls"
          initialPosition={controlsPosition}
          onClose={() => onChartControlsVisibilityChange?.(false)}
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
                  onChange={e => setGaugeSitesVisible(e.target.checked)}
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
                  onChange={e => setChartsVisible(e.target.checked)}
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
                  onChange={e => setWaterwaysVisible(e.target.checked)}
                  className="rounded"
                />
                <span className="text-gray-700">Show Major Rivers</span>
              </label>
            </div>
            
            <div>
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={floodAwarenessEnabled}
                  onChange={e => setFloodAwarenessEnabled(e.target.checked)}
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
                    onClick={fetchCacheStats}
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
                        onClick={fetchCacheStats}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                      >
                        Refresh
                      </button>
                      <button
                        onClick={clearAllCache}
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
      )}
      
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
        scrollWheelZoom={true}
        attributionControl={true}
        whenReady={() => {
          // Use Leaflet's global map instance from the ref
          if (mapRef.current) return;
          // Find the map instance from the DOM
          const mapContainers = document.getElementsByClassName('leaflet-container');
          if (mapContainers.length > 0) {
            // @ts-ignore
            const map = mapContainers[0]._leaflet_map;
            if (map) mapRef.current = map;
          }
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          tileSize={256}
        />
        <FloodAwareWaterwayLayer 
          waterways={waterwaysVisible ? waterways : []} 
          gaugeSites={sites}
          enabled={floodAwarenessEnabled}
        />
        {gaugeSitesVisible && visibleSites.map((site) => (
          <Marker
            key={site.id}
            position={[site.latitude, site.longitude]}
            icon={createCustomIcon(site)}
          >
            <Tooltip 
              direction="top" 
              offset={[0, -20]} 
              opacity={0.9} 
              className="custom-tooltip"
              permanent={false}
              sticky={false}
            >
              <div className="p-2 max-w-xs">
                <h3 className="font-bold text-base mb-2">{site.name}</h3>
                <div className="space-y-1 text-xs">
                  <div>
                    <strong>Site ID:</strong> {site.id}
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
                      Last {globalTrendHours} Hour{globalTrendHours !== 1 ? 's' : ''} Water Level (Chart data: {site.chartData.length} points)
                    </div>
                    <WaterLevelChart 
                      data={site.chartData} 
                      color={getChartColor(site)}
                      height={96}
                      forTooltip={true}
                    />
                  </div>
                )}
                <div className="mt-2 pt-1 border-t border-gray-200 text-xs">
                  <span className="text-blue-600">
                    Click for detailed view • View on USGS
                  </span>
                </div>
              </div>
            </Tooltip>
            <Popup className="custom-popup">
              <div className="p-2">
                <h3 className="font-bold text-lg mb-2">{site.name}</h3>
                <div className="space-y-1 text-sm">
                  <div>
                    <strong>Site ID:</strong> {site.id}
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
                  <div className="mt-3 pt-2 border-t border-gray-200">
                    <div className="text-xs font-semibold text-gray-600 mb-2">
                      Last {globalTrendHours} Hour{globalTrendHours !== 1 ? 's' : ''} Water Level (Detailed View - {site.chartData.length} points)
                    </div>
                    <WaterLevelChart 
                      data={site.chartData} 
                      color={getChartColor(site)}
                      showTooltip={true}
                      height={120}
                    />
                  </div>
                )}
                <div className="mt-3 pt-2 border-t border-gray-200">
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
            </Popup>
          </Marker>
        ))}
        <MapOverlayHandler sites={gaugeSitesVisible ? visibleSites : []} globalTrendHours={globalTrendHours} chartsVisible={chartsVisible} />
      </MapContainer>
      
      {floodPanelVisible && (
        <FloodPredictionPanel 
          gaugeSites={sites}
          waterways={waterways}
          enabled={floodAwarenessEnabled}
          onClose={() => onFloodPanelVisibilityChange?.(false)}
        />
      )}
    </div>
  );
};

export default MapView;
