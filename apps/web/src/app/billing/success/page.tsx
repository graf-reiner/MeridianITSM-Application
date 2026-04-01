'use client';

import ThemeProvider from '@/components/ThemeProvider';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SyncResult {
  status: string;
  plan: string;
}

/**
 * Billing success page — rendered after Stripe redirects back post-payment.
 *
 * On mount, calls POST /api/v1/billing/sync-checkout to resolve the webhook
 * race condition and ensure our local subscription status is up to date.
 */
export default function BillingSuccessPage() {
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function syncCheckout() {
      try {
        const res = await fetch('/api/v1/billing/sync-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? 'Failed to sync checkout');
        }

        const data = (await res.json()) as SyncResult;
        setSyncResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    void syncCheckout();
  }, []);

  if (isLoading) {
    return (
      <ThemeProvider>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 18, color: 'var(--text-muted)' }}>Confirming your subscription...</p>
          </div>
        </main>
      </ThemeProvider>
    );
  }

  if (error) {
    return (
      <ThemeProvider>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <h1 style={{ color: 'var(--accent-danger)' }}>Something went wrong</h1>
            <p style={{ color: 'var(--text-muted)' }}>{error}</p>
            <p style={{ fontSize: 14, color: 'var(--text-placeholder)' }}>
              Your payment may have still been processed. Please contact support if this issue persists.
            </p>
            <Link
              href="/dashboard"
              style={{
                display: 'inline-block',
                marginTop: 16,
                padding: '10px 20px',
                backgroundColor: 'var(--accent-primary-hover)',
                color: 'var(--bg-primary)',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              Go to dashboard
            </Link>
          </div>
        </main>
      </ThemeProvider>
    );
  }

  const planLabel = syncResult?.plan
    ? syncResult.plan.charAt(0) + syncResult.plan.slice(1).toLowerCase()
    : 'your plan';

  return (
    <ThemeProvider>
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
          <h1 style={{ marginBottom: 8 }}>Subscription activated!</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
            You are now on the <strong>{planLabel}</strong> plan.
          </p>
          {syncResult?.status && syncResult.status !== 'active' && (
            <p style={{ fontSize: 14, color: 'var(--text-placeholder)', marginBottom: 16 }}>
              Subscription status: {syncResult.status}
            </p>
          )}
          <Link
            href="/dashboard"
            style={{
              display: 'inline-block',
              marginTop: 24,
              padding: '12px 28px',
              backgroundColor: 'var(--accent-primary-hover)',
              color: 'var(--bg-primary)',
              borderRadius: 6,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Go to dashboard
          </Link>
        </div>
      </main>
    </ThemeProvider>
  );
}
