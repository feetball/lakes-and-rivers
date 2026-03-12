"use client";

import React, { useMemo, useEffect } from "react";
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
  extreme: 7,
  high: 6,
  moderate: 5,
  normal: 4,
  low: 4,
  unknown: 3,
};

const FLOOD_OPACITY: Record<FloodRisk, number> = {
  extreme: 0.95,
  high: 0.9,
  moderate: 0.85,
  normal: 0.8,
  low: 0.7,
  unknown: 0.6,
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
const DEFAULT_WEIGHT = 3;
const DEFAULT_OPACITY = 0.6;

/** Maximum distance in degrees to associate a gauge with a waterway via proximity */
const MAX_PROXIMITY_DEG = 0.15;

/**
 * Normalize a river name for fuzzy matching.
 */
function normalizeRiverName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\brv\b/g, 'river')
    .replace(/\br\b/g, 'river')
    .replace(/\bcr\b/g, 'creek')
    .replace(/\bck\b/g, 'creek')
    .replace(/\bbr\b/g, 'branch')
    .replace(/\bfk\b/g, 'fork')
    .replace(/\bbyu\b/g, 'bayou')
    .replace(/\b(n |s |e |w |nr |north |south |east |west )/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, '');
}

function extractRiverNameFromGauge(gaugeName: string): string {
  const normalized = normalizeRiverName(gaugeName);
  const parts = normalized.split(/\b(?:at|near|below|above|bl|ab|nr|ds|us)\b/);
  return parts[0].trim();
}

function riverNamesMatch(name1: string, name2: string): boolean {
  if (name1.length === 0 || name2.length === 0) return false;
  if (name1.includes(name2) || name2.includes(name1)) return true;
  const c1 = collapseSpaces(name1);
  const c2 = collapseSpaces(name2);
  if (c1.includes(c2) || c2.includes(c1)) return true;
  return false;
}

function degreeDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dlat = lat1 - lat2;
  const dlon = lon1 - lon2;
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

interface GaugeSiteWithRisk {
  site: WaterSite;
  risk: FloodRisk;
  riverName: string;
  /** The collapsed (no spaces) version of riverName, used for grouping */
  riverKey: string;
}

function findClosestCoord(coords: [number, number][], lat: number, lon: number): { idx: number; dist: number } {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = degreeDistance(coords[i][0], coords[i][1], lat, lon);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { idx: bestIdx, dist: bestDist };
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

function filterValidCoords(coordinates: [number, number][] | undefined): [number, number][] {
  if (!coordinates) return [];
  return coordinates.filter(
    (coord) =>
      Array.isArray(coord) &&
      coord.length === 2 &&
      typeof coord[0] === "number" &&
      typeof coord[1] === "number" &&
      !isNaN(coord[0]) &&
      !isNaN(coord[1]) &&
      isFinite(coord[0]) &&
      isFinite(coord[1])
  );
}

const FloodAwareWaterwayLayer: React.FC<FloodAwareWaterwayLayerProps> = ({ waterways, gaugeSites, enabled }) => {
  // Pre-compute gauge site flood risks and extracted river names
  const gaugesWithRisk = useMemo((): GaugeSiteWithRisk[] => {
    return gaugeSites.map(site => {
      const riverName = extractRiverNameFromGauge(site.name);
      return {
        site,
        risk: determineFloodRisk(site),
        riverName,
        riverKey: collapseSpaces(riverName),
      };
    });
  }, [gaugeSites]);

  // Only gauges with a known risk participate in coloring
  const activeGauges = useMemo(() => {
    return gaugesWithRisk.filter(g => g.risk !== 'unknown');
  }, [gaugesWithRisk]);

  // Diagnostic logging
  useEffect(() => {
    const riverWaterways = waterways.filter(w => w.type === 'river' || w.type === 'stream');
    const withCoords = riverWaterways.filter(w => filterValidCoords(w.coordinates).length > 1);
    console.log(`[FloodAware] waterways: ${waterways.length} total, ${riverWaterways.length} rivers/streams, ${withCoords.length} with valid coords`);
    console.log(`[FloodAware] gauges: ${gaugeSites.length} total, ${activeGauges.length} with known risk, enabled=${enabled}`);
    if (withCoords.length > 0) {
      console.log(`[FloodAware] Sample waterways:`, withCoords.slice(0, 5).map(w => ({
        name: w.name, type: w.type, coords: w.coordinates?.length
      })));
    }
    if (activeGauges.length > 0) {
      console.log(`[FloodAware] Sample active gauges:`, activeGauges.slice(0, 5).map(g => ({
        name: g.site.name, risk: g.risk, riverName: g.riverName,
        lat: g.site.latitude, lon: g.site.longitude
      })));
    }
  }, [waterways, gaugeSites, activeGauges, enabled]);

  // ─── Waterway-based segments (when Overpass data is available) ───
  const waterwaySegments = useMemo(() => {
    const segmentMap = new Map<string, WaterwaySegment[]>();

    if (!enabled || activeGauges.length === 0) return segmentMap;

    let totalMatched = 0;
    let nameMatches = 0;
    let proximityMatches = 0;

    for (const waterway of waterways) {
      if (waterway.type === 'lake' || waterway.type === 'reservoir') continue;

      const coords = filterValidCoords(waterway.coordinates);
      if (coords.length <= 1) continue;

      const wwName = normalizeRiverName(waterway.name);
      const projections: GaugeProjection[] = [];

      for (const gauge of activeGauges) {
        const { idx, dist } = findClosestCoord(coords, gauge.site.latitude, gauge.site.longitude);
        const isNameMatch = riverNamesMatch(wwName, gauge.riverName);

        if (isNameMatch) {
          projections.push({ gauge, coordIndex: idx, distance: dist });
          nameMatches++;
        } else if (dist < MAX_PROXIMITY_DEG) {
          projections.push({ gauge, coordIndex: idx, distance: dist });
          proximityMatches++;
        }
      }

      if (projections.length === 0) continue;
      totalMatched++;

      const byIndex = new Map<number, GaugeProjection>();
      for (const proj of projections) {
        const existing = byIndex.get(proj.coordIndex);
        if (!existing || proj.distance < existing.distance) {
          byIndex.set(proj.coordIndex, proj);
        }
      }

      const sortedProjections = Array.from(byIndex.values())
        .sort((a, b) => a.coordIndex - b.coordIndex);

      const segments: WaterwaySegment[] = [];
      for (let i = 0; i < sortedProjections.length; i++) {
        const proj = sortedProjections[i];
        const startIdx = i === 0 ? 0 : Math.floor((sortedProjections[i - 1].coordIndex + proj.coordIndex) / 2);
        const endIdx = i === sortedProjections.length - 1 ? coords.length - 1 : Math.floor((proj.coordIndex + sortedProjections[i + 1].coordIndex) / 2);

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

    console.log(`[FloodAware] Waterway matching: ${totalMatched} matched (${nameMatches} name, ${proximityMatches} proximity), ${segmentMap.size} segmented`);

    return segmentMap;
  }, [waterways, activeGauges, enabled]);

  // Filter out invalid coordinates
  const validWaterways = waterways.filter(
    (w) => Array.isArray(w.coordinates) && w.coordinates.length > 1
  );

  return (
    <>
      {/* Waterway geometry-based rendering (real river geometry from NHDPlus/Overpass) */}
      {validWaterways.map((waterway) => {
        const coords = filterValidCoords(waterway.coordinates);

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

        const segments = enabled ? waterwaySegments.get(waterway.id) : undefined;

        if (segments && segments.length > 0) {
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

        // No matching gauges — render with visible default styling
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
