'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { WaterSite } from '@/types/water';
import { Waterway, WaterwayOverlayMode } from '@/services/waterways';
import { createCustomIcon } from '@/lib/floodRisk';
import SiteTooltipContent from './map/SiteTooltip';
import SitePopupContent from './map/SitePopup';
import MapControls from './map/MapControls';
import MapChartOverlay from './MapChartOverlay';
import FloodAwareWaterwayLayer from './FloodAwareWaterwayLayer';
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

interface MapBoundsSyncProps {
  sites: WaterSite[];
  gaugeSitesVisible: boolean;
  onVisibleSitesChange: (sites: WaterSite[]) => void;
  onVisibilityStatsChange?: (stats: { totalSites: number; visibleSites: number; gaugeSitesVisible: boolean }) => void;
  onMapBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
}

/**
 * Child of MapContainer — uses react-leaflet's `useMap` hook so it is
 * guaranteed to receive the real Leaflet map instance. Replaces the old
 * `mapRef = container._leaflet_map` trick which never actually ran because
 * Leaflet doesn't expose the map on that property.
 */
const MapBoundsSync: React.FC<MapBoundsSyncProps> = ({
  sites,
  gaugeSitesVisible,
  onVisibleSitesChange,
  onVisibilityStatsChange,
  onMapBoundsChange,
}) => {
  const map = useMap();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const update = () => {
      const bounds = map.getBounds();
      const list = Array.isArray(sites) ? sites : [];
      const filtered = list.filter(
        (site) =>
          site.latitude >= bounds.getSouth() &&
          site.latitude <= bounds.getNorth() &&
          site.longitude >= bounds.getWest() &&
          site.longitude <= bounds.getEast()
      );
      onVisibleSitesChange(filtered);
      onVisibilityStatsChange?.({
        totalSites: list.length,
        visibleSites: filtered.length,
        gaugeSitesVisible,
      });
      onMapBoundsChange?.({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    };

    const debounced = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(update, 100);
    };

    update();
    map.on('moveend zoomend resize', update);
    map.on('move zoom', debounced);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      map.off('moveend zoomend resize', update);
      map.off('move zoom', debounced);
    };
  }, [map, sites, gaugeSitesVisible, onVisibleSitesChange, onVisibilityStatsChange, onMapBoundsChange]);

  return null;
};

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
  // The parent (`WaterMap`) owns the USGS fetch. Treat `initialSites` as a
  // live prop and forward it directly — the previous code copied it into
  // local state and then ran a competing /api/usgs fetch that raced with the
  // parent and frequently clobbered the site list with an empty array.
  const sites = initialSites;
  const [visibleSites, setVisibleSites] = useState<WaterSite[]>(initialSites);
  const [chartsVisible, setChartsVisible] = useState(false);
  const [waterwaysVisible, setWaterwaysVisible] = useState(true);
  const [waterwayOverlayMode, setWaterwayOverlayMode] = useState<WaterwayOverlayMode>('major');
  const [gaugeSitesVisible, setGaugeSitesVisible] = useState(true);
  const [floodAwarenessEnabled, setFloodAwarenessEnabled] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [controlsPosition, setControlsPosition] = useState({ x: 0, y: 16 });
  const [isLocalNetwork, setIsLocalNetwork] = useState(false);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const handleVisibleSitesChange = React.useCallback((next: WaterSite[]) => {
    setVisibleSites(next);
  }, []);

  // Fix Leaflet icons on client side (once per mount).
  useEffect(() => {
    fixLeafletIcons();
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

  const renderedWaterways = useMemo(() => {
    if (!waterwaysVisible) return [];

    return waterways.filter((waterway) => {
      if (waterway.type !== 'river' && waterway.type !== 'stream') {
        return false;
      }

      if (waterwayOverlayMode === 'major') {
        return waterway.detailLevel === 'statewide';
      }

      return waterway.detailLevel !== 'statewide';
    });
  }, [waterways, waterwaysVisible, waterwayOverlayMode]);

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
          waterwayOverlayMode={waterwayOverlayMode}
          onWaterwayOverlayModeChange={setWaterwayOverlayMode}
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
      >
        <MapBoundsSync
          sites={sites}
          gaugeSitesVisible={gaugeSitesVisible}
          onVisibleSitesChange={handleVisibleSitesChange}
          onVisibilityStatsChange={onVisibilityStatsChange}
          onMapBoundsChange={onMapBoundsChange}
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          tileSize={256}
        />
        <FloodAwareWaterwayLayer
          waterways={renderedWaterways}
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
