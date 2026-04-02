'use client';

import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiMicrosoftTeams } from '@mdi/js';

export default function TeamsSettingsPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Link href="/dashboard/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-primary)', textDecoration: 'none', fontSize: 14, marginBottom: 16 }}>
        <Icon path={mdiArrowLeft} size={0.7} /> Back to Settings
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#5059c91a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon path={mdiMicrosoftTeams} size={1.3} color="#5059c9" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Microsoft Teams</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Send ticket notifications to Teams channels</p>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
        <Icon path={mdiMicrosoftTeams} size={2.5} color="var(--text-placeholder)" />
        <h2 style={{ margin: '16px 0 8px', fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)' }}>Coming Soon</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', maxWidth: 400, marginInline: 'auto' }}>
          Microsoft Teams integration will allow you to send ticket notifications, updates, and alerts directly to Teams channels and chats.
        </p>
      </div>
    </div>
  );
}
