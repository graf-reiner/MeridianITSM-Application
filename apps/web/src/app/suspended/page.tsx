'use client';

import { useRouter } from 'next/navigation';
import Icon from '@mdi/react';
import { mdiAlertCircleOutline, mdiCreditCardOutline, mdiEmailOutline, mdiRefresh } from '@mdi/js';
import ThemeProvider from '@/components/ThemeProvider';

export default function SuspendedPage() {
  const router = useRouter();

  return (
    <ThemeProvider>
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-secondary)',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            backgroundColor: 'var(--bg-primary)',
            borderRadius: 12,
            border: '1px solid var(--border-primary)',
            boxShadow: '0 4px 6px -1px var(--shadow-sm)',
            padding: 40,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <Icon path={mdiAlertCircleOutline} size={1.5} color="#dc2626" />
          </div>

          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 8px',
            }}
          >
            Account Suspended
          </h1>

          <p
            style={{
              fontSize: 15,
              color: 'var(--text-secondary)',
              margin: '0 0 28px',
              lineHeight: 1.6,
            }}
          >
            Your subscription is inactive. This may be due to an expired trial,
            a canceled subscription, or a failed payment. Please update your
            billing information to restore access.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => router.push('/billing')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 20px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Icon path={mdiCreditCardOutline} size={0.85} color="#fff" />
              Update Billing
            </button>

            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 20px',
                borderRadius: 8,
                border: '1px solid var(--border-primary)',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Icon path={mdiRefresh} size={0.85} color="currentColor" />
              Refresh Status
            </button>

            <a
              href="mailto:support@meridianitsm.com"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 20px',
                borderRadius: 8,
                border: '1px solid var(--border-primary)',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              <Icon path={mdiEmailOutline} size={0.85} color="currentColor" />
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
