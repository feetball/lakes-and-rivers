'use client';

import React from 'react';
import { Polyline, Tooltip } from 'react-leaflet';
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
      case 'reservoir':
        return {
          color: '#1e40af',
          weight: 3,
          opacity: 0.7,
        };
      default:
        return {
          color: '#60a5fa',
          weight: 2,
          opacity: 0.6,
        };
    }
  };

  // Filter to only show rivers
  const filteredWaterways = waterways.filter(waterway => 
    waterway.type === 'river'
  );

  return (
    <>
      {filteredWaterways.map((waterway) => (
        <Polyline
          key={waterway.id}
          positions={waterway.coordinates}
          pathOptions={getWaterwayStyle(waterway.type)}
        >
          <Tooltip direction="center" offset={[0, 0]} opacity={1}>
            <div className="text-sm">
              <div className="font-semibold">{waterway.name}</div>
              <div className="text-xs capitalize">{waterway.type}</div>
            </div>
          </Tooltip>
        </Polyline>
      ))}
    </>
  );
};

export default WaterwayLayer;
