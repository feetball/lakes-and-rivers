'use client';

import React from 'react';
import { Polyline, Polygon, Tooltip } from 'react-leaflet';
import { Waterway } from '@/services/waterways';

interface WaterwayLayerProps {
  waterways: Waterway[];
}

const WaterwayLayer: React.FC<WaterwayLayerProps> = ({ waterways }) => {
  // Debug: log all input waterways and their coordinates
  if (Array.isArray(waterways)) {
    console.log(`[WaterwayLayer DEBUG] Total waterways received: ${waterways.length}`);
    const riverCount = waterways.filter(w => w.type === 'river').length;
    const streamCount = waterways.filter(w => w.type === 'stream').length;
    const lakeCount = waterways.filter(w => w.type === 'lake' || w.type === 'reservoir').length;
    console.log(`[WaterwayLayer DEBUG] Rivers: ${riverCount}, Streams: ${streamCount}, Lakes/Reservoirs: ${lakeCount}`);
    
    // Log first few rivers specifically
    const rivers = waterways.filter(w => w.type === 'river').slice(0, 5);
    rivers.forEach((r, i) => {
      console.log(`[WaterwayLayer DEBUG] River ${i}: ${r.name}, coords: ${r.coordinates?.length || 0}`);
    });
    
    waterways.forEach((w, i) => {
      // Log id, name, type, and coordinates length/type
      const coordsType = Array.isArray(w?.coordinates) ? 'array' : typeof w?.coordinates;
      const coordsLen = Array.isArray(w?.coordinates) ? w.coordinates.length : 'N/A';
      // Only log first 2 coordinates for brevity
      const coordsSample = Array.isArray(w?.coordinates) ? JSON.stringify(w.coordinates.slice(0,2)) : String(w?.coordinates);
      // Log the full object if coordinates are missing or not an array
      if (!Array.isArray(w?.coordinates) || w.coordinates.length === 0) {
        console.warn(`[WaterwayLayer DEBUG] Waterway ${i}: id=${w?.id}, name=${w?.name}, type=${w?.type}, coordinatesType=${coordsType}, coordinatesLen=${coordsLen}, sample=${coordsSample}`);
        console.warn('[WaterwayLayer DEBUG] Full object:', w);
      }
    });
  }
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

        // Defensive: filter coordinates for Polyline/Polygon
        const coords = Array.isArray(waterway.coordinates)
          ? waterway.coordinates.filter(
              (coord) =>
                Array.isArray(coord) &&
                coord.length === 2 &&
                typeof coord[0] === 'number' && !isNaN(coord[0]) && isFinite(coord[0]) &&
                typeof coord[1] === 'number' && !isNaN(coord[1]) && isFinite(coord[1])
            )
          : [];

        // Debug: log filtering results for rivers
        if (waterway.type === 'river') {
          console.log(`[WaterwayLayer DEBUG] River ${waterway.name}: original coords ${waterway.coordinates?.length || 0}, filtered coords ${coords.length}`);
          if (coords.length === 0 && waterway.coordinates?.length > 0) {
            console.warn(`[WaterwayLayer DEBUG] River ${waterway.name} filtered out all coordinates!`, waterway.coordinates.slice(0, 3));
          }
        }

        // Use Polygon for lakes and reservoirs, Polyline for rivers and streams
        if ((waterway.type === 'lake' || waterway.type === 'reservoir') && coords.length > 2) {
          return (
            <Polygon
              key={waterway.id}
              positions={coords}
              pathOptions={style}
            >
              <Tooltip direction="center" offset={[0, 0]} opacity={1}>
                <div className="text-sm" style={{width: '240px', fontSize: '13px', maxWidth: '90vw'}}>
                  <div className="font-semibold text-base md:text-lg break-words whitespace-normal">{waterway.name}</div>
                  <div className="text-xs md:text-sm capitalize break-words whitespace-normal">{waterway.type}</div>
                </div>
              </Tooltip>
            </Polygon>
          );
        } else if (coords.length > 1) {
          console.log(`[WaterwayLayer DEBUG] Rendering ${waterway.type}: ${waterway.name} with ${coords.length} coordinates`);
          return (
            <Polyline
              key={waterway.id}
              positions={coords}
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
        } else {
          // Not enough valid coordinates to render
          if (waterway.type === 'river') {
            console.warn(`[WaterwayLayer DEBUG] River ${waterway.name} NOT RENDERED - insufficient coordinates: ${coords.length}`);
          }
          return null;
        }
      })}
    </>
  );
};

export default WaterwayLayer;
