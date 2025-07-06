'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Dynamically import the chart components to avoid SSR issues
const WaterLevelChartClient = dynamic(() => import('./WaterLevelChartClient'), {
  ssr: false,
  loading: () => (
    <div className="w-full flex items-center justify-center text-xs text-gray-500" style={{ height: '80px' }}>
      Loading chart...
    </div>
  ),
});

interface WaterLevelChartProps {
  data: Array<{
    time: number;
    value: number;
  }>;
  color?: string;
  showTooltip?: boolean;
  height?: number;
}

const WaterLevelChart: React.FC<WaterLevelChartProps> = (props) => {
  if (!props.data || props.data.length === 0) {
    return (
      <div className="w-full flex items-center justify-center text-xs text-gray-500"
           style={{ height: `${props.height || 80}px` }}>
        No chart data available
      </div>
    );
  }

  return <WaterLevelChartClient {...props} />;
};

export default WaterLevelChart;
