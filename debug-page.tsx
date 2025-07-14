'use client';

import { useState, useEffect } from 'react';

export default function DebugPage() {
  const [step, setStep] = useState('Starting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('Debug page useEffect starting');
    setStep('useEffect called');
    
    try {
      setStep('Setting client state');
      setTimeout(() => {
        setStep('Client state set successfully');
        console.log('Debug page loaded successfully');
      }, 100);
    } catch (err) {
      console.error('Error in useEffect:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  return (
    <div className="flex items-center justify-center h-screen bg-blue-50">
      <div className="text-center p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-4">Debug Page</h1>
        <p className="mb-2">Current step: {step}</p>
        {error && <p className="text-red-500">Error: {error}</p>}
        <div className="mt-4">
          <p className="text-sm text-gray-600">
            Window width: {typeof window !== 'undefined' ? window.innerWidth : 'undefined'}
          </p>
        </div>
      </div>
    </div>
  );
}
