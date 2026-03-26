'use client';

import { useEffect } from 'react';

/**
 * Shows a browser confirmation dialog when the user tries to leave
 * with unsaved changes. Works for page close/refresh and link clicks.
 *
 * Note: Next.js App Router doesn't expose routeChangeStart events like
 * the Pages Router. The beforeunload event covers browser close, refresh,
 * and external navigation. For SPA link navigation within the app,
 * a wrapper component can be added later if needed.
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers show their own message, this is required for the prompt
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);
}
