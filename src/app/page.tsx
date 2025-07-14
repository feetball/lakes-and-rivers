'use client';

import dynamic from 'next/dynamic';

// Create a component that works around hydration issues by forcing client-side rendering
const ClientSideApp = dynamic(
  () => import('@/components/ClientSideApp'), 
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen bg-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-lg font-medium text-gray-700">Loading Texas Water Overview...</p>
          <p className="mt-2 text-sm text-gray-500">Please wait while the map loads...</p>
        </div>
      </div>
    )
  }
);

export default function Home() {
  return <ClientSideApp />;
}
