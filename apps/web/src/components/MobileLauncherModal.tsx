'use client';

import { useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/use-is-mobile';
import {
  getDevicePreference,
  setDevicePreference,
} from '@/lib/device-preference';
import { openMobileApp } from '@/lib/deep-link';

/**
 * On mobile devices, shows a one-time modal asking whether the user
 * wants to open the native app or continue in the browser. The choice
 * is persisted in the `meridian_device_pref` cookie for 1 year.
 *
 * Safe to mount on any authenticated layout — it self-gates on
 * device + cookie.
 */
export default function MobileLauncherModal() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isMobile !== true) return;
    if (getDevicePreference() !== null) return;
    setOpen(true);
  }, [isMobile]);

  if (!open) return null;

  const handleMobileApp = () => {
    setDevicePreference('mobile-app');
    setOpen(false);
    openMobileApp();
  };

  const handleDesktop = () => {
    setDevicePreference('desktop');
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-launcher-title"
      data-testid="mobile-launcher-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 12,
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
          width: '100%',
          maxWidth: 360,
          padding: 24,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <h2
          id="mobile-launcher-title"
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          Better on mobile?
        </h2>
        <p
          style={{
            margin: '8px 0 20px',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
          }}
        >
          Meridian has a mobile app built for your phone. Would you like to
          open it?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={handleMobileApp}
            data-testid="mobile-launcher-open-app"
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: 'var(--accent-brand, #0284c7)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Open Mobile App
          </button>
          <button
            type="button"
            onClick={handleDesktop}
            data-testid="mobile-launcher-use-desktop"
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid var(--border-primary)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Continue in Browser
          </button>
        </div>
      </div>
    </div>
  );
}
