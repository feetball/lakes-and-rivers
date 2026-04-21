'use client';

import { useEffect, useState } from 'react';
import WaterMap from '@/components/WaterMap';
import MobileWaterMap from '@/components/MobileWaterMap';

/**
 * Picks the desktop or mobile map synchronously (both are already bundled in
 * this chunk). No nested dynamic imports — they previously caused a cascade
 * of three loading spinners on cold load.
 */
export default function ResponsiveMap() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return isMobile ? <MobileWaterMap /> : <WaterMap />;
}
