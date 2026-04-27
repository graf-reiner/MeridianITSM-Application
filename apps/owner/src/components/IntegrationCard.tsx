'use client';

import { useState } from 'react';
import { ownerFetch } from '../lib/api';
import type { IntegrationStatus } from '../app/(admin)/integrations/page';

interface Props {
  status: IntegrationStatus;
  onConfigure: () => void;
  onChanged: () => void;
}

const PROVIDER_META: Record<'MICROSOFT' | 'GOOGLE', { label: string; subtitle: string; accent: string }> = {
  MICROSOFT: {
    label: 'Microsoft 365',
    subtitle: 'Outlook & Exchange Online',
    accent: '#0078d4',
  },
  GOOGLE: {
    label: 'Google Workspace',
    subtitle: 'Gmail',
    accent: '#ea4335',
  },
};

function expiresIn(iso: string | null): { label: string; warn: boolean } | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 0) return { label: `Secret expired ${-days}d ago`, warn: true };
  if (days <= 30) return { label: `Secret expires in ${days}d`, warn: true };
  return { label: `Secret valid for ${days}d`, warn: false };
}

export default function IntegrationCard({ status, onConfigure, onChanged }: Props) {
  const meta = PROVIDER_META[status.provider];
  const [removing, setRemoving] = useState(false);
  const expiry = expiresIn(status.secretExpiresAt);

  let badgeText: string;
  let badgeBg: string;
  let badgeFg: string;
  if (status.source === 'db') { badgeText = 'Configured'; badgeBg = '#dcfce7'; badgeFg = '#166534'; }
  else if (status.source === 'env') { badgeText = 'Env-configured'; badgeBg = '#fef3c7'; badgeFg = '#92400e'; }
  else { badgeText = 'Not configured'; badgeBg = '#f1f5f9'; badgeFg = '#475569'; }

  async function handleRemove() {
    if (!confirm(`Remove ${meta.label} credentials? Tenants will lose the ability to connect new ${meta.label} mailboxes until you reconfigure (or env vars cover it).`)) return;
    setRemoving(true);
    try {
      const res = await ownerFetch(`/api/integrations/${status.provider}`, { method: 'DELETE' });
      if (res.ok) onChanged();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.accent, display: 'inline-block' }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#0f172a' }}>{meta.label}</h3>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0 18px' }}>{meta.subtitle}</p>
        </div>
        <span style={{ background: badgeBg, color: badgeFg, fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {badgeText}
        </span>
      </div>

      {status.configured && (
        <div style={{ fontSize: 13, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', background: '#f8fafc', borderRadius: 6 }}>
          <div><span style={{ color: '#64748b' }}>Client ID:</span> <code style={{ fontSize: 12 }}>{status.clientIdMasked}</code></div>
          {status.source === 'db' && status.updatedAt && (
            <div><span style={{ color: '#64748b' }}>Last updated:</span> {new Date(status.updatedAt).toLocaleString()}</div>
          )}
          {expiry && (
            <div style={{ color: expiry.warn ? '#b91c1c' : '#475569' }}>
              {expiry.warn ? '⚠ ' : ''}{expiry.label}
            </div>
          )}
          {status.notes && (
            <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>Note: {status.notes}</div>
          )}
        </div>
      )}

      {status.source === 'env' && (
        <p style={{ fontSize: 12, color: '#92400e', margin: 0 }}>
          Currently set via environment variable. Save credentials here to manage them in-app instead.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button
          onClick={onConfigure}
          style={{ padding: '8px 14px', background: meta.accent, color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          {status.source === 'db' ? 'Reconfigure' : 'Configure'}
        </button>
        {status.source === 'db' && (
          <button
            onClick={() => void handleRemove()}
            disabled={removing}
            style={{ padding: '8px 14px', background: 'transparent', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: removing ? 'not-allowed' : 'pointer' }}
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  );
}
