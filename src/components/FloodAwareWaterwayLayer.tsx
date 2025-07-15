
"use client";

import React from "react";
import { Polyline, Polygon, Tooltip } from "react-leaflet";
import { Waterway } from "@/services/waterways";
import { WaterSite } from "@/types/water";

interface FloodAwareWaterwayLayerProps {
  waterways: Waterway[];
  gaugeSites: WaterSite[];
  enabled: boolean;
}

const FloodAwareWaterwayLayer: React.FC<FloodAwareWaterwayLayerProps> = ({ waterways, gaugeSites, enabled }) => {
  console.log(`[FloodAwareWaterwayLayer DEBUG] Received ${waterways.length} waterways, enabled: ${enabled}`);
  
  if (waterways.length > 0) {
    const riverCount = waterways.filter(w => w.type === 'river').length;
    const streamCount = waterways.filter(w => w.type === 'stream').length;
    const lakeCount = waterways.filter(w => w.type === 'lake' || w.type === 'reservoir').length;
    console.log(`[FloodAwareWaterwayLayer DEBUG] Rivers: ${riverCount}, Streams: ${streamCount}, Lakes/Reservoirs: ${lakeCount}`);
    
    // Log first few waterways with detailed coordinate info
    const firstFew = waterways.slice(0, 3);
    firstFew.forEach((w, i) => {
      console.log(`[FloodAwareWaterwayLayer DEBUG] Waterway ${i}: ${w.name} (${w.type})`, {
        hasCoordinates: !!w.coordinates,
        coordinatesType: typeof w.coordinates,
        coordinatesLength: w.coordinates?.length || 0,
        isArray: Array.isArray(w.coordinates),
        firstCoord: w.coordinates?.[0],
        waterwayKeys: Object.keys(w),
        fullWaterway: w
      });
    });
  }
  
  // Defensive: filter out invalid coordinates
  const validWaterways = waterways.filter(
    (w) => Array.isArray(w.coordinates) && w.coordinates.length > 1
  );
  console.log(`[FloodAwareWaterwayLayer DEBUG] After filtering: ${validWaterways.length} valid waterways`);
  
  return (
    <>
      {validWaterways.map((waterway) => {
        const coords = waterway.coordinates.filter(
          (coord: [number, number]) =>
            Array.isArray(coord) &&
            coord.length === 2 &&
            typeof coord[0] === "number" &&
            typeof coord[1] === "number" &&
            !isNaN(coord[0]) &&
            !isNaN(coord[1]) &&
            isFinite(coord[0]) &&
            isFinite(coord[1])
        );
        
        // Debug logging for rivers specifically
        if (waterway.type === 'river') {
          console.log(`[FloodAwareWaterwayLayer DEBUG] Processing river ${waterway.name}: ${waterway.coordinates.length} -> ${coords.length} coords`);
        }
        
        if ((waterway.type === "lake" || waterway.type === "reservoir") && coords.length > 2) {
          console.log(`[FloodAwareWaterwayLayer DEBUG] Rendering ${waterway.type}: ${waterway.name}`);
          return (
            <Polygon key={waterway.id} positions={coords} pathOptions={{ color: "#1e40af" }}>
              <Tooltip>
                <span>{waterway.name}</span>
              </Tooltip>
            </Polygon>
          );
        } else if (coords.length > 1) {
          console.log(`[FloodAwareWaterwayLayer DEBUG] Rendering ${waterway.type}: ${waterway.name} with ${coords.length} coords`);
          return (
            <Polyline key={waterway.id} positions={coords} pathOptions={{ color: "#16a34a" }}>
              <Tooltip>
                <span>{waterway.name}</span>
              </Tooltip>
            </Polyline>
          );
        } else {
          if (waterway.type === 'river') {
            console.warn(`[FloodAwareWaterwayLayer DEBUG] River ${waterway.name} NOT RENDERED - insufficient coordinates: ${coords.length}`);
          }
          return null;
        }
      })}
    </>
  );
};



export default FloodAwareWaterwayLayer;
