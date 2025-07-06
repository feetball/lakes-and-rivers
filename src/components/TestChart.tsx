'use client';

import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';

const TestChart: React.FC = () => {
  const [isClient, setIsClient] = useState(false);
  
  const testData = [
    { time: 1, value: 10 },
    { time: 2, value: 15 },
    { time: 3, value: 12 },
    { time: 4, value: 18 },
    { time: 5, value: 14 },
  ];

  useEffect(() => {
    setIsClient(true);
    console.log('TestChart mounted on client side');
  }, []);

  console.log('TestChart rendering with data:', testData, 'isClient:', isClient);

  if (!isClient) {
    return (
      <div className="w-full h-32 bg-yellow-100 border border-yellow-500 flex items-center justify-center">
        <span className="text-sm font-bold">Chart Loading...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-32 bg-gray-100 border-4 border-red-500 p-2">
      <h3 className="text-sm font-bold text-red-600">Test Chart (Client-side) - Data: {testData.length} points</h3>
      <div className="w-full h-20 bg-white border border-gray-300" style={{ minHeight: '80px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={testData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <XAxis dataKey="time" />
            <YAxis />
            <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TestChart;
