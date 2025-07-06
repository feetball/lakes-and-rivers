'use client';

import React from 'react';

interface BasicChartProps {
  data: Array<{
    time: number;
    value: number;
  }>;
  color?: string;
  height?: number;
}

const BasicChart: React.FC<BasicChartProps> = ({ 
  data, 
  color = '#3b82f6', 
  height = 96
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-xs text-gray-500 bg-gray-50 border rounded"
           style={{ height: `${height}px` }}>
        No chart data available
      </div>
    );
  }

  // Find min and max values for scaling
  const values = data.map(d => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1; // Avoid division by zero

  // Create SVG path
  const width = 280; // Fixed width for tooltip
  const padding = 10;
  const chartWidth = width - (padding * 2);
  const chartHeight = height - (padding * 2);

  const points = data.map((point, index) => {
    const x = padding + (index / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  const pathData = `M ${points.split(' ').join(' L ')}`;

  return (
    <div className="w-full bg-white border rounded" style={{ height: `${height}px` }}>
      <svg width={width} height={height} className="w-full h-full">
        {/* Grid lines */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f0f0f0" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Chart line */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Data points */}
        {data.map((point, index) => {
          const x = padding + (index / (data.length - 1)) * chartWidth;
          const y = padding + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="2"
              fill={color}
              stroke="white"
              strokeWidth="1"
            />
          );
        })}
        
        {/* Value labels */}
        <text x={padding} y={padding + 10} fontSize="10" fill="#666" className="text-xs">
          {maxValue.toFixed(1)} ft
        </text>
        <text x={padding} y={height - padding - 2} fontSize="10" fill="#666" className="text-xs">
          {minValue.toFixed(1)} ft
        </text>
        
        {/* Time labels */}
        <text x={padding} y={height - 2} fontSize="9" fill="#666" className="text-xs">
          {new Date(data[0].time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </text>
        <text x={width - padding - 30} y={height - 2} fontSize="9" fill="#666" className="text-xs">
          {new Date(data[data.length - 1].time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </text>
      </svg>
    </div>
  );
};

export default BasicChart;
