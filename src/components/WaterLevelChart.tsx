'use client';

import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';

interface WaterLevelChartProps {
  data: Array<{
    time: number;
    value: number;
  }>;
  color?: string;
}

const WaterLevelChart: React.FC<WaterLevelChartProps> = ({ data, color = '#3b82f6' }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-20 w-full flex items-center justify-center text-xs text-gray-500">
        No chart data available
      </div>
    );
  }

  // Format data for recharts
  const chartData = data.map(point => ({
    time: new Date(point.time).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: false 
    }),
    value: point.value,
    timestamp: point.time
  }));

  return (
    <div className="h-20 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <XAxis 
            dataKey="time" 
            tick={false}
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            tick={false}
            axisLine={false}
            tickLine={false}
            domain={['dataMin - 0.1', 'dataMax + 0.1']}
          />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 2, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WaterLevelChart;
