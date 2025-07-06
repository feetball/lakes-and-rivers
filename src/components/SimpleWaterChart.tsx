'use client';

import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

interface SimpleWaterChartProps {
  data: Array<{
    time: number;
    value: number;
  }>;
  color?: string;
  showTooltip?: boolean;
  height?: number;
  forTooltip?: boolean;
}

const SimpleWaterChart: React.FC<SimpleWaterChartProps> = ({ 
  data, 
  color = '#3b82f6', 
  showTooltip = false,
  height = 80,
  forTooltip = false
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-xs text-gray-500"
           style={{ height: `${height}px` }}>
        No chart data available
      </div>
    );
  }

  // Format data for recharts
  const chartData = data.map((point, index) => ({
    index: index,
    time: new Date(point.time).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: false 
    }),
    value: Number(point.value),
    timestamp: point.time,
    formattedValue: `${Number(point.value).toFixed(2)} ft`,
    formattedTime: new Date(point.time).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }));

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-2 border border-gray-300 rounded shadow-lg text-xs">
          <p className="font-semibold">{data.formattedTime}</p>
          <p className="text-blue-600">{data.formattedValue}</p>
        </div>
      );
    }
    return null;
  };

  // For tooltip charts, use simpler styling
  const margin = forTooltip ? { top: 2, right: 2, left: 2, bottom: 2 } : { top: 5, right: 5, left: 5, bottom: 5 };
  const strokeWidth = forTooltip ? 1 : (showTooltip ? 2 : 1.5);

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart 
          data={chartData} 
          margin={margin}
        >
          {showTooltip && !forTooltip && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
          <XAxis 
            dataKey="index"
            tick={showTooltip && !forTooltip ? { fontSize: 10 } : false}
            axisLine={showTooltip && !forTooltip}
            tickLine={showTooltip && !forTooltip}
          />
          <YAxis 
            tick={showTooltip && !forTooltip ? { fontSize: 10 } : false}
            axisLine={showTooltip && !forTooltip}
            tickLine={showTooltip && !forTooltip}
            domain={['dataMin - 0.1', 'dataMax + 0.1']}
          />
          {showTooltip && !forTooltip && <Tooltip content={<CustomTooltip />} />}
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={strokeWidth}
            dot={false}
            activeDot={forTooltip ? false : { r: showTooltip ? 4 : 3, fill: color, stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SimpleWaterChart;
