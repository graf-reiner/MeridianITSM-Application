'use client';

import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiSend } from '@mdi/js';

export default function TelegramSettingsPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Link href="/dashboard/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-primary)', textDecoration: 'none', fontSize: 14, marginBottom: 16 }}>
        <Icon path={mdiArrowLeft} size={0.7} /> Back to Settings
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#0088cc1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon path={mdiSend} size={1.3} color="#0088cc" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Telegram</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Send notifications to Telegram chats and groups</p>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
        <Icon path={mdiSend} size={2.5} color="var(--text-placeholder)" />
        <h2 style={{ margin: '16px 0 8px', fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)' }}>Coming Soon</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', maxWidth: 400, marginInline: 'auto' }}>
          Telegram integration will allow you to send ticket notifications and alerts to Telegram chats, groups, and channels using the Telegram Bot API.
        </p>
      </div>
    </div>
  );
}
