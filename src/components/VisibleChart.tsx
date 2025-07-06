'use client';

import React, { useEffect, useState } from 'react';

interface VisibleChartProps {
  data: Array<{
    time: number;
    value: number;
  }>;
  color?: string;
  height?: number;
  title?: string;
}

const VisibleChart: React.FC<VisibleChartProps> = ({ 
  data, 
  color = '#3b82f6', 
  height = 120,
  title = "Water Level Chart"
}) => {
  const [ChartComponent, setChartComponent] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadChart = async () => {
      try {
        const recharts = await import('recharts');
        const { LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid } = recharts;
        
        setChartComponent(() => ({ data, color, height }: VisibleChartProps) => {
          console.log('VisibleChart rendering with:', { 
            dataLength: data?.length, 
            firstPoint: data?.[0], 
            color, 
            height 
          });

          if (!data || data.length === 0) {
            return (
              <div 
                className="bg-gray-100 border-2 border-red-500 flex items-center justify-center text-red-600 font-bold"
                style={{ height: `${height}px`, minHeight: `${height}px` }}
              >
                NO DATA
              </div>
            );
          }

          // Format data for recharts with simple numeric time
          const chartData = data.map((point, index) => ({
            index: index,
            time: new Date(point.time).getHours() + ':' + String(new Date(point.time).getMinutes()).padStart(2, '0'),
            value: Number(point.value),
            originalTime: point.time
          }));

          console.log('Chart data formatted:', chartData.slice(0, 3));

          return (
            <div 
              className="bg-white border-2 border-blue-500 p-2"
              style={{ height: `${height}px`, minHeight: `${height}px`, width: '100%' }}
            >
              <div className="text-xs font-bold mb-1 text-blue-600">
                {title} ({data.length} points)
              </div>
              <div style={{ width: '100%', height: `${height - 30}px` }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="index"
                      tick={{ fontSize: 10 }}
                      axisLine={{ stroke: '#ccc' }}
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }}
                      axisLine={{ stroke: '#ccc' }}
                      domain={['dataMin - 0.1', 'dataMax + 0.1']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke={color} 
                      strokeWidth={2}
                      dot={{ r: 2, fill: color }}
                      activeDot={{ r: 4, fill: color }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        });
      } catch (err: any) {
        console.error('Error loading chart:', err);
        setError(err.message);
      }
    };

    loadChart();
  }, []);

  if (error) {
    return (
      <div 
        className="bg-red-100 border-2 border-red-500 flex items-center justify-center text-red-600 font-bold"
        style={{ height: `${height}px` }}
      >
        Chart Error: {error}
      </div>
    );
  }

  if (!ChartComponent) {
    return (
      <div 
        className="bg-yellow-100 border-2 border-yellow-500 flex items-center justify-center text-yellow-600 font-bold"
        style={{ height: `${height}px` }}
      >
        Loading Chart...
      </div>
    );
  }

  return <ChartComponent data={data} color={color} height={height} />;
};

export default VisibleChart;
