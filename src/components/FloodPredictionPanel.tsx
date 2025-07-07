'use client';

import React, { useMemo } from 'react';
import { WaterSite } from '@/types/water';
import { Waterway } from '@/services/waterways';

interface FloodPredictionPanelProps {
  gaugeSites: WaterSite[];
  waterways: Waterway[];
  enabled: boolean;
  onClose?: () => void;
}

interface FloodPrediction {
  fromGauge: WaterSite;
  toLocation: string;
  estimatedArrival: string;
  severity: 'extreme' | 'high' | 'moderate';
  distance: number;
}

const FloodPredictionPanel: React.FC<FloodPredictionPanelProps> = ({ 
  gaugeSites, 
  waterways, 
  enabled,
  onClose
}: FloodPredictionPanelProps) => {
  // Define downstream locations for each gauge (simplified)
  function getDownstreamLocations(site: WaterSite) {
    const locations: { name: string; distance: number }[] = [];
    
    if (site.name.includes('Guadalupe')) {
      if (site.name.includes('Comfort')) {
        locations.push(
          { name: 'Spring Branch', distance: 15 },
          { name: 'Canyon Lake', distance: 35 },
          { name: 'New Braunfels', distance: 45 },
          { name: 'Seguin', distance: 60 },
          { name: 'Gonzales', distance: 85 }
        );
      } else if (site.name.includes('Spring Branch')) {
        locations.push(
          { name: 'Canyon Lake', distance: 20 },
          { name: 'New Braunfels', distance: 30 },
          { name: 'Seguin', distance: 45 }
        );
      }
    } else if (site.name.includes('Blanco')) {
      locations.push(
        { name: 'San Marcos River', distance: 8 },
        { name: 'Guadalupe River confluence', distance: 12 },
        { name: 'New Braunfels area', distance: 25 }
      );
    } else if (site.name.includes('Pedernales')) {
      locations.push(
        { name: 'Johnson City', distance: 12 },
        { name: 'Dripping Springs', distance: 35 },
        { name: 'Austin (Lake Austin)', distance: 50 }
      );
    } else if (site.name.includes('Colorado')) {
      locations.push(
        { name: 'Bastrop', distance: 25 },
        { name: 'La Grange', distance: 65 },
        { name: 'Columbus', distance: 85 }
      );
    } else if (site.name.includes('Llano')) {
      locations.push(
        { name: 'Llano City', distance: 8 },
        { name: 'Kingsland', distance: 25 },
        { name: 'Marble Falls', distance: 35 }
      );
    } else {
      // Generic downstream locations for unknown rivers
      locations.push(
        { name: 'Downstream community', distance: 10 },
        { name: 'Next major town', distance: 25 }
      );
    }
    
    return locations;
  }

  const predictions = useMemo<FloodPrediction[]>(() => {
    if (!enabled) return [];

    const floodingSites = gaugeSites.filter(site => {
      if (!site.gageHeight || !site.floodStage) return false;
      return site.gageHeight >= site.floodStage * 0.8; // 80% of flood stage or higher
    });

    const predictions: FloodPrediction[] = [];

    floodingSites.forEach(site => {
      // Estimate flow velocity based on streamflow (simplified)
      const flowVelocity = site.streamflow ? Math.min(Math.max(site.streamflow / 1000, 1), 8) : 3; // mph, capped between 1-8
      
      // Define downstream locations for major rivers
      const downstreamLocations = getDownstreamLocations(site);
      
      downstreamLocations.forEach(({ name, distance }) => {
        const travelTime = distance / flowVelocity; // hours
        const arrivalTime = new Date(Date.now() + travelTime * 60 * 60 * 1000);
        
        let severity: 'extreme' | 'high' | 'moderate' = 'moderate';
        if (site.floodStage && site.gageHeight) {
          const floodRatio = site.gageHeight / site.floodStage;
          if (floodRatio >= 1.2) severity = 'extreme';
          else if (floodRatio >= 1.0) severity = 'high';
        }
        
        predictions.push({
          fromGauge: site,
          toLocation: name,
          estimatedArrival: arrivalTime.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            month: 'short',
            day: 'numeric'
          }),
          severity,
          distance
        });
      });
    });

    return predictions.sort((a, b) => a.distance - b.distance);
  }, [gaugeSites, enabled]);

  if (!enabled || predictions.length === 0) return null;

  return (
    <div className="absolute bottom-4 right-4 z-[1001] bg-white rounded-lg shadow-lg border p-4 max-w-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <span className="text-xl mr-2">🌊</span>
          <h3 className="font-bold text-lg text-red-600">Flood Alert</h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm"
          >
            ×
          </button>
        )}
      </div>
      
      <div className="text-sm text-gray-700 mb-3">
        <strong>Estimated downstream arrival times:</strong>
      </div>
      
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {predictions.map((prediction, index) => (
          <div 
            key={index}
            className={`p-3 rounded border-l-4 ${
              prediction.severity === 'extreme' ? 'border-red-600 bg-red-50' :
              prediction.severity === 'high' ? 'border-orange-600 bg-orange-50' :
              'border-yellow-600 bg-yellow-50'
            }`}
          >
            <div className="text-sm">
              <div className="font-semibold text-gray-800 break-words whitespace-normal">
                {prediction.toLocation}
              </div>
              <div className="text-xs text-gray-600 mt-1 break-words whitespace-normal">
                From: {prediction.fromGauge.name}
              </div>
              <div className={`text-sm font-medium mt-1 ${
                prediction.severity === 'extreme' ? 'text-red-700' :
                prediction.severity === 'high' ? 'text-orange-700' :
                'text-yellow-700'
              }`}>
                ETA: {prediction.estimatedArrival}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                ~{prediction.distance} miles downstream
              </div>
              {prediction.fromGauge.gageHeight && prediction.fromGauge.floodStage && (
                <div className="text-xs text-gray-600 mt-1">
                  Current: {prediction.fromGauge.gageHeight.toFixed(1)}ft 
                  (Flood: {prediction.fromGauge.floodStage.toFixed(1)}ft)
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-3 pt-2 border-t text-xs text-gray-500">
        <div>⚠️ Estimates based on current conditions</div>
        <div>Actual timing may vary significantly</div>
      </div>
    </div>
  );
};

export default FloodPredictionPanel;
