'use client';

import { useTheme } from './ThemeProvider';
import Icon from '@mdi/react';
import { mdiWhiteBalanceSunny, mdiMoonWaningCrescent, mdiMonitor } from '@mdi/js';

type ThemeOption = 'light' | 'dark' | 'system';

const options: { value: ThemeOption; icon: string; label: string }[] = [
  { value: 'light', icon: mdiWhiteBalanceSunny, label: 'Light' },
  { value: 'dark', icon: mdiMoonWaningCrescent, label: 'Dark' },
  { value: 'system', icon: mdiMonitor, label: 'System' },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-primary)' }}>
      <span
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 4,
          display: 'block',
        }}
      >
        Theme
      </span>
      <div
        style={{
          display: 'flex',
          gap: 2,
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: 6,
          padding: 2,
        }}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            title={opt.label}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '4px 8px',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: theme === opt.value ? 600 : 400,
              backgroundColor: theme === opt.value ? 'var(--bg-primary)' : 'transparent',
              color: theme === opt.value ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: theme === opt.value ? '0 1px 2px var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon path={opt.icon} size={0.6} color="currentColor" />
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
