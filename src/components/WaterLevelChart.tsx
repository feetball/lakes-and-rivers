'use client';

import React, { useEffect, useState } from 'react';

interface WaterLevelChartProps {
  data: Array<{
    time: number;
    value: number;
  }>;
  color?: string;
  showTooltip?: boolean;
  height?: number;
  forTooltip?: boolean;
}

const WaterLevelChart: React.FC<WaterLevelChartProps> = ({ 
  data, 
  color = '#3b82f6', 
  showTooltip = false,
  height = 80,
  forTooltip = false
}: WaterLevelChartProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full flex items-center justify-center text-xs text-gray-500"
           style={{ height: `${height}px` }}>
        Loading...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-xs text-gray-500"
           style={{ height: `${height}px` }}>
        No data
      </div>
    );
  }

  // Simple SVG chart that always works
  const values = data.map((d: { time: number; value: number }) => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  
  const points = data.map((point: { time: number; value: number }, index: number) => {
    const x = (index / (data.length - 1)) * 100;
    const y = ((maxValue - point.value) / range) * 70 + 15; // More padding
    return `${x},${y}`;
  }).join(' ');

  const currentValue = data[data.length - 1]?.value;
  const previousValue = data[data.length - 2]?.value;
  const trend = currentValue > previousValue ? '↗️' : currentValue < previousValue ? '↘️' : '→';

  return (
    <div className="w-full relative" style={{ height: `${height}px` }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0">
        {/* Background grid */}
        {!forTooltip && (
          <>
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#f0f0f0" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />
          </>
        )}
        
        {/* Chart line */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth={forTooltip ? "2" : "2.5"}
          points={points}
          vectorEffect="non-scaling-stroke"
          className="drop-shadow-sm"
        />
        
        {/* Data points */}
        {!forTooltip && data.map((point: { time: number; value: number }, index: number) => {
          const x = (index / (data.length - 1)) * 100;
          const y = ((maxValue - point.value) / range) * 70 + 15;
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="1.5"
              fill={color}
              stroke="white"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
              className="drop-shadow-sm"
            />
          );
        })}
      </svg>
      
      {/* Value display */}
      {forTooltip && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium shadow-sm border">
            {currentValue?.toFixed(2)} ft {trend}
          </div>
        </div>
      )}
    </div>
  );
};

export default WaterLevelChart;
