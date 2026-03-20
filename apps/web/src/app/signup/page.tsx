'use client';

import { useState } from 'react';
import { SubscribeFlow } from './CheckoutForm';

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
 * Public signup page — new tenant registration.
 *
 * Step 1: Select a plan.
 * Step 2: Enter tenant name, admin email, password.
 * Step 3: Complete payment via Stripe Elements (CheckoutForm).
 *
 * Note: The full provisioning flow (create tenant + subscription linkage) will be
 * wired in Plan 05 with the provisioning endpoint. This page scaffolds the UI.
 */
export default function SignupPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanCard | null>(null);
  const [step, setStep] = useState<'select-plan' | 'account-details' | 'checkout'>('select-plan');
  const [tenantName, setTenantName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const handleSelectPlan = (plan: PlanCard) => {
    setSelectedPlan(plan);
    setStep('account-details');
  };

  const handleAccountDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('checkout');
  };

  if (step === 'checkout' && selectedPlan) {
    return (
      <main style={{ minHeight: '100vh', padding: '48px 24px', maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{ marginBottom: 8 }}>Subscribe to {selectedPlan.displayName}</h1>
        <p style={{ marginBottom: 24, color: '#6b7280' }}>{selectedPlan.monthlyPriceLabel}</p>
        <SubscribeFlow
          priceId={selectedPlan.priceId}
          amount={selectedPlan.monthlyPriceCents}
          onBack={() => setStep('account-details')}
        />
      </main>
    );
  }

  if (step === 'account-details' && selectedPlan) {
    return (
      <main style={{ minHeight: '100vh', padding: '48px 24px', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ marginBottom: 4 }}>Create your account</h1>
        <p style={{ color: '#6b7280', marginBottom: 24 }}>
          Plan: <strong>{selectedPlan.displayName}</strong> — {selectedPlan.monthlyPriceLabel}
        </p>
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
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="Acme IT Services"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
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
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
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
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="button" onClick={() => setStep('select-plan')} style={{ flex: 1, padding: '10px 16px' }}>
              Back
            </button>
            <button
              type="submit"
              style={{
                flex: 2,
                padding: '10px 16px',
                backgroundColor: '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Continue to payment
            </button>
          </div>
        </form>
      </main>
    );
  }

  // Step 1: Plan selection
  return (
    <main style={{ minHeight: '100vh', padding: '48px 24px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Choose your plan</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: 40 }}>
          Start free for 14 days. No credit card required until your trial ends.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
          {PLAN_CARDS.map((plan) => (
            <div
              key={plan.tier}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20 }}>{plan.displayName}</h2>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{plan.monthlyPriceLabel}</p>
              <ul style={{ paddingLeft: 20, margin: 0, color: '#374151', fontSize: 14 }}>
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
                  backgroundColor: '#6366f1',
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
  );
}
