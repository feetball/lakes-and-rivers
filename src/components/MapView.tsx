'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import L from 'leaflet';
import { WaterSite } from '@/types/water';
import { Waterway } from '@/services/waterways';
import { createCustomIcon } from '@/lib/floodRisk';
import SiteTooltipContent from './map/SiteTooltip';
import SitePopupContent from './map/SitePopup';
import MapControls from './map/MapControls';
import MapChartOverlay from './MapChartOverlay';
import WaterwayLayer from './WaterwayLayer';
import FloodAwareWaterwayLayer from './FloodAwareWaterwayLayer';
import RiverOverlayLayer from './RiverOverlayLayer';
import FloodPredictionPanel from './FloodPredictionPanel';

// Import Leaflet CSS only on client side when component loads
import 'leaflet/dist/leaflet.css';

// Fix for default markers in react-leaflet - moved to useEffect to avoid SSR issues
let leafletIconsFixed = false;

const fixLeafletIcons = () => {
  if (!leafletIconsFixed && typeof window !== 'undefined') {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });
    leafletIconsFixed = true;
  }
};

interface MapViewProps {
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
  const [visibleSites, setVisibleSites] = useState<WaterSite[]>([]);
  const [layoutKey, setLayoutKey] = useState(0);

  React.useEffect(() => {
    function updateVisibleSites() {
      const bounds = map.getBounds();
      const filteredSites = (Array.isArray(sites) ? sites : []).filter(site =>
        bounds.contains([site.latitude, site.longitude])
      );
      setVisibleSites(filteredSites);
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

const MapView: React.FC<MapViewProps> = ({ 
  sites: initialSites, 
  waterways, 
  globalTrendHours, 
  onTrendHoursChange, 
  onVisibilityStatsChange,
  onMapBoundsChange,
  chartControlsVisible = true,
  floodPanelVisible = true,
  onChartControlsVisibilityChange,
  onFloodPanelVisibilityChange
}) => {
  const defaultCenter: [number, number] = [30.6327, -97.6769]; // Georgetown, TX
  const defaultZoom = 11;
  const [sites, setSites] = useState<WaterSite[]>(initialSites);
  const [visibleSites, setVisibleSites] = useState<WaterSite[]>(initialSites);
  const [chartsVisible, setChartsVisible] = useState(false);
  const [waterwaysVisible, setWaterwaysVisible] = useState(true);
  const [gaugeSitesVisible, setGaugeSitesVisible] = useState(true);
  const [floodAwarenessEnabled, setFloodAwarenessEnabled] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [controlsPosition, setControlsPosition] = useState({ x: 0, y: 16 });
  const [isLocalNetwork, setIsLocalNetwork] = useState(false);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const mapRef = useRef<any>(null);
  const boundsUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Periodically fetch latest gaugeSites from /api/usgs (Texas bounding box for cached data)
  useEffect(() => {
    // Fix Leaflet icons on client side
    fixLeafletIcons();
    
    let isMounted = true;
    let interval: NodeJS.Timeout;
    const fetchSites = async () => {
      try {
        // Use Texas bounding box to access cached data
        const resp = await fetch('/api/usgs?north=36.5&south=25.8&east=-93.5&west=-106.7&hours=24');
        if (!resp.ok) return;
        const data = await resp.json();
        if (data && Array.isArray(data.sites) && isMounted) {
          setSites(data.sites);
        }
      } catch (err) {
        // Optionally log error
      }
    };
    fetchSites();
    interval = setInterval(fetchSites, 60000); // 60s
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

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
    
    const updateVisibleSitesAndBounds = () => {
      const bounds = map.getBounds();
      const filteredSites = (Array.isArray(sites) ? sites : []).filter(site =>
        isSiteInBounds(site, bounds)
      );
      
      console.log(`Total sites: ${sites.length}, Visible: ${filteredSites.length}`);
      setVisibleSites(filteredSites);
      
      // Update visibility stats
      if (onVisibilityStatsChange) {
        onVisibilityStatsChange({
          totalSites: sites.length,
          visibleSites: filteredSites.length,
          gaugeSitesVisible
        });
      }
      
      // Notify parent component about bounds change for dynamic data loading
      if (onMapBoundsChange) {
        const boundsObj = {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        };
        onMapBoundsChange(boundsObj);
      }
    };
    
    // Add debounced update for more responsive bounds checking
    const debouncedUpdate = () => {
      if (boundsUpdateTimeoutRef.current) {
        clearTimeout(boundsUpdateTimeoutRef.current);
      }
      boundsUpdateTimeoutRef.current = setTimeout(updateVisibleSitesAndBounds, 100); // 100ms debounce
    };
    
    const immediateUpdate = () => {
      if (boundsUpdateTimeoutRef.current) {
        clearTimeout(boundsUpdateTimeoutRef.current);
      }
      updateVisibleSitesAndBounds();
    };
    
    // Use immediate update for end events, debounced for move events
    map.on('moveend zoomend', immediateUpdate);
    map.on('move zoom', debouncedUpdate);
    updateVisibleSitesAndBounds();
    
    return () => {
      if (boundsUpdateTimeoutRef.current) {
        clearTimeout(boundsUpdateTimeoutRef.current);
      }
      map.off('moveend zoomend', immediateUpdate);
      map.off('move zoom', debouncedUpdate);
    };
  }, [sites, gaugeSitesVisible, onVisibilityStatsChange, onMapBoundsChange]);

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

  return (
    <div className="relative h-full w-full">
      {/* Chart Time Range and Controls - Now Draggable */}
      {chartControlsVisible && (
        <MapControls
          controlsPosition={controlsPosition}
          onClose={() => onChartControlsVisibilityChange?.(false)}
          globalTrendHours={globalTrendHours}
          onTrendHoursChange={onTrendHoursChange}
          gaugeSitesVisible={gaugeSitesVisible}
          onGaugeSitesVisibleChange={setGaugeSitesVisible}
          chartsVisible={chartsVisible}
          onChartsVisibleChange={setChartsVisible}
          waterwaysVisible={waterwaysVisible}
          onWaterwaysVisibleChange={setWaterwaysVisible}
          floodAwarenessEnabled={floodAwarenessEnabled}
          onFloodAwarenessChange={setFloodAwarenessEnabled}
          isLocalNetwork={isLocalNetwork}
          cacheStats={cacheStats}
          onFetchCacheStats={fetchCacheStats}
          onClearAllCache={clearAllCache}
        />
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
        <RiverOverlayLayer rivers={['Guadalupe River']} />
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
              <SiteTooltipContent site={site} globalTrendHours={globalTrendHours} />
            </Tooltip>
            <Popup className="custom-popup">
              <SitePopupContent site={site} globalTrendHours={globalTrendHours} />
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
