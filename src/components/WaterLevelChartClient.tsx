'use client';

import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface WaterLevelChartClientProps {
  data: Array<{
    time: number;
    value: number;
  }>;
  color?: string;
  showTooltip?: boolean;
  height?: number;
}

const WaterLevelChartClient: React.FC<WaterLevelChartClientProps> = ({ 
  data, 
  color = '#3b82f6', 
  showTooltip = false,
  height = 80 
}) => {
  console.log('WaterLevelChartClient rendering with data:', { dataLength: data?.length, height, color });

  if (!data || data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-xs text-gray-500"
           style={{ height: `${height}px` }}>
        No chart data available
      </div>
    );
  }

  // Format data for recharts
  const chartData = data.map((point: any) => ({
    time: new Date(point.time).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: false 
    }),
    value: point.value,
    timestamp: point.time,
    formattedValue: `${point.value.toFixed(2)} ft`,
    formattedTime: new Date(point.time).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }));

  console.log('Formatted chart data:', chartData.slice(0, 3));

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
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

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart 
          data={chartData} 
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
        >
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
          {showTooltip && <Tooltip content={<CustomTooltip />} />}
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: color, stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WaterLevelChartClient;
