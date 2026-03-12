"use client";

import React, { useEffect, useMemo, useState } from "react";
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

  // Stabilize the dependency so the effect only re-runs when the actual
  // river names change, not on every render due to a new array reference.
  const riversKey = useMemo(() => rivers.slice().sort().join('\0'), [rivers]);

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
          if (!resp.ok) {
            console.warn(`[RiverOverlay] Non-OK response for "${name}": ${resp.status}`);
            continue;
          }
          const data = await resp.json();
          if (cancelled) return;

          if (data.error) {
            console.warn(`[RiverOverlay] API error for "${name}": ${data.error}`);
          }

          if (data.segments && data.segments.length > 0) {
            console.log(`[RiverOverlay] Loaded ${data.segments.length} segments for "${name}"`);
            newData.set(name, data.segments);
          } else {
            console.warn(`[RiverOverlay] No segments returned for "${name}"`);
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
  }, [riversKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
