'use client';

import { useState, useEffect } from 'react';

export default function TestPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    console.log('✅ TEST PAGE: React hydration working!');
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div>Loading test page...</div>;
  }

  return (
    <div style={{ padding: '20px', backgroundColor: 'lightgreen' }}>
      <h1>✅ Test Page - React Hydration Success!</h1>
      <p>This is a completely new page to test if React hydration works.</p>
    </div>
  );
}
