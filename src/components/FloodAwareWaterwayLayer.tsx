'use client';

import React, { useMemo } from 'react';
import { Polyline, Tooltip } from 'react-leaflet';
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
        coordinates: w.coordinates,
        floodRisk: 'unknown' as const
      }));
    }

    return waterways.map(waterway => {
      // Find the nearest gauge station to this waterway
      let nearestGauge: WaterSite | undefined;
      let minDistance = Infinity;

      // Check distance from waterway midpoint to each gauge
      const midpoint = waterway.coordinates[Math.floor(waterway.coordinates.length / 2)];
      
      gaugeSites.forEach(gauge => {
        const distance = calculateDistance(
          midpoint[0], midpoint[1],
          gauge.latitude, gauge.longitude
        );
        
        // Only consider gauges within 10 miles of the waterway
        if (distance < 10 && distance < minDistance) {
          minDistance = distance;
          nearestGauge = gauge;
        }
      });

      const floodRisk = nearestGauge ? determineFloodRisk(nearestGauge) : 'unknown';
      const flowDirection = nearestGauge ? determineFlowDirection(waterway.coordinates, nearestGauge) : undefined;

      return {
        id: waterway.id,
        name: waterway.name,
        coordinates: waterway.coordinates,
        nearestGauge,
        distance: nearestGauge ? minDistance : undefined,
        floodRisk,
        flowDirection
      };
    });
  }, [waterways, gaugeSites, enabled]);

  // Get styling based on flood risk
  const getFloodStyle = (segment: WaterwaySegment) => {
    if (!enabled) {
      // Default blue styling when flood awareness is disabled
      return {
        color: '#2563eb',
        weight: 4,
        opacity: 0.8,
      };
    }

    const baseStyle = {
      weight: segment.floodRisk === 'extreme' ? 8 : 
              segment.floodRisk === 'high' ? 6 : 4,
      opacity: 0.9,
    };

    switch (segment.floodRisk) {
      case 'extreme':
        return {
          ...baseStyle,
          color: '#dc2626', // Bright red
          weight: 8,
        };
      case 'high':
        return {
          ...baseStyle,
          color: '#ea580c', // Red-orange
          weight: 6,
        };
      case 'moderate':
        return {
          ...baseStyle,
          color: '#d97706', // Orange
          weight: 5,
        };
      case 'normal':
        return {
          ...baseStyle,
          color: '#16a34a', // Green
          weight: 4,
        };
      case 'low':
        return {
          ...baseStyle,
          color: '#0891b2', // Teal (low water)
          weight: 3,
          opacity: 0.7,
        };
      default:
        return {
          ...baseStyle,
          color: '#6b7280', // Gray (unknown)
          weight: 3,
          opacity: 0.6,
        };
    }
  };

  // Get flow direction indicators
  const getFlowIndicator = (segment: WaterwaySegment): string => {
    if (!enabled || !segment.flowDirection) return '';
    return segment.flowDirection === 'downstream' ? ' →' : ' ←';
  };

  // Filter to only show rivers
  const filteredWaterways = processedWaterways.filter(waterway => 
    waterways.find(w => w.id === waterway.id)?.type === 'river'
  );

  return (
    <>
      {filteredWaterways.map((segment) => (
        <Polyline
          key={segment.id}
          positions={segment.coordinates}
          pathOptions={getFloodStyle(segment)}
        >
          <Tooltip direction="center" offset={[0, 0]} opacity={1}>
            <div className="text-sm max-w-xs">
              <div className="font-semibold">
                {segment.name}{getFlowIndicator(segment)}
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
      ))}
    </>
  );
};

export default FloodAwareWaterwayLayer;
