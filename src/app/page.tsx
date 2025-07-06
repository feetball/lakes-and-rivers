'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';

// Lazy load components to reduce initial bundle size
const WaterMap = dynamic(() => import('@/components/WaterMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-blue-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-lg font-medium text-gray-700">Loading Texas Water Overview...</p>
      </div>
    </div>
  ),
});

const MobileWaterMap = dynamic(() => import('@/components/MobileWaterMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-blue-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-700">Loading mobile view...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  const [windowWidth, setWindowWidth] = useState(0);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    // Set initial width
    setWindowWidth(window.innerWidth);
    
    // Debounced resize handler for better performance
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        setWindowWidth(window.innerWidth);
      }, 150);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Memoize mobile detection to prevent unnecessary re-renders
  const isMobile = useMemo(() => windowWidth < 768, [windowWidth]);

  // Prevent hydration mismatch by not rendering until client-side
  if (!isClient) {
    return (
      <div className="flex items-center justify-center h-screen bg-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-lg font-medium text-gray-700">Initializing...</p>
        </div>
      </div>
    );
  }

  // Only load the component we actually need
  return isMobile ? <MobileWaterMap /> : <WaterMap />;
}
