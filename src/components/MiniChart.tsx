'use client';

import React from 'react';

interface MiniChartProps {
  data: Array<{
    time: number;
    value: number;
  }>;
  color?: string;
  height?: number;
}

const MiniChart: React.FC<MiniChartProps> = ({ 
  data, 
  color = '#3b82f6', 
  height = 96
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-xs text-gray-500 bg-gray-50 border rounded p-2"
           style={{ height: `${height}px` }}>
        No chart data available
      </div>
    );
  }

  // Calculate trend
  const values = data.map(d => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const trend = lastValue > firstValue ? '↗️' : lastValue < firstValue ? '↘️' : '→';
  const trendColor = lastValue > firstValue ? 'text-red-600' : lastValue < firstValue ? 'text-blue-600' : 'text-gray-600';

  // Create simple sparkline using Unicode characters
  const sparkline = values.map(value => {
    const normalized = (value - minValue) / (maxValue - minValue || 1);
    if (normalized > 0.75) return '█';
    if (normalized > 0.5) return '▆';
    if (normalized > 0.25) return '▄';
    return '▂';
  }).join('');

  const startTime = new Date(data[0].time);
  const endTime = new Date(data[data.length - 1].time);

  return (
    <div className="w-full bg-white border rounded p-3" style={{ height: `${height}px` }}>
      <div className="flex flex-col h-full justify-between">
        <div className="text-xs text-gray-600 mb-1">
          Water Level Trend
        </div>
        
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-mono" style={{ color }}>
            {firstValue.toFixed(2)} ft
          </div>
          <div className={`text-lg ${trendColor}`}>
            {trend}
          </div>
          <div className="text-sm font-mono" style={{ color }}>
            {lastValue.toFixed(2)} ft
          </div>
        </div>
        
        <div className="text-center mb-2">
          <div className="font-mono text-sm tracking-wider" style={{ color: color }}>
            {sparkline}
          </div>
        </div>
        
        <div className="flex justify-between text-xs text-gray-500">
          <span>{startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="text-center">{data.length} readings</span>
          <span>{endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
        
        <div className="text-xs text-center text-gray-400 mt-1">
          Range: {minValue.toFixed(2)} - {maxValue.toFixed(2)} ft
        </div>
      </div>
    </div>
  );
};

export default MiniChart;
