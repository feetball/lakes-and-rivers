"use client";

import React, { useMemo } from "react";
import { Polyline, Polygon, Tooltip } from "react-leaflet";
import { Waterway } from "@/services/waterways";
import { WaterSite } from "@/types/water";
import { determineFloodRisk } from "@/lib/floodRisk";

interface FloodAwareWaterwayLayerProps {
  waterways: Waterway[];
  gaugeSites: WaterSite[];
  enabled: boolean;
}

type FloodRisk = 'extreme' | 'high' | 'moderate' | 'normal' | 'low' | 'unknown';

const FLOOD_COLORS: Record<FloodRisk, string> = {
  extreme: '#dc2626',
  high: '#ea580c',
  moderate: '#d97706',
  normal: '#16a34a',
  low: '#0891b2',
  unknown: '#3b82f6',
};

const FLOOD_WEIGHTS: Record<FloodRisk, number> = {
  extreme: 5,
  high: 4,
  moderate: 3,
  normal: 2,
  low: 2,
  unknown: 2,
};

const FLOOD_OPACITY: Record<FloodRisk, number> = {
  extreme: 0.9,
  high: 0.85,
  moderate: 0.8,
  normal: 0.7,
  low: 0.6,
  unknown: 0.5,
};

const FLOOD_LABELS: Record<FloodRisk, string> = {
  extreme: 'EXTREME FLOOD RISK',
  high: 'HIGH FLOOD RISK',
  moderate: 'MODERATE FLOOD RISK',
  normal: 'Normal',
  low: 'Low Water',
  unknown: '',
};

const DEFAULT_COLOR = '#3b82f6';
const DEFAULT_WEIGHT = 2;
const DEFAULT_OPACITY = 0.5;

/** Maximum distance in degrees (~0.2° ≈ 14 miles) to associate a gauge with a waterway */
const MAX_PROXIMITY_DEG = 0.2;

/**
 * Normalize a river name for fuzzy matching.
 * "Guadalupe Rv" → "guadalupe river", "Brazos R" → "brazos river", etc.
 */
function normalizeRiverName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\brv\b/g, 'river')
    .replace(/\bcr\b/g, 'creek')
    .replace(/\bck\b/g, 'creek')
    .replace(/\bbr\b/g, 'branch')
    .replace(/\bfk\b/g, 'fork')
    .replace(/\b(n |s |e |w |nr |north |south |east |west )/g, '')
    .trim();
}

/**
 * Extract the waterway name portion from a USGS gauge site name.
 * Format is typically "Guadalupe Rv at Cuero, TX" or "Colorado Rv nr Austin, TX"
 */
function extractRiverNameFromGauge(gaugeName: string): string {
  const normalized = normalizeRiverName(gaugeName);
  // Split at common location prepositions
  const parts = normalized.split(/\b(?:at|near|below|above|bl|ab|nr|ds|us)\b/);
  return parts[0].trim();
}

/**
 * Simple Euclidean distance in degrees (sufficient for Texas-scale proximity).
 */
function degreeDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dlat = lat1 - lat2;
  const dlon = lon1 - lon2;
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

interface GaugeSiteWithRisk {
  site: WaterSite;
  risk: FloodRisk;
  riverName: string;
}

/**
 * Find the closest coordinate index on a polyline to a given point.
 */
