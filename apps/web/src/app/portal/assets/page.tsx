'use client';

import Icon from '@mdi/react';
import { mdiLaptop, mdiCalendarClock } from '@mdi/js';

// ─── My Assets Page ───────────────────────────────────────────────────────────

/**
 * Portal assets page — satisfies PRTL-05 structurally.
 *
 * The asset inventory API endpoint (GET /api/v1/assets?assignedToId=me) will be
 * wired when the asset CRUD phase implements it. For now, we render a clear
 * placeholder so end users land on a page that communicates the feature roadmap.
 */
export default function PortalAssetsPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#111827' }}>
          My Assets
        </h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
          Hardware and software assigned to you
        </p>
      </div>

      {/* ── Empty State ───────────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 16,
          padding: '60px 40px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            backgroundColor: '#e0e7ff',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <Icon path={mdiLaptop} size={1.6} color="#4f46e5" />
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
          No assets assigned to you
        </h2>
        <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
          Asset management will be available soon. Your IT team will assign devices,
          software licenses, and equipment to your account here.
        </p>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            borderRadius: 8,
            fontSize: 13,
            color: '#6b7280',
          }}
        >
          <Icon path={mdiCalendarClock} size={0.7} color="currentColor" />
          Coming soon — asset inventory management
        </div>
      </div>
    </div>
  );
}
