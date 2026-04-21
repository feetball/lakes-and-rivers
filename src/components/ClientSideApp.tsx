'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/ErrorBoundary';

// Single dynamic boundary. Previously this layer nested another `dynamic()`
// import around each map, then WaterMap nested a third around MapView — so
// every cold load had to download three chunk waterfalls and render three
// loading spinners before anything appeared.
const ResponsiveMap = dynamic(() => import('@/components/ResponsiveMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-blue-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-lg font-medium text-gray-700">Loading map…</p>
      </div>
    </div>
  ),
});

export default function ClientSideApp() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <ErrorBoundary>
      <ResponsiveMap />
    </ErrorBoundary>
  );
}
