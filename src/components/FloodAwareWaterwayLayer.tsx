'use client';

import React, { useMemo } from 'react';
import { Polyline, Polygon, Tooltip } from 'react-leaflet';
import { Waterway } from '@/services/waterways';
import { WaterSite } from '@/types/water';

interface FloodAwareWaterwayLayerProps {
  waterways: Waterway[];
  gaugeSites: WaterSite[];
  enabled: boolean;
}

interface WaterwaySegment {
  id: string;
  name: string;
  type: 'river' | 'stream' | 'canal' | 'ditch' | 'lake' | 'reservoir';
  coordinates: Array<[number, number]>;
  nearestGauge?: WaterSite;
  distance?: number;
  floodRisk: 'extreme' | 'high' | 'moderate' | 'normal' | 'low' | 'unknown';
  flowDirection?: 'downstream' | 'upstream';
}

const FloodAwareWaterwayLayer: React.FC<FloodAwareWaterwayLayerProps> = ({ 
  waterways, 
  gaugeSites, 
  enabled 
}) => {
  // Temporary debug: Check if there are any test polygons
  const testPolygons = waterways.filter(w => 
    w.coordinates.some(coord => 
      coord[0] >= 30.4 && coord[0] <= 30.5 && coord[1] >= -97.8 && coord[1] <= -97.7
    )
  );
  if (testPolygons.length > 0) {
    console.warn('Found potential test polygons:', testPolygons.map(p => ({ id: p.id, name: p.name, type: p.type })));
  }
  
  // Calculate distance between two points using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 3958.8; // Earth radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Determine flood risk based on gauge data
  const determineFloodRisk = (gauge: WaterSite): 'extreme' | 'high' | 'moderate' | 'normal' | 'low' | 'unknown' => {
    if (!gauge.waterLevelStatus || !gauge.gageHeight) return 'unknown';
    
    // Enhanced flood risk assessment
    const { waterLevelStatus, gageHeight, floodStage, streamflow } = gauge;
    
    // If we have flood stage data, use it for more accurate assessment
    if (floodStage && gageHeight) {
      const floodRatio = gageHeight / floodStage;
      if (floodRatio >= 1.2) return 'extreme';  // 20% above flood stage
      if (floodRatio >= 1.0) return 'high';     // At or above flood stage
      if (floodRatio >= 0.8) return 'moderate'; // Approaching flood stage
      if (floodRatio >= 0.5) return 'normal';   // Normal levels
      return 'low';                             // Below normal
    }
    
    // Fallback to basic status with streamflow consideration
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

  // Determine flow direction based on elevation and streamflow
  const determineFlowDirection = (segment: Array<[number, number]>, gauge: WaterSite): 'downstream' | 'upstream' => {
    if (!gauge.streamflow || gauge.streamflow <= 0) return 'downstream';
    
    // In Central Texas, rivers generally flow from northwest to southeast
    // This is a simplified heuristic - in reality, we'd need elevation data
    const startPoint = segment[0];
    const endPoint = segment[segment.length - 1];
    
    const latChange = endPoint[0] - startPoint[0]; // North is positive
    const lonChange = endPoint[1] - startPoint[1]; // East is positive
    
    // If moving southeast (typical flow direction in Central Texas)
    if (latChange < 0 && lonChange > 0) return 'downstream';
    if (latChange > 0 && lonChange < 0) return 'upstream';
    
    // Default based on streamflow magnitude
    return gauge.streamflow > 100 ? 'downstream' : 'upstream';
  };

  // Process waterways to determine flood conditions
  const processedWaterways = useMemo<WaterwaySegment[]>(() => {
    if (!enabled || !gaugeSites.length) {
      return waterways.map(w => ({
        id: w.id,
        name: w.name,
        type: w.type,
        coordinates: w.coordinates,
        floodRisk: 'unknown' as const
      }));
    }

    // Only associate a gauge if within 5 miles
    const MAX_GAUGE_DISTANCE = 10; // miles

    return waterways.map(waterway => {
      let nearestGauge: WaterSite | undefined;
      let minDistance = Infinity;
      
      // Ensure coordinates exist and are not empty
      if (!waterway.coordinates || waterway.coordinates.length === 0) {
        return {
          id: waterway.id,
          name: waterway.name,
          type: waterway.type,
          coordinates: waterway.coordinates || [],
          floodRisk: 'unknown' as const
        };
      }
      
      const midpoint = waterway.coordinates[Math.floor(waterway.coordinates.length / 2)];
      
      // Ensure midpoint is a valid coordinate array
      if (!midpoint || !Array.isArray(midpoint) || midpoint.length < 2) {
        return {
          id: waterway.id,
          name: waterway.name,
          type: waterway.type,
          coordinates: waterway.coordinates,
          floodRisk: 'unknown' as const
        };
      }

      gaugeSites.forEach(gauge => {
        const distance = calculateDistance(
          midpoint[0], midpoint[1],
          gauge.latitude, gauge.longitude
        );
        if (distance < MAX_GAUGE_DISTANCE && distance < minDistance) {
          minDistance = distance;
          nearestGauge = gauge;
        }
      });

      // Only use gauge if within 5 miles, otherwise treat as unknown
      const floodRisk = nearestGauge ? determineFloodRisk(nearestGauge) : 'unknown';
      const flowDirection = nearestGauge ? determineFlowDirection(waterway.coordinates, nearestGauge) : undefined;

      return {
        id: waterway.id,
        name: waterway.name,
        type: waterway.type,
        coordinates: waterway.coordinates,
        nearestGauge,
        distance: nearestGauge ? minDistance : undefined,
        floodRisk,
        flowDirection
      };
    });
  }, [waterways, gaugeSites, enabled]);

  // Periodically refresh gaugeSites every 60 seconds (if parent passes a refresh function)
  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const interval = setInterval(() => {
      // This assumes the parent component updates gaugeSites prop from a central store or API
      // If you want to trigger a reload here, lift the fetch logic to parent and pass a refresh function
      // Example: props.onRefreshGauges && props.onRefreshGauges();
    }, 60000);
    return () => clearInterval(interval);
  }, [enabled]);

  // Get styling based on flood risk and waterway type
  const getFloodStyle = (segment: WaterwaySegment) => {
    if (!enabled) {
      // Default styling when flood awareness is disabled - make it very visible for debugging
      if (segment.type === 'lake') {
        return {
          color: '#1e40af', // Blue for lakes
          weight: 5, // Increased from 2
          opacity: 1.0, // Increased from 0.8
          fillColor: '#3b82f6',
          fillOpacity: 0.7, // Increased from 0.4
        };
      } else if (segment.type === 'reservoir') {
        return {
          color: '#1e3a8a', // Darker blue for reservoirs
          weight: 5, // Increased from 2
          opacity: 1.0, // Increased from 0.8
          fillColor: '#2563eb',
          fillOpacity: 0.7, // Increased from 0.4
        };
      } else {
        return {
          color: '#2563eb',
          weight: 6, // Increased from 4
          opacity: 1.0, // Increased from 0.8
        };
      }
    }

    const isWaterBody = segment.type === 'lake' || segment.type === 'reservoir';
    const baseStyle = {
      weight: segment.floodRisk === 'extreme' ? (isWaterBody ? 4 : 8) : 
              segment.floodRisk === 'high' ? (isWaterBody ? 3 : 6) : 
              isWaterBody ? 3 : 4, // Increased weight for lakes
      opacity: 0.9,
      ...(isWaterBody && {
        fillOpacity: segment.floodRisk === 'extreme' ? 0.8 :
                     segment.floodRisk === 'high' ? 0.7 :
                     segment.floodRisk === 'moderate' ? 0.6 : 0.5 // Increased fill opacity
      })
    };

    switch (segment.floodRisk) {
      case 'extreme':
        return {
          ...baseStyle,
          color: '#dc2626', // Bright red
          ...(isWaterBody && { fillColor: '#dc2626' })
        };
      case 'high':
        return {
          ...baseStyle,
          color: '#ea580c', // Red-orange
          ...(isWaterBody && { fillColor: '#ea580c' })
        };
      case 'moderate':
        return {
          ...baseStyle,
          color: '#d97706', // Orange
          ...(isWaterBody && { fillColor: '#d97706' })
        };
      case 'normal':
        return {
          ...baseStyle,
          color: '#16a34a', // Green
          ...(isWaterBody && { fillColor: '#16a34a' })
        };
      case 'low':
        return {
          ...baseStyle,
          color: '#0891b2', // Teal (low water)
          opacity: 0.7,
          ...(isWaterBody && { 
            fillColor: '#0891b2',
            fillOpacity: 0.2
          })
        };
      default:
        return {
          ...baseStyle,
          color: isWaterBody ? '#1e40af' : '#6b7280', // Blue for lakes, gray for rivers
          weight: isWaterBody ? 2 : 3,
          opacity: 0.8,
          ...(isWaterBody && { 
            fillColor: '#3b82f6', // Blue fill for lakes
            fillOpacity: 0.4
          })
        };
    }
  };

  // Get flow direction indicators
  const getFlowIndicator = (segment: WaterwaySegment): string => {
    if (!enabled || !segment.flowDirection) return '';
    return segment.flowDirection === 'downstream' ? ' →' : ' ←';
  };

  // Show all waterway types now
  const filteredWaterways = processedWaterways;

  return (
    <>
      {filteredWaterways.map((segment) => {
        const style = getFloodStyle(segment);
        
        // Use Polygon for lakes and reservoirs, Polyline for rivers and streams
        if (segment.type === 'lake' || segment.type === 'reservoir') {
          return (
            <Polygon
              key={segment.id}
              positions={segment.coordinates}
              pathOptions={style}
            >
              <Tooltip direction="center" offset={[0, 0]} opacity={1}>
                <div className="text-sm max-w-xs">
                  <div className="font-semibold">
                    {segment.name}
                  </div>
                  <div className="text-xs capitalize text-gray-600">
                    {segment.type}
                  </div>
                  {enabled && (
                    <>
                      <div className="text-xs mt-1">
                        <span className={`inline-block px-2 py-1 rounded text-white text-xs ${
                          segment.floodRisk === 'extreme' ? 'bg-red-600' :
                          segment.floodRisk === 'high' ? 'bg-orange-600' :
                          segment.floodRisk === 'moderate' ? 'bg-yellow-600' :
                          segment.floodRisk === 'normal' ? 'bg-green-600' :
                          segment.floodRisk === 'low' ? 'bg-blue-600' :
                          'bg-gray-600'
                        }`}>
                          {segment.floodRisk.toUpperCase()} LEVEL
                        </span>
                      </div>
                      {segment.nearestGauge && (
                        <div className="text-xs mt-1 space-y-1">
                          <div><strong>Nearest Gauge:</strong> {segment.nearestGauge.name}</div>
                          <div><strong>Distance:</strong> {segment.distance?.toFixed(1)} miles</div>
                          {segment.nearestGauge.gageHeight && (
                            <div><strong>Gage Height:</strong> {segment.nearestGauge.gageHeight.toFixed(2)} ft</div>
                          )}
                          {segment.nearestGauge.lakeElevation && (
                            <div><strong>Lake Elevation:</strong> {segment.nearestGauge.lakeElevation.toFixed(2)} ft</div>
                          )}
                          {segment.nearestGauge.reservoirStorage && (
                            <div><strong>Storage:</strong> {segment.nearestGauge.reservoirStorage.toFixed(0)} acre-ft</div>
                          )}
                          {segment.nearestGauge.streamflow && (
                            <div><strong>Flow:</strong> {segment.nearestGauge.streamflow.toFixed(0)} cfs</div>
                          )}
                          {segment.nearestGauge.floodStage && (
                            <div><strong>Flood Stage:</strong> {segment.nearestGauge.floodStage.toFixed(1)} ft</div>
                          )}
                        </div>
                      )}
                      {!segment.nearestGauge && (
                        <div className="text-xs mt-1 text-gray-500">
                          No nearby gauge data
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Tooltip>
            </Polygon>
          );
        } else {
          return (
            <Polyline
              key={segment.id}
              positions={segment.coordinates}
              pathOptions={style}
            >
              <Tooltip direction="center" offset={[0, 0]} opacity={1}>
                <div className="text-sm max-w-xs">
                  <div className="font-semibold">
                    {segment.name}{getFlowIndicator(segment)}
                  </div>
                  <div className="text-xs capitalize text-gray-600">
                    {segment.type}
                  </div>
                  {enabled && (
                    <>
                      <div className="text-xs mt-1">
                        <span className={`inline-block px-2 py-1 rounded text-white text-xs ${
                          segment.floodRisk === 'extreme' ? 'bg-red-600' :
                          segment.floodRisk === 'high' ? 'bg-orange-600' :
                          segment.floodRisk === 'moderate' ? 'bg-yellow-600' :
                          segment.floodRisk === 'normal' ? 'bg-green-600' :
                          segment.floodRisk === 'low' ? 'bg-blue-600' :
                          'bg-gray-600'
                        }`}>
                          {segment.floodRisk.toUpperCase()} RISK
                        </span>
                      </div>
                      {segment.nearestGauge && (
                        <div className="text-xs mt-1 space-y-1">
                          <div><strong>Nearest Gauge:</strong> {segment.nearestGauge.name}</div>
                          <div><strong>Distance:</strong> {segment.distance?.toFixed(1)} miles</div>
                          {segment.nearestGauge.gageHeight && (
                            <div><strong>Gage Height:</strong> {segment.nearestGauge.gageHeight.toFixed(2)} ft</div>
                          )}
                          {segment.nearestGauge.streamflow && (
                            <div><strong>Flow:</strong> {segment.nearestGauge.streamflow.toFixed(0)} cfs</div>
                          )}
                          {segment.nearestGauge.floodStage && (
                            <div><strong>Flood Stage:</strong> {segment.nearestGauge.floodStage.toFixed(1)} ft</div>
                          )}
                          {segment.flowDirection && (
                            <div><strong>Flow:</strong> {segment.flowDirection === 'downstream' ? 'Downstream →' : 'Upstream ←'}</div>
                          )}
                        </div>
                      )}
                      {!segment.nearestGauge && (
                        <div className="text-xs mt-1 text-gray-500">
                          No nearby gauge data
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Tooltip>
            </Polyline>
          );
        }
      })}
    </>
  );
};

export default FloodAwareWaterwayLayer;
