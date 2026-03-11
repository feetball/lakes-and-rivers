import L from 'leaflet';
import { WaterSite } from '@/types/water';

// Unified flood risk assessment function (matches FloodAwareWaterwayLayer)
export const determineFloodRisk = (site: WaterSite): 'extreme' | 'high' | 'moderate' | 'normal' | 'low' | 'unknown' => {
  if (!site.gageHeight) return 'unknown';

  // Enhanced flood risk assessment using flood stage data
  const { gageHeight, floodStage, streamflow } = site;

  // If we have flood stage data, use it for more accurate assessment (PRIORITY)
  if (floodStage && gageHeight) {
    const floodRatio = gageHeight / floodStage;
    if (floodRatio >= 1.2) return 'extreme';  // 20% above flood stage
    if (floodRatio >= 1.0) return 'high';     // At or above flood stage
    if (floodRatio >= 0.8) return 'moderate'; // Approaching flood stage
    if (floodRatio >= 0.5) return 'normal';   // Normal levels
    return 'low';                             // Below normal
  }

  // Fallback to basic status with streamflow consideration if no flood stage
  const waterLevelStatus = site.waterLevelStatus;
  if (waterLevelStatus === 'high') {
    // Consider streamflow for more nuanced assessment
    if (streamflow && streamflow > 1000) return 'extreme';
    if (streamflow && streamflow > 500) return 'high';
    return 'moderate';
  }

  if (waterLevelStatus === 'normal') return 'normal';
  if (waterLevelStatus === 'low') return 'low';
  return 'unknown';
};

export const createCustomIcon = (site: WaterSite) => {
  const floodRisk = determineFloodRisk(site);

  const colors = {
    extreme: '#dc2626', // Bright red
    high: '#ea580c',    // Red-orange
    moderate: '#d97706', // Orange
    normal: '#16a34a',   // Green
    low: '#0891b2',      // Teal (low water)
    unknown: '#6b7280'   // Gray
  };

  const color = colors[floodRisk];

  // Use different icon shapes for different site types
  const isLakeOrReservoir = site.siteType === 'lake' || site.siteType === 'reservoir';
  const iconShape = isLakeOrReservoir ? 'border-radius: 20%;' : 'border-radius: 50%;';

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 20px; height: 20px; ${iconShape} border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); cursor: pointer;"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

export const formatLastUpdated = (dateString?: string) => {
  if (!dateString) return 'Unknown';
  try {
    const date = new Date(dateString);
    return date.toLocaleString();
  } catch {
    return 'Unknown';
  }
};

export const formatWaterLevel = (level?: number, unit: string = 'ft') => {
  if (level === undefined) return 'No data';
  return `${level.toFixed(2)} ${unit}`;
};

export const getChartColor = (site: WaterSite) => {
  const floodRisk = determineFloodRisk(site);
  const colors = {
    extreme: '#dc2626', // Bright red
    high: '#ea580c',    // Red-orange
    moderate: '#d97706', // Orange
    normal: '#16a34a',   // Green
    low: '#0891b2',      // Teal (low water)
    unknown: '#6b7280'   // Gray
  };
  return colors[floodRisk];
};

export const getFloodRiskDisplay = (site: WaterSite) => {
  const floodRisk = determineFloodRisk(site);
  const labels = {
    extreme: 'EXTREME RISK',
    high: 'HIGH RISK',
    moderate: 'MODERATE RISK',
    normal: 'NORMAL',
    low: 'LOW WATER',
    unknown: 'UNKNOWN'
  };
  const bgColors = {
    extreme: 'bg-red-600',
    high: 'bg-orange-600',
    moderate: 'bg-yellow-600',
    normal: 'bg-green-600',
    low: 'bg-blue-600',
    unknown: 'bg-gray-600'
  };
  return {
    label: labels[floodRisk],
    bgColor: bgColors[floodRisk],
    risk: floodRisk
  };
};
