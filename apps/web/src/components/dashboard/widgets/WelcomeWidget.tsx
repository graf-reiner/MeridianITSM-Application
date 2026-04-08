'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiWeatherSunny, mdiWeatherNight, mdiWhiteBalanceSunny } from '@mdi/js';
import WidgetWrapper from '../WidgetWrapper';
import type { WidgetProps } from '../types';

interface UserProfile {
  firstName?: string;
  name?: string;
  email?: string;
}

function getGreeting(): { text: string; icon: string; color: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', icon: mdiWeatherSunny, color: '#d97706' };
  if (hour < 17) return { text: 'Good afternoon', icon: mdiWhiteBalanceSunny, color: '#ea580c' };
  return { text: 'Good evening', icon: mdiWeatherNight, color: '#4f46e5' };
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function WelcomeWidget({ widgetId, config, isEditing, onConfigChange }: WidgetProps) {
  const greeting = useMemo(getGreeting, []);
  const dateStr = useMemo(formatDate, []);

  const { data: user } = useQuery<UserProfile>({
    queryKey: ['user-profile-widget'],
    queryFn: async () => {
      const res = await fetch('/api/v1/preferences', { credentials: 'include' });
      if (!res.ok) return { firstName: '' };
      return res.json() as Promise<UserProfile>;
    },
    staleTime: 300_000,
    retry: false,
  });

  const title = config.title || 'Welcome';
  const firstName = user?.firstName || user?.name?.split(' ')[0] || '';

  return (
    <WidgetWrapper title={title} isEditing={isEditing} onRemove={isEditing ? () => onConfigChange?.(widgetId, { ...config, type: '__remove__' }) : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: '100%' }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          backgroundColor: greeting.color + '18',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon path={greeting.icon} size={1.1} color={greeting.color} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            {greeting.text}{firstName ? `, ${firstName}` : ''}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {dateStr}
          </p>
        </div>
      </div>
    </WidgetWrapper>
  );
}
