'use client';

import { useRouter } from 'next/navigation';
import Icon from '@mdi/react';
import { mdiLockOutline, mdiArrowUpBoldCircleOutline } from '@mdi/js';
import { usePlan } from '@/hooks/usePlan';

const FEATURE_LABELS: Record<string, string> = {
  cmdb: 'CMDB',
  mobile: 'Mobile App',
  webhooks: 'Webhooks',
  api_access: 'API Access',
  scheduled_reports: 'Scheduled Reports',
  ai_assistant: 'AI Assistant',
};

interface FeatureGateProps {
  /** The feature flag to check against the plan (e.g., 'cmdb', 'webhooks') */
  feature: string;
  /** Content to render when the feature is available */
  children: React.ReactNode;
  /** Optional custom fallback instead of the default upgrade prompt */
  fallback?: React.ReactNode;
}

/**
 * Wraps content that requires a specific plan feature.
 * Shows children when the feature is available, or an upgrade prompt otherwise.
 *
 * Usage:
 *   <FeatureGate feature="cmdb">
 *     <CmdbPage />
 *   </FeatureGate>
 */
export default function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { hasFeature, isLoading } = usePlan();

  // While loading, optimistically show the content
  if (isLoading) return <>{children}</>;

  if (hasFeature(feature)) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return <UpgradePrompt feature={feature} />;
}

/**
 * Standalone upgrade prompt component — can also be used directly.
 */
export function UpgradePrompt({ feature }: { feature: string }) {
  const router = useRouter();
  const label = FEATURE_LABELS[feature] ?? feature;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          backgroundColor: '#fffbeb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        <Icon path={mdiLockOutline} size={1.4} color="#d97706" />
      </div>

      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: '0 0 8px',
        }}
      >
        {label} Requires an Upgrade
      </h2>

      <p
        style={{
          fontSize: 14,
          color: 'var(--text-secondary)',
          margin: '0 0 24px',
          maxWidth: 400,
          lineHeight: 1.5,
        }}
      >
        {label} is not included in your current plan. Upgrade to unlock this feature and more.
      </p>

      <button
        onClick={() => router.push('/billing')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '11px 24px',
          borderRadius: 8,
          border: 'none',
          backgroundColor: 'var(--accent-primary)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <Icon path={mdiArrowUpBoldCircleOutline} size={0.8} color="#fff" />
        View Plans
      </button>
    </div>
  );
}
