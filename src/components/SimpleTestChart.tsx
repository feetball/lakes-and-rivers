'use client';

import React, { useEffect, useState } from 'react';

const SimpleTestChart: React.FC = () => {
  const [isClient, setIsClient] = useState(false);
  const [recharts, setRecharts] = useState<any>(null);

  useEffect(() => {
    setIsClient(true);
    
    // Dynamically import recharts to avoid SSR issues
    import('recharts').then((module) => {
      console.log('Recharts module loaded:', module);
      setRecharts(module);
    }).catch((error) => {
      console.error('Error loading recharts:', error);
    });
  }, []);

  const testData = [
    { time: 1, value: 10 },
    { time: 2, value: 15 },
    { time: 3, value: 12 },
    { time: 4, value: 18 },
    { time: 5, value: 14 },
  ];

  console.log('SimpleTestChart state:', { isClient, hasRecharts: !!recharts });

  if (!isClient) {
    return (
      <div className="w-full h-32 bg-blue-100 border border-blue-500 flex items-center justify-center">
        <span className="text-sm font-bold">Loading client...</span>
      </div>
    );
  }

  if (!recharts) {
    return (
      <div className="w-full h-32 bg-orange-100 border border-orange-500 flex items-center justify-center">
        <span className="text-sm font-bold">Loading Recharts...</span>
      </div>
    );
  }

  try {
    const { LineChart, Line, XAxis, YAxis, ResponsiveContainer } = recharts;
    
    return (
      <div className="w-full h-32 bg-green-100 border-4 border-green-500 p-2">
        <h3 className="text-sm font-bold text-green-600">Dynamic Recharts Test - WORKING!</h3>
        <div className="w-full h-20 bg-white border border-gray-300" style={{ minHeight: '80px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={testData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <XAxis dataKey="time" />
              <YAxis />
              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error rendering chart:', error);
    return (
      <div className="w-full h-32 bg-red-100 border border-red-500 flex items-center justify-center">
        <span className="text-sm font-bold text-red-600">Chart Error: {error.message}</span>
      </div>
    );
  }
};

export default SimpleTestChart;
