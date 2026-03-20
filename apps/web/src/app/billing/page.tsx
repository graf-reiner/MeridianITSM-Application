'use client';

import { useState, useEffect, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { usePlan } from '../../hooks/usePlan';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: number;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
}

interface UsageStats {
  currentUsers: number;
  currentAgents: number;
  currentSites: number;
}

// ─── Update Payment Method Form ───────────────────────────────────────────────

function UpdatePaymentMethodForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);
    setErrorMessage(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setErrorMessage(submitError.message ?? 'Validation failed');
      setIsLoading(false);
      return;
    }

    // Create a SetupIntent on the server, then confirm with Elements
    // For now we use confirmSetup which internally creates a SetupIntent
    // The payment method ID is sent back via the return_url flow
    const { error } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/billing?updated=1`,
      },
    });

    if (error) {
      setErrorMessage(error.message ?? 'Failed to update payment method');
    } else {
      onSuccess();
    }

    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      <PaymentElement />
      {errorMessage && <p style={{ color: '#dc2626', marginTop: 8, fontSize: 14 }}>{errorMessage}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, padding: '8px 16px' }}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || isLoading}
          style={{
            flex: 2,
            padding: '8px 16px',
            backgroundColor: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? 'Updating...' : 'Update payment method'}
        </button>
      </div>
    </form>
  );
}

// ─── Cancel Confirmation Modal ────────────────────────────────────────────────

function CancelModal({ onConfirm, onClose, isLoading }: {
  onConfirm: () => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 32, maxWidth: 440, width: '100%' }}>
        <h2 style={{ marginTop: 0 }}>Cancel subscription?</h2>
        <p style={{ color: '#6b7280' }}>
          Your subscription will remain active until the end of the current billing period.
          You will not be charged again after cancellation.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 16px' }}>
            Keep subscription
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '10px 16px',
              backgroundColor: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Cancelling...' : 'Cancel subscription'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Billing Page ────────────────────────────────────────────────────────

/**
 * Billing management page — custom UI per CONTEXT.md (not Stripe Customer Portal).
 *
 * Displays:
 * - Current plan tier, status, trial end date (if trialing)
 * - Usage stats: current users/agents/sites vs plan limits
 * - Invoice history from Stripe
 * - Payment method update form (Stripe Elements SetupIntent)
 * - Cancel subscription with confirmation modal
 */
export default function BillingPage() {
  const { plan, isLoading: planLoading, isTrial } = usePlan();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Placeholder usage stats — will be populated via a real usage endpoint in a later plan
  const usage: UsageStats = { currentUsers: 0, currentAgents: 0, currentSites: 0 };

  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    setInvoicesError(null);
    try {
      const res = await fetch('/api/v1/billing/invoices', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to fetch invoices: ${res.status}`);
      const data = (await res.json()) as { invoices: Invoice[] };
      setInvoices(data.invoices);
    } catch (err) {
      setInvoicesError(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  const handleCancel = async () => {
    setCancelLoading(true);
    setCancelError(null);
    try {
      const res = await fetch('/api/v1/billing/cancel', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Cancellation failed');
      }
      setCancelSuccess(true);
      setShowCancelModal(false);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Cancellation failed');
    } finally {
      setCancelLoading(false);
    }
  };

  const formatCurrency = (amountCents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  };

  const formatDate = (unixTimestamp: number) => {
    return new Date(unixTimestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (planLoading) {
    return (
      <main style={{ padding: 32 }}>
        <p>Loading billing information...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 32, maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 32 }}>Billing</h1>

      {/* ── Current Plan ── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ marginBottom: 16 }}>Current plan</h2>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
          {plan ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>
                  {plan.tier.charAt(0) + plan.tier.slice(1).toLowerCase()}
                </span>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 500,
                    backgroundColor:
                      plan.status === 'ACTIVE' ? '#d1fae5' :
                      plan.status === 'TRIALING' ? '#dbeafe' :
                      plan.status === 'PAST_DUE' ? '#fef3c7' : '#fee2e2',
                    color:
                      plan.status === 'ACTIVE' ? '#065f46' :
                      plan.status === 'TRIALING' ? '#1e40af' :
                      plan.status === 'PAST_DUE' ? '#92400e' : '#991b1b',
                  }}
                >
                  {plan.status.replace(/_/g, ' ')}
                </span>
              </div>
              {isTrial() && plan.trialEnd && (
                <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
                  Trial ends: {new Date(plan.trialEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
              {cancelSuccess || plan.cancelAtPeriodEnd ? (
                <p style={{ color: '#dc2626', fontSize: 14, marginTop: 8 }}>
                  Subscription scheduled for cancellation at end of billing period.
                </p>
              ) : null}
            </>
          ) : (
            <p style={{ color: '#6b7280' }}>No active subscription.</p>
          )}
        </div>
      </section>

      {/* ── Usage ── */}
      {plan && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ marginBottom: 16 }}>Usage</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { label: 'Users', current: usage.currentUsers, max: plan.limits.maxUsers },
              { label: 'Agents', current: usage.currentAgents, max: plan.limits.maxAgents },
              { label: 'Sites', current: usage.currentSites, max: plan.limits.maxSites },
            ].map(({ label, current, max }) => (
              <div key={label} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                <p style={{ margin: '0 0 4px', color: '#6b7280', fontSize: 13 }}>{label}</p>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                  {current}
                  <span style={{ fontSize: 14, fontWeight: 400, color: '#9ca3af' }}>
                    {' '}/ {max === -1 ? 'unlimited' : max}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Invoices ── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ marginBottom: 16 }}>Invoice history</h2>
        {invoicesLoading ? (
          <p style={{ color: '#6b7280' }}>Loading invoices...</p>
        ) : invoicesError ? (
          <p style={{ color: '#dc2626' }}>{invoicesError}</p>
        ) : invoices.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No invoices yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Invoice</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Amount</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '8px 12px', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 12px' }}>{formatDate(inv.created)}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{inv.number ?? inv.id}</td>
                  <td style={{ padding: '10px 12px' }}>{formatCurrency(inv.amountDue, inv.currency)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 500,
                        backgroundColor: inv.status === 'paid' ? '#d1fae5' : inv.status === 'open' ? '#fef3c7' : '#f3f4f6',
                        color: inv.status === 'paid' ? '#065f46' : inv.status === 'open' ? '#92400e' : '#374151',
                      }}
                    >
                      {inv.status ?? 'unknown'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {inv.pdfUrl && (
                      <a
                        href={inv.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#6366f1', fontSize: 13, marginRight: 8 }}
                      >
                        PDF
                      </a>
                    )}
                    {inv.hostedInvoiceUrl && (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#6366f1', fontSize: 13 }}
                      >
                        View
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Payment Method ── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ marginBottom: 16 }}>Payment method</h2>
        {showPaymentForm ? (
          <Elements stripe={stripePromise} options={{ mode: 'setup', currency: 'usd' }}>
            <UpdatePaymentMethodForm
              onSuccess={() => setShowPaymentForm(false)}
              onCancel={() => setShowPaymentForm(false)}
            />
          </Elements>
        ) : (
          <button
            onClick={() => setShowPaymentForm(true)}
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              cursor: 'pointer',
              backgroundColor: '#fff',
            }}
          >
            Update payment method
          </button>
        )}
      </section>

      {/* ── Cancel Subscription ── */}
      {plan && !plan.cancelAtPeriodEnd && !cancelSuccess && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ marginBottom: 8, color: '#dc2626' }}>Cancel subscription</h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
            Your access will continue until the end of the current billing period.
          </p>
          {cancelError && <p style={{ color: '#dc2626', marginBottom: 8 }}>{cancelError}</p>}
          <button
            onClick={() => setShowCancelModal(true)}
            style={{
              padding: '10px 20px',
              border: '1px solid #dc2626',
              borderRadius: 6,
              cursor: 'pointer',
              backgroundColor: '#fff',
              color: '#dc2626',
            }}
          >
            Cancel subscription
          </button>
        </section>
      )}

      {showCancelModal && (
        <CancelModal
          onConfirm={() => void handleCancel()}
          onClose={() => setShowCancelModal(false)}
          isLoading={cancelLoading}
        />
      )}
    </main>
  );
}
