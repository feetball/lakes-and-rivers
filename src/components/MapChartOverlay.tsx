'use client';

import React, { useState, useRef } from 'react';
import { LineChart, Line, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { WaterSite } from '@/types/water';

interface MapChartOverlayProps {
  site: WaterSite;
  position: { x: number; y: number }; // Current chart position on screen
  gaugePosition: { x: number; y: number }; // Actual gauge position on screen
  index: number;
  totalSites: number;
  globalTrendHours: number;
}

const MapChartOverlay: React.FC<MapChartOverlayProps> = ({ site, position, gaugePosition, index, totalSites, globalTrendHours }) => {
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0, chartX: 0, chartY: 0 });
  const chartRef = useRef<HTMLDivElement>(null);

  if (!site.chartData || site.chartData.length === 0) {
    return null;
  }

  // Enhanced collision-avoiding positioning algorithm
  const calculateOffset = () => {
    // Increase spread by increasing baseOffset and spiral step
    const baseOffset = 240; // More spread
    // Create more sophisticated distribution patterns
    if (totalSites <= 4) {
      const cardinalAngles = [0, Math.PI/2, Math.PI, 3*Math.PI/2];
      const angle = cardinalAngles[index % 4];
      const offsetX = Math.cos(angle) * baseOffset;
      const offsetY = Math.sin(angle) * baseOffset;
      return { offsetX, offsetY };
    } else if (totalSites <= 8) {
      const angleStep = (2 * Math.PI) / 8;
      const angle = index * angleStep;
      const radius = baseOffset + (index % 2) * 60; // More spread between rings
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;
      return { offsetX, offsetY };
    } else {
      const spiralTurns = Math.ceil(totalSites / 6);
      const angleStep = (2 * Math.PI * spiralTurns) / totalSites;
      const angle = index * angleStep;
      const radius = baseOffset + (index * 50); // More spread in spiral
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;
      return { offsetX, offsetY };
    }
  };

  const { offsetX, offsetY } = calculateOffset();
  
  // Final position including drag offset
  const finalX = position.x + offsetX + dragOffset.x;
  const finalY = position.y + offsetY + dragOffset.y;
  
  // Calculate arrow direction from chart to the EXACT gauge position
  const arrowDeltaX = gaugePosition.x - finalX;
  const arrowDeltaY = gaugePosition.y - finalY;
  const arrowAngle = Math.atan2(arrowDeltaY, arrowDeltaX) * (180 / Math.PI);
  const arrowLength = Math.sqrt(arrowDeltaX ** 2 + arrowDeltaY ** 2);
  
  // Calculate the exact gauge position relative to chart
  const gaugeRelativeX = gaugePosition.x - finalX;
  const gaugeRelativeY = gaugePosition.y - finalY;

  // Offset the arrow head so it doesn't cover the gauge dot
  const arrowHeadOffset = 12; // px
  let arrowEndX = gaugePosition.x;
  let arrowEndY = gaugePosition.y;
  if (arrowLength > arrowHeadOffset) {
    const norm = Math.sqrt((gaugePosition.x - finalX) ** 2 + (gaugePosition.y - finalY) ** 2);
    arrowEndX = finalX + ((gaugePosition.x - finalX) * (norm - arrowHeadOffset)) / norm;
    arrowEndY = finalY + ((gaugePosition.y - finalY) * (norm - arrowHeadOffset)) / norm;
  }

  // Mouse event handlers for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      chartX: dragOffset.x,
      chartY: dragOffset.y
    };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    
    setDragOffset({
      x: dragStartPos.current.chartX + deltaX,
      y: dragStartPos.current.chartY + deltaY
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add global mouse event listeners for dragging
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
      };
    }
  }, [isDragging]);

  const getChartColor = (status: string) => {
    switch (status) {
      case 'high': return '#dc2626';
      case 'normal': return '#16a34a';
      case 'low': return '#ca8a04';
      default: return '#6b7280';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'high': return 'bg-red-50 border-red-300';
      case 'normal': return 'bg-green-50 border-green-300';
      case 'low': return 'bg-yellow-50 border-yellow-300';
      default: return 'bg-gray-50 border-gray-300';
    }
  };

  // Format data for recharts, only last N hours
  const now = Date.now();
  const chartData = site.chartData
    .filter(point => {
      const t = typeof point.time === 'string' ? Date.parse(point.time) : point.time;
      return t >= now - globalTrendHours * 60 * 60 * 1000;
    })
    .map(point => ({
      value: point.value,
      timestamp: point.time
    }));

  // Calculate chart center and gauge position for SVG arrow
  const chartWidth = 320;
  const chartHeight = 180; // Approximate height of chart card
  const chartCenterX = finalX;
  const chartCenterY = finalY;
  const gaugeX = gaugePosition.x;
  const gaugeY = gaugePosition.y;

  return (
    <>
      {/* SVG Arrow from chart to gauge */}
      <svg
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 1000,
        }}
      >
        <line
          x1={chartCenterX}
          y1={chartCenterY}
          x2={arrowEndX}
          y2={arrowEndY}
          stroke="#374151"
          strokeWidth={3}
          markerEnd="url(#arrowhead)"
        />
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="5"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon points="0,0 10,5 0,10 2,5" fill="#374151" />
          </marker>
        </defs>
      </svg>

      {/* Chart overlay */}
      <div
        ref={chartRef}
        className="fixed pointer-events-none z-[1001]"
        style={{
          left: finalX,
          top: finalY,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div
          className={`bg-white rounded-lg shadow-lg border-2 p-2 pointer-events-auto relative z-30 ${getStatusBgColor(site.waterLevelStatus || 'unknown')} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} select-none`}
          style={{
            width: '320px',
            fontSize: '14px',
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Site Info Header */}
          <div className="font-semibold text-gray-800 mb-1 truncate leading-tight">
            {site.name.length > 20 ? site.name.substring(0, 20) + '...' : site.name}
          </div>
          {/* Current Level */}
          <div className="text-gray-600 mb-2 flex items-center justify-between">
            <span>{site.waterLevel ? `${site.waterLevel.toFixed(1)} ft` : 'No data'}</span>
            <span className={`px-1 py-0.5 rounded text-white text-xs ${
              site.waterLevelStatus === 'high' ? 'bg-red-600' :
              site.waterLevelStatus === 'normal' ? 'bg-green-600' :
              site.waterLevelStatus === 'low' ? 'bg-yellow-600' : 'bg-gray-600'
            }`}>
              {site.waterLevelStatus?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          {/* Chart */}
          <div className="h-20 w-full mb-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={getChartColor(site.waterLevelStatus || 'unknown')}
                  strokeWidth={1.5}
                  dot={false}
                  name="Water Level"
                />
                {site.floodStage && (
                  <ReferenceLine y={site.floodStage} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'Flood', position: 'right', fill: '#ef4444', fontSize: 10 }} />
                )}
                {site.recordStage && (
                  <ReferenceLine y={site.recordStage} stroke="#6366f1" strokeDasharray="2 2" label={{ value: 'Record', position: 'right', fill: '#6366f1', fontSize: 10 }} />
                )}
                <Legend verticalAlign="top" height={20} iconType="plainline"/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Time indicator */}
          <div className="text-gray-500 text-center text-xs">{globalTrendHours}hr trend</div>
        </div>
      </div>
    </>
  );
};

export default MapChartOverlay;
