'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@mdi/react';
import { mdiClose, mdiArrowUpBoldCircleOutline, mdiAlertCircleOutline } from '@mdi/js';
import { PLAN_GATE_EVENT, type PlanGateError } from '@/lib/api';

const FEATURE_LABELS: Record<string, string> = {
  users: 'Users',
  agents: 'Agents',
  sites: 'Sites',
  cmdb: 'CMDB',
  mobile: 'Mobile App',
  webhooks: 'Webhooks',
  api_access: 'API Access',
  scheduled_reports: 'Scheduled Reports',
  ai_assistant: 'AI Assistant',
};

/**
 * Global modal that appears when a 402 planGate error is intercepted.
 * Place this once in the dashboard layout.
 */
export default function UpgradeModal() {
  const router = useRouter();
  const [error, setError] = useState<PlanGateError | null>(null);

  const handlePlanGateError = useCallback((e: Event) => {
    const detail = (e as CustomEvent<PlanGateError>).detail;
    setError(detail);
  }, []);

  useEffect(() => {
    window.addEventListener(PLAN_GATE_EVENT, handlePlanGateError);
    return () => window.removeEventListener(PLAN_GATE_EVENT, handlePlanGateError);
  }, [handlePlanGateError]);

  if (!error) return null;

  const isLimitError = error.error === 'PLAN_LIMIT_EXCEEDED';
  const isInactive = error.error === 'SUBSCRIPTION_INACTIVE' || error.error === 'NO_SUBSCRIPTION';

  const title = isInactive ? 'Subscription Inactive' : 'Plan Limit Reached';

  let message: string;
  if (isInactive) {
    message = 'Your subscription is no longer active. Please update your billing to continue.';
  } else if (error.feature && error.limit !== undefined) {
    const label = FEATURE_LABELS[error.feature] ?? error.feature;
    message = `You've reached the limit of ${error.limit} ${label.toLowerCase()} on your current plan (currently at ${error.current}).`;
  } else if (error.feature) {
    const label = FEATURE_LABELS[error.feature] ?? error.feature;
    message = `${label} is not available on your current plan.`;
  } else {
    message = 'This action is not available on your current plan.';
  }

  const upgradeTier = error.upgradeTier
    ? error.upgradeTier.charAt(0) + error.upgradeTier.slice(1).toLowerCase()
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
        }}
        onClick={() => setError(null)}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 12,
          border: '1px solid var(--border-primary)',
          boxShadow: '0 20px 25px -5px var(--shadow-lg)',
          maxWidth: 420,
          width: '90%',
          padding: 28,
          zIndex: 9999,
        }}
      >
        {/* Close button */}
        <button
          onClick={() => setError(null)}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            color: 'var(--text-muted)',
          }}
          aria-label="Close"
        >
          <Icon path={mdiClose} size={0.85} color="currentColor" />
        </button>

        {/* Icon */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            backgroundColor: isInactive ? '#fef2f2' : '#fffbeb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <Icon
            path={isInactive ? mdiAlertCircleOutline : mdiArrowUpBoldCircleOutline}
            size={1.3}
            color={isInactive ? '#dc2626' : '#d97706'}
          />
        </div>

        {/* Content */}
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
            textAlign: 'center',
          }}
        >
          {title}
        </h2>

        <p
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            margin: '0 0 20px',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>

        {upgradeTier && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              margin: '0 0 20px',
              textAlign: 'center',
            }}
          >
            Upgrade to <strong>{upgradeTier}</strong> to unlock this.
          </p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setError(null)}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--border-primary)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              setError(null);
              router.push('/billing');
            }}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: 'var(--accent-primary)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isInactive ? 'Update Billing' : 'Upgrade Plan'}
          </button>
        </div>
      </div>
    </>
  );
}
