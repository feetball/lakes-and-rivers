"use client";

import React, { useEffect, useState } from "react";
import { Polyline, Tooltip } from "react-leaflet";

interface RiverSegment {
  id: string;
  coordinates: [number, number][];
}

interface RiverOverlayLayerProps {
  /** River names to overlay (e.g. ["Guadalupe River"]) */
  rivers: string[];
  color?: string;
  weight?: number;
  opacity?: number;
}

const RiverOverlayLayer: React.FC<RiverOverlayLayerProps> = ({
  rivers,
  color = "#dc2626",
  weight = 5,
  opacity = 0.85,
}) => {
  const [riverData, setRiverData] = useState<
    Map<string, RiverSegment[]>
  >(new Map());

  useEffect(() => {
    if (rivers.length === 0) return;

    let cancelled = false;

    async function fetchRivers() {
      const newData = new Map<string, RiverSegment[]>();

      for (const name of rivers) {
        try {
          const resp = await fetch(
            `/api/river-overlay?name=${encodeURIComponent(name)}`
          );
          if (!resp.ok) continue;
          const data = await resp.json();
          if (data.segments && !cancelled) {
            newData.set(name, data.segments);
          }
        } catch (err) {
          console.error(`[RiverOverlay] Failed to fetch "${name}":`, err);
        }
      }

      if (!cancelled) {
        setRiverData(newData);
      }
    }

    fetchRivers();
    return () => { cancelled = true; };
  }, [rivers]);

  return (
    <>
      {Array.from(riverData.entries()).map(([riverName, segments]) =>
        segments.map((segment) => {
          if (!segment.coordinates || segment.coordinates.length < 2) return null;
          return (
            <Polyline
              key={segment.id}
              positions={segment.coordinates}
              pathOptions={{ color, weight, opacity }}
            >
              <Tooltip>
                <span>{riverName}</span>
              </Tooltip>
            </Polyline>
          );
        })
      )}
    </>
  );
};

export default RiverOverlayLayer;
