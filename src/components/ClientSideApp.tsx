'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';

// Force these components to be client-side only
const WaterMap = dynamic(() => import('@/components/WaterMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-blue-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-lg font-medium text-gray-700">Loading Map...</p>
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

export default function ClientSideApp() {
  const [windowWidth, setWindowWidth] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    console.log('✅ ClientSideApp mounted successfully!');
    setMounted(true);
    
    // Set initial width
    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth);
      
      // Add resize listener
      const handleResize = () => setWindowWidth(window.innerWidth);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Memoize mobile detection
  const isMobile = useMemo(() => windowWidth < 768, [windowWidth]);

  // Don't render anything until we're mounted client-side
  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-lg font-medium text-gray-700">Initializing Water Map...</p>
          <p className="mt-2 text-sm text-gray-500">Setting up mapping components...</p>
        </div>
      </div>
    );
  }

  console.log('✅ Rendering water map, mobile:', isMobile);
  
  // Render the appropriate component based on screen size
  return isMobile ? <MobileWaterMap /> : <WaterMap />;
}
