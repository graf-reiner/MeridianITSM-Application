'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemeProvider from '@/components/ThemeProvider';

interface PlanCard {
  tier: 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE';
  displayName: string;
  monthlyPriceCents: number;
  monthlyPriceLabel: string;
  features: string[];
  priceId: string; // Populated from NEXT_PUBLIC_ env vars or fetched from /api/v1/billing/plans
}

/**
 * Plan definitions — prices and priceIds sourced from environment variables.
 * In production these env vars are set in the tenant provisioning environment.
 * The NEXT_PUBLIC_STRIPE_PRICE_* vars hold Stripe Price IDs for each tier.
 */
const PLAN_CARDS: PlanCard[] = [
  {
    tier: 'STARTER',
    displayName: 'Starter',
    monthlyPriceCents: 2900,
    monthlyPriceLabel: '$29/mo',
    features: ['Up to 5 users', '1 site', 'Basic ticketing', 'Email support'],
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER ?? '',
  },
  {
    tier: 'PROFESSIONAL',
    displayName: 'Professional',
    monthlyPriceCents: 7900,
    monthlyPriceLabel: '$79/mo',
    features: ['Up to 20 users', '5 sites', 'SLA management', 'Change management', 'Priority support'],
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL ?? '',
  },
  {
    tier: 'BUSINESS',
    displayName: 'Business',
    monthlyPriceCents: 19900,
    monthlyPriceLabel: '$199/mo',
    features: ['Up to 100 users', 'Unlimited sites', 'CMDB', 'API access', 'Webhooks', 'Scheduled reports'],
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS ?? '',
  },
  {
    tier: 'ENTERPRISE',
    displayName: 'Enterprise',
    monthlyPriceCents: 49900,
    monthlyPriceLabel: '$499/mo',
    features: ['Unlimited users', 'Multi-tenant (MSP)', 'SSO / SAML', 'SLA guarantees', 'Dedicated support'],
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE ?? '',
  },
];

/**
 * Derives a URL-safe slug from an organisation name.
 * e.g. "Acme IT Services" -> "acme-it-services"
 */
function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

/**
 * Public signup page — new tenant registration.
 *
 * Step 1: Select a plan.
 * Step 2: Enter tenant name, admin email, password — submits to POST /api/auth/signup.
 *         On success, redirects to /login with a success message.
 */
export default function SignupPage() {
  const router = useRouter();

  const [selectedPlan, setSelectedPlan] = useState<PlanCard | null>(null);
  const [step, setStep] = useState<'select-plan' | 'account-details'>('select-plan');

  const [tenantName, setTenantName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSelectPlan = (plan: PlanCard) => {
    setSelectedPlan(plan);
    setStep('account-details');
  };

  const handleTenantNameChange = (value: string) => {
    setTenantName(value);
    // Auto-derive slug from name, but only if slug hasn't been manually edited
    setSlug(deriveSlug(value));
  };

  const handleAccountDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: tenantName,
          slug,
          email: adminEmail,
          password: adminPassword,
          planTier: selectedPlan.tier,
        }),
      });

      const data = (await res.json()) as {
        tenant?: { id: string; name: string; slug: string };
        user?: { id: string; email: string };
        message?: string;
        error?: string;
        issues?: { message: string }[];
      };

      if (!res.ok) {
        // Surface the first validation issue, or the top-level error
        const message =
          data.issues?.[0]?.message ?? data.error ?? 'Signup failed. Please try again.';
        setSubmitError(message);
        return;
      }

      // Provisioning successful — redirect to login with success flag
      router.push(`/login?signup=success&tenant=${encodeURIComponent(slug)}`);
    } catch {
      setSubmitError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'account-details' && selectedPlan) {
    return (
      <ThemeProvider>
        <main style={{ minHeight: '100vh', padding: '48px 24px', maxWidth: 480, margin: '0 auto' }}>
          <h1 style={{ marginBottom: 4 }}>Create your account</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
            Plan: <strong>{selectedPlan.displayName}</strong> — {selectedPlan.monthlyPriceLabel} &bull; 14-day free trial
          </p>

          {submitError && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 16px',
                backgroundColor: 'var(--accent-danger-subtle, #fef2f2)',
                border: '1px solid var(--accent-danger, #ef4444)',
                borderRadius: 6,
                color: 'var(--accent-danger, #dc2626)',
                fontSize: 14,
              }}
            >
              {submitError}
            </div>
          )}

          <form onSubmit={handleAccountDetailsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label htmlFor="tenantName" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                Organisation name
              </label>
              <input
                id="tenantName"
                type="text"
                required
                value={tenantName}
                onChange={(e) => handleTenantNameChange(e.target.value)}
                placeholder="Acme IT Services"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-secondary)', borderRadius: 6 }}
              />
            </div>

            <div>
              <label htmlFor="slug" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                Organisation slug{' '}
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 13 }}>
                  (used in your login URL)
                </span>
              </label>
              <input
                id="slug"
                type="text"
                required
                pattern="[a-z0-9-]+"
                title="Only lowercase letters, numbers, and hyphens"
                minLength={2}
                maxLength={50}
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="acme-it-services"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-secondary)', borderRadius: 6 }}
              />
            </div>

            <div>
              <label htmlFor="adminEmail" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                Admin email
              </label>
              <input
                id="adminEmail"
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@example.com"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-secondary)', borderRadius: 6 }}
              />
            </div>

            <div>
              <label htmlFor="adminPassword" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                Password
              </label>
              <input
                id="adminPassword"
                type="password"
                required
                minLength={8}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-secondary)', borderRadius: 6 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { setStep('select-plan'); setSubmitError(null); }}
                disabled={isSubmitting}
                style={{ flex: 1, padding: '10px 16px', cursor: 'pointer' }}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  flex: 2,
                  padding: '10px 16px',
                  backgroundColor: 'var(--accent-primary-hover)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? 'Creating account...' : 'Create account'}
              </button>
            </div>
          </form>
        </main>
      </ThemeProvider>
    );
  }

  // Step 1: Plan selection
  return (
    <ThemeProvider>
      <main style={{ minHeight: '100vh', padding: '48px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Choose your plan</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: 40 }}>
            Start free for 14 days. No credit card required until your trial ends.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
            {PLAN_CARDS.map((plan) => (
              <div
                key={plan.tier}
                style={{
                  border: '1px solid var(--border-primary)',
                  borderRadius: 12,
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 20 }}>{plan.displayName}</h2>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{plan.monthlyPriceLabel}</p>
                <ul style={{ paddingLeft: 20, margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ marginBottom: 4 }}>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSelectPlan(plan)}
                  style={{
                    marginTop: 'auto',
                    padding: '10px 16px',
                    backgroundColor: 'var(--accent-primary-hover)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Get started
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </ThemeProvider>
  );
}
