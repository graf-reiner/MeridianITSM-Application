'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@mdi/react';
import { mdiClose, mdiClockAlertOutline } from '@mdi/js';
import { usePlan } from '@/hooks/usePlan';

/**
 * Persistent banner shown to tenants on a trial subscription.
 * Color-coded by urgency:
 *   - Blue: > 7 days remaining
 *   - Yellow: 3-7 days remaining
 *   - Red: < 3 days remaining
 */
export default function TrialBanner() {
  const { plan, isTrial, isLoading } = usePlan();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !plan || !isTrial() || dismissed) return null;

  const trialEnd = plan.trialEnd ? new Date(plan.trialEnd) : null;
  if (!trialEnd) return null;

  const now = new Date();
  const msRemaining = trialEnd.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  let bgColor: string;
  let textColor: string;
  let borderColor: string;
  if (daysRemaining <= 3) {
    bgColor = '#fef2f2';
    textColor = '#991b1b';
    borderColor = '#fecaca';
  } else if (daysRemaining <= 7) {
    bgColor = '#fffbeb';
    textColor = '#92400e';
    borderColor = '#fde68a';
  } else {
    bgColor = '#eff6ff';
    textColor = '#1e40af';
    borderColor = '#bfdbfe';
  }

  const label =
    daysRemaining === 0
      ? 'Your trial expires today.'
      : daysRemaining === 1
        ? 'Your trial expires tomorrow.'
        : `Your trial expires in ${daysRemaining} days.`;

  return (
    <div
      style={{
        backgroundColor: bgColor,
        borderBottom: `1px solid ${borderColor}`,
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        fontSize: 13,
        fontWeight: 500,
        color: textColor,
        flexShrink: 0,
      }}
    >
      <Icon path={mdiClockAlertOutline} size={0.7} color={textColor} />
      <span>{label}</span>
      <button
        onClick={() => router.push('/billing')}
        style={{
          marginLeft: 4,
          padding: '3px 10px',
          borderRadius: 5,
          border: `1px solid ${borderColor}`,
          backgroundColor: 'transparent',
          color: textColor,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Upgrade now
      </button>
      <button
        onClick={() => setDismissed(true)}
        style={{
          marginLeft: 'auto',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          color: textColor,
          opacity: 0.6,
        }}
        aria-label="Dismiss"
      >
        <Icon path={mdiClose} size={0.6} color="currentColor" />
      </button>
    </div>
  );
}
