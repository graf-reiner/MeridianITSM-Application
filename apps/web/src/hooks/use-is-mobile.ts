'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true if the current device looks like a phone:
 *   - viewport <= 768px wide
 *   - coarse pointer (touch, not mouse)
 *   - UA matches iOS or Android
 *
 * Returns null until after hydration (so server rendering is not
 * assumed to know).
 */
export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px) and (pointer: coarse)');
    const uaIsMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    const update = () => setIsMobile(mq.matches && uaIsMobile);
    update();

    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isMobile;
}
