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

const FloodAwareWaterwayLayer: React.FC<FloodAwareWaterwayLayerProps> = ({ waterways, gaugeSites, enabled }) => {
  // Pre-compute gauge site flood risks and extracted river names
  const gaugesWithRisk = useMemo((): GaugeSiteWithRisk[] => {
    return gaugeSites.map(site => ({
      site,
      risk: determineFloodRisk(site),
      riverName: extractRiverNameFromGauge(site.name),
    }));
  }, [gaugeSites]);

  // Build a map from normalized waterway name → best (worst) flood risk from matching gauges
  const waterwayRiskMap = useMemo(() => {
    const riskMap = new Map<string, { risk: FloodRisk; gaugeName: string }>();

    if (!enabled) return riskMap;

    // Risk severity for comparison (higher = worse)
    const riskSeverity: Record<FloodRisk, number> = {
      extreme: 5, high: 4, moderate: 3, normal: 2, low: 1, unknown: 0,
    };

    for (const gauge of gaugesWithRisk) {
      if (gauge.risk === 'unknown') continue;

      // Try to associate this gauge with waterways by name match
      for (const waterway of waterways) {
        if (waterway.type === 'lake' || waterway.type === 'reservoir') continue;

        const wwName = normalizeRiverName(waterway.name);
        const gaugeName = gauge.riverName;

        // Check if the gauge's river name matches the waterway name
        const isNameMatch = wwName.length > 0 && gaugeName.length > 0 && (
          wwName.includes(gaugeName) || gaugeName.includes(wwName)
        );

        if (isNameMatch) {
          const existing = riskMap.get(waterway.id);
          if (!existing || riskSeverity[gauge.risk] > riskSeverity[existing.risk]) {
            riskMap.set(waterway.id, { risk: gauge.risk, gaugeName: gauge.site.name });
          }
        }
      }
    }

    return riskMap;
  }, [waterways, gaugesWithRisk, enabled]);

  // For waterways without a name match, fall back to geographic proximity
  const getWaterwayRisk = useMemo(() => {
    // Pre-compute midpoints for waterways that weren't matched by name
    return (waterway: Waterway): { risk: FloodRisk; gaugeName: string | null } => {
      // Check name-matched result first
      const nameMatch = waterwayRiskMap.get(waterway.id);
      if (nameMatch) return { risk: nameMatch.risk, gaugeName: nameMatch.gaugeName };

      if (!enabled || waterway.type === 'lake' || waterway.type === 'reservoir') {
        return { risk: 'unknown', gaugeName: null };
      }

      // Fall back to proximity: find nearest gauge to waterway midpoint
      const coords = waterway.coordinates;
      if (!coords || coords.length === 0) return { risk: 'unknown', gaugeName: null };

      const midIdx = Math.floor(coords.length / 2);
      const midLat = coords[midIdx][0];
      const midLon = coords[midIdx][1];

      const riskSeverity: Record<FloodRisk, number> = {
        extreme: 5, high: 4, moderate: 3, normal: 2, low: 1, unknown: 0,
      };

      let bestRisk: FloodRisk = 'unknown';
      let bestDist = MAX_PROXIMITY_DEG;
      let bestGaugeName: string | null = null;

      for (const gauge of gaugesWithRisk) {
        if (gauge.risk === 'unknown') continue;
        const dist = degreeDistance(midLat, midLon, gauge.site.latitude, gauge.site.longitude);
        if (dist < bestDist) {
          bestDist = dist;
          bestRisk = gauge.risk;
          bestGaugeName = gauge.site.name;
        } else if (dist < MAX_PROXIMITY_DEG && riskSeverity[gauge.risk] > riskSeverity[bestRisk]) {
          // Within range and higher severity — use this one
          bestRisk = gauge.risk;
          bestGaugeName = gauge.site.name;
        }
      }

      return { risk: bestRisk, gaugeName: bestGaugeName };
    };
  }, [waterwayRiskMap, gaugesWithRisk, enabled]);

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

        const { risk, gaugeName } = getWaterwayRisk(waterway);
        const isFloodColored = enabled && risk !== 'unknown';

        const color = isFloodColored ? FLOOD_COLORS[risk] : DEFAULT_COLOR;
        const weight = isFloodColored ? FLOOD_WEIGHTS[risk] : DEFAULT_WEIGHT;
        const opacity = isFloodColored ? FLOOD_OPACITY[risk] : DEFAULT_OPACITY;

        const tooltipText = isFloodColored && FLOOD_LABELS[risk]
          ? `${waterway.name} — ${FLOOD_LABELS[risk]}${gaugeName ? ` (${gaugeName})` : ''}`
          : waterway.name || waterway.type;

        return (
          <Polyline
            key={waterway.id}
            positions={coords}
            pathOptions={{ color, weight, opacity }}
          >
            <Tooltip>
              <span>{tooltipText}</span>
            </Tooltip>
          </Polyline>
        );
      })}
    </>
  );
};

export default FloodAwareWaterwayLayer;
