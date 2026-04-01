'use client';

import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlaCountdownProps {
  slaBreachAt: string | null;
  isPaused: boolean;
  elapsedPercentage: number;
  pauseReason?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0m';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

/** Derive color band styles from elapsed percentage per CONTEXT.md locked decision. */
function getColorBand(elapsedPercentage: number): {
  bg: string;
  text: string;
  label: string;
  isBreached: boolean;
} {
  if (elapsedPercentage >= 100) {
    return { bg: 'var(--badge-red-bg)', text: '#b91c1c', label: 'BREACHED', isBreached: true };
  }
  if (elapsedPercentage >= 90) {
    return { bg: 'var(--badge-red-bg-subtle)', text: '#dc2626', label: '', isBreached: false };
  }
  if (elapsedPercentage >= 75) {
    return { bg: 'var(--badge-yellow-bg-subtle)', text: '#ca8a04', label: '', isBreached: false };
  }
  return { bg: 'var(--badge-green-bg-subtle)', text: '#16a34a', label: '', isBreached: false };
}

// ─── SlaCountdown ─────────────────────────────────────────────────────────────

/**
 * SLA countdown timer with color bands per CONTEXT.md locked decision:
 *   Green  (< 75%):  elapsedPercentage < 75
 *   Yellow (75-90%): elapsedPercentage >= 75
 *   Red    (90-99%): elapsedPercentage >= 90
 *   BREACHED (100%): elapsedPercentage >= 100 — shows "BREACHED" text
 *
 * PAUSED: When isPaused=true, shows orange PAUSED badge with frozen timer.
 */
export default function SlaCountdown({
  slaBreachAt,
  isPaused,
  elapsedPercentage,
  pauseReason,
}: SlaCountdownProps) {
  const [remaining, setRemaining] = useState<number>(() =>
    slaBreachAt ? new Date(slaBreachAt).getTime() - Date.now() : 0
  );

  // Tick every second unless paused or already breached/no SLA
  useEffect(() => {
    if (!slaBreachAt || isPaused || elapsedPercentage >= 100) return;

    const interval = setInterval(() => {
      setRemaining(new Date(slaBreachAt).getTime() - Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [slaBreachAt, isPaused, elapsedPercentage]);

  if (!slaBreachAt) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-placeholder)',
        }}
      >
        No SLA
      </span>
    );
  }

  const { bg, text, label, isBreached } = getColorBand(elapsedPercentage);

  if (isPaused) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 8px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          backgroundColor: 'var(--badge-orange-bg-subtle)',
          color: '#c2410c',
        }}
        title={pauseReason ?? 'SLA timer is paused'}
      >
        <span
          style={{
            backgroundColor: '#fed7aa',
            color: '#9a3412',
            padding: '1px 6px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}
        >
          PAUSED
        </span>
        {formatRemaining(remaining)}
      </span>
    );
  }

  if (isBreached) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          backgroundColor: bg,
          color: text,
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        backgroundColor: bg,
        color: text,
      }}
    >
      {formatRemaining(remaining)}
    </span>
  );
}
