'use client';

import Icon from '@mdi/react';
import { mdiEmail, mdiSend, mdiSlack, mdiMicrosoftTeams, mdiChatProcessing } from '@mdi/js';
import type { TemplateChannel } from './types';

const CHANNEL_META: Record<
  TemplateChannel,
  { label: string; icon: string; color: string; bg: string }
> = {
  EMAIL: { label: 'Email', icon: mdiEmail, color: '#dc2626', bg: '#fee2e2' },
  TELEGRAM: { label: 'Telegram', icon: mdiSend, color: '#0088cc', bg: '#e0f2fe' },
  SLACK: { label: 'Slack', icon: mdiSlack, color: '#4A154B', bg: '#f3e8ff' },
  TEAMS: { label: 'Teams', icon: mdiMicrosoftTeams, color: '#4f46e5', bg: '#e0e7ff' },
  DISCORD: { label: 'Discord', icon: mdiChatProcessing, color: '#5865F2', bg: '#e0e7ff' },
};

export function ChannelBadge({ channel }: { channel: TemplateChannel }) {
  const meta = CHANNEL_META[channel];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: meta.bg,
        color: meta.color,
      }}
    >
      <Icon path={meta.icon} size={0.55} color="currentColor" />
      {meta.label}
    </span>
  );
}
