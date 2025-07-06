'use client';

import React from 'react';
import { Polyline, Polygon, Tooltip } from 'react-leaflet';
import { Waterway } from '@/services/waterways';

interface WaterwayLayerProps {
  waterways: Waterway[];
}

const WaterwayLayer: React.FC<WaterwayLayerProps> = ({ waterways }) => {
  const getWaterwayStyle = (type: string) => {
    switch (type) {
      case 'river':
        return {
          color: '#2563eb',
          weight: 4,
          opacity: 0.8,
        };
      case 'lake':
        return {
          color: '#1e40af',
          weight: 3, // Increased weight
          opacity: 0.8, // Increased opacity
          fillColor: '#3b82f6',
          fillOpacity: 0.5, // Increased fill opacity
        };
      case 'reservoir':
        return {
          color: '#1e3a8a',
          weight: 3, // Increased weight
          opacity: 0.9, // Increased opacity
          fillColor: '#2563eb',
          fillOpacity: 0.6, // Increased fill opacity
        };
      case 'stream':
        return {
          color: '#60a5fa',
          weight: 2,
          opacity: 0.6,
        };
      default:
        return {
          color: '#60a5fa',
          weight: 2,
          opacity: 0.6,
        };
    }
  };

  // Show all waterway types now
  const filteredWaterways = waterways;

  return (
    <>
      {filteredWaterways.map((waterway) => {
        const style = getWaterwayStyle(waterway.type);
        
        // Use Polygon for lakes and reservoirs, Polyline for rivers and streams
        if (waterway.type === 'lake' || waterway.type === 'reservoir') {
          return (
            <Polygon
              key={waterway.id}
              positions={waterway.coordinates}
              pathOptions={style}
            >
              <Tooltip direction="center" offset={[0, 0]} opacity={1}>
                <div className="text-sm">
                  <div className="font-semibold">{waterway.name}</div>
                  <div className="text-xs capitalize">{waterway.type}</div>
                </div>
              </Tooltip>
            </Polygon>
          );
        } else {
          return (
            <Polyline
              key={waterway.id}
              positions={waterway.coordinates}
              pathOptions={style}
            >
              <Tooltip direction="center" offset={[0, 0]} opacity={1}>
                <div className="text-sm">
                  <div className="font-semibold">{waterway.name}</div>
                  <div className="text-xs capitalize">{waterway.type}</div>
                </div>
              </Tooltip>
            </Polyline>
          );
        }
      })}
    </>
  );
};

export default WaterwayLayer;