function findClosestCoordIndex(coords: [number, number][], lat: number, lon: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = degreeDistance(coords[i][0], coords[i][1], lat, lon);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

interface GaugeProjection {
  gauge: GaugeSiteWithRisk;
  coordIndex: number;
  distance: number;
}

interface WaterwaySegment {
  coords: [number, number][];
  risk: FloodRisk;
  gaugeName: string | null;
}

const FloodAwareWaterwayLayer: React.FC<FloodAwareWaterwayLayerProps> = ({ waterways, gaugeSites, enabled }) => {
  // Pre-compute gauge site flood risks and extracted river names
  const gaugesWithRisk = useMemo((): GaugeSiteWithRisk[] => {
    return gaugeSites.map(site => ({
      site,
      risk: determineFloodRisk(site),
      riverName: extractRiverNameFromGauge(site.name),
    }));
  }, [gaugeSites]);

  // For each waterway, find ALL matching gauges and split into colored segments
  const waterwaySegments = useMemo(() => {
    const segmentMap = new Map<string, WaterwaySegment[]>();

    if (!enabled) return segmentMap;

    for (const waterway of waterways) {
      if (waterway.type === 'lake' || waterway.type === 'reservoir') continue;

      const coords = waterway.coordinates?.filter(
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
      if (!coords || coords.length <= 1) continue;

      const wwName = normalizeRiverName(waterway.name);

      // Collect all gauges that match this waterway (by name or proximity)
      const projections: GaugeProjection[] = [];

      for (const gauge of gaugesWithRisk) {
        if (gauge.risk === 'unknown') continue;

        // Check name match
        const gaugeName = gauge.riverName;
        const isNameMatch = wwName.length > 0 && gaugeName.length > 0 && (
          wwName.includes(gaugeName) || gaugeName.includes(wwName)
        );

        if (isNameMatch) {
          const idx = findClosestCoordIndex(coords, gauge.site.latitude, gauge.site.longitude);
          const dist = degreeDistance(coords[idx][0], coords[idx][1], gauge.site.latitude, gauge.site.longitude);
          projections.push({ gauge, coordIndex: idx, distance: dist });
        } else {
          // Proximity check — find closest point on polyline
          const idx = findClosestCoordIndex(coords, gauge.site.latitude, gauge.site.longitude);
          const dist = degreeDistance(coords[idx][0], coords[idx][1], gauge.site.latitude, gauge.site.longitude);
          if (dist < MAX_PROXIMITY_DEG) {
            projections.push({ gauge, coordIndex: idx, distance: dist });
          }
        }
      }

      if (projections.length === 0) continue;

      // Deduplicate: if multiple gauges project to the same coord index, keep the closest one
      const byIndex = new Map<number, GaugeProjection>();
      for (const proj of projections) {
        const existing = byIndex.get(proj.coordIndex);
        if (!existing || proj.distance < existing.distance) {
          byIndex.set(proj.coordIndex, proj);
        }
      }

      // Sort projections by their position along the polyline
      const sortedProjections = Array.from(byIndex.values())
        .sort((a, b) => a.coordIndex - b.coordIndex);

      // Split the polyline into segments between gauges
      // Each gauge "owns" the river from the midpoint-to-prev-gauge to midpoint-to-next-gauge
      const segments: WaterwaySegment[] = [];

      for (let i = 0; i < sortedProjections.length; i++) {
        const proj = sortedProjections[i];

        // Determine the start of this gauge's segment
        let startIdx: number;
        if (i === 0) {
          startIdx = 0;
        } else {
          // Midpoint between previous gauge and this gauge
          startIdx = Math.floor((sortedProjections[i - 1].coordIndex + proj.coordIndex) / 2);
        }

        // Determine the end of this gauge's segment
        let endIdx: number;
        if (i === sortedProjections.length - 1) {
          endIdx = coords.length - 1;
        } else {
          // Midpoint between this gauge and next gauge
          endIdx = Math.floor((proj.coordIndex + sortedProjections[i + 1].coordIndex) / 2);
        }

        // Extract the segment coordinates (inclusive of both endpoints)
        if (endIdx > startIdx) {
          segments.push({
            coords: coords.slice(startIdx, endIdx + 1),
            risk: proj.gauge.risk,
            gaugeName: proj.gauge.site.name,
          });
        }
      }

      if (segments.length > 0) {
        segmentMap.set(waterway.id, segments);
      }
    }

    return segmentMap;
  }, [waterways, gaugesWithRisk, enabled]);

  // Filter out invalid coordinates
  const validWaterways = waterways.filter(
    (w) => Array.isArray(w.coordinates) && w.coordinates.length > 1
  );

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

        if (waterway.type === "lake" || waterway.type === "reservoir") {
          if (coords.length <= 2) return null;
          return (
            <Polygon
              key={waterway.id}
              positions={coords}
              pathOptions={{ color: "#1e40af", fillOpacity: 0.3, weight: 2 }}
            >
              <Tooltip>
                <span>{waterway.name || waterway.type}</span>
              </Tooltip>
            </Polygon>
          );
        }

        if (coords.length <= 1) return null;

        // Check if we have per-segment flood coloring for this waterway
        const segments = enabled ? waterwaySegments.get(waterway.id) : undefined;

        if (segments && segments.length > 0) {
          // Render each segment with its own flood color
          return (
            <React.Fragment key={waterway.id}>
              {segments.map((segment, idx) => {
                if (segment.coords.length <= 1) return null;
                const color = FLOOD_COLORS[segment.risk];
                const weight = FLOOD_WEIGHTS[segment.risk];
                const opacity = FLOOD_OPACITY[segment.risk];
                const label = FLOOD_LABELS[segment.risk];
                const tooltipText = label
                  ? `${waterway.name} — ${label}${segment.gaugeName ? ` (${segment.gaugeName})` : ''}`
                  : waterway.name || waterway.type;

                return (
                  <Polyline
                    key={`${waterway.id}-seg-${idx}`}
                    positions={segment.coords}
                    pathOptions={{ color, weight, opacity }}
                  >
                    <Tooltip>
                      <span>{tooltipText}</span>
                    </Tooltip>
                  </Polyline>
                );
              })}
            </React.Fragment>
          );
        }

        // No matching gauges — render with default styling
        return (
          <Polyline
            key={waterway.id}
            positions={coords}
            pathOptions={{ color: DEFAULT_COLOR, weight: DEFAULT_WEIGHT, opacity: DEFAULT_OPACITY }}
          >
            <Tooltip>
              <span>{waterway.name || waterway.type}</span>
            </Tooltip>
          </Polyline>
        );
      })}
    </>
  );
};

export default FloodAwareWaterwayLayer;
