'use client';

import { useState, useEffect, useCallback } from 'react';

type SubscriptionPlanTier = 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE';

interface PlanLimits {
  maxUsers: number;
  maxAgents: number;
  maxSites: number;
  features: string[];
}

interface Plan {
  id: string;
  name: SubscriptionPlanTier;
  displayName: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  limitsJson: PlanLimits;
  stripePriceIdMonthly: string | null;
  stripePriceIdAnnual: string | null;
  isPublic: boolean;
  activeCount: number;
  createdAt: string;
  updatedAt: string;
}

interface EditFormState {
  displayName: string;
  monthlyPriceUsd: string;
  annualPriceUsd: string;
  maxUsers: string;
  maxAgents: string;
  maxSites: string;
  features: string;
  stripePriceIdMonthly: string;
  stripePriceIdAnnual: string;
  isPublic: boolean;
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('owner_access_token');
}

function planToFormState(plan: Plan): EditFormState {
  return {
    displayName: plan.displayName,
    monthlyPriceUsd: String(plan.monthlyPriceUsd),
    annualPriceUsd: String(plan.annualPriceUsd),
    maxUsers: String(plan.limitsJson.maxUsers),
    maxAgents: String(plan.limitsJson.maxAgents),
    maxSites: String(plan.limitsJson.maxSites),
    features: plan.limitsJson.features.join(', '),
    stripePriceIdMonthly: plan.stripePriceIdMonthly ?? '',
    stripePriceIdAnnual: plan.stripePriceIdAnnual ?? '',
    isPublic: plan.isPublic,
  };
}

const TIER_COLORS: Record<SubscriptionPlanTier, string> = {
  STARTER: '#6b7280',
  PROFESSIONAL: '#2563eb',
  BUSINESS: '#7c3aed',
  ENTERPRISE: '#b45309',
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<EditFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/plans', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { plans: Plan[] };
      setPlans(json.plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setFormState(planToFormState(plan));
    setSaveError(null);
    setSaveSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setFormState(null);
    setSaveError(null);
  }

  async function savePlan(planId: string) {
    if (!formState) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const body = {
      displayName: formState.displayName,
      monthlyPriceUsd: parseFloat(formState.monthlyPriceUsd),
      annualPriceUsd: parseFloat(formState.annualPriceUsd),
      limitsJson: {
        maxUsers: parseInt(formState.maxUsers, 10),
        maxAgents: parseInt(formState.maxAgents, 10),
        maxSites: parseInt(formState.maxSites, 10),
        features: formState.features.split(',').map(f => f.trim()).filter(Boolean),
      },
      stripePriceIdMonthly: formState.stripePriceIdMonthly || null,
      stripePriceIdAnnual: formState.stripePriceIdAnnual || null,
      isPublic: formState.isPublic,
    };

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/plans/${planId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSaveSuccess('Plan updated successfully');
      setEditingId(null);
      setFormState(null);
      await fetchPlans();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px', color: '#6b7280' }}>Loading plans...</div>;
  }

  if (error) {
    return <div style={{ padding: '24px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#991b1b' }}>Error: {error}</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>Subscription Plans</h1>
        <p style={{ color: '#6b7280', marginTop: '4px' }}>Manage plan tiers, pricing, and feature limits</p>
      </div>

      {saveSuccess && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', backgroundColor: '#dcfce7', borderRadius: '6px', color: '#166534', fontSize: '14px' }}>
          {saveSuccess}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
        {plans.map(plan => (
          <div
            key={plan.id}
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
          >
            {/* Plan Header */}
            <div
              style={{
                padding: '16px 20px',
                backgroundColor: TIER_COLORS[plan.name] ?? '#6b7280',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>{plan.displayName}</h2>
                <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.85 }}>Tier: {plan.name}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: '11px', opacity: 0.85 }}>Active Subscribers</p>
                <p style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>{plan.activeCount}</p>
              </div>
            </div>

            {/* Plan Body */}
            {editingId === plan.id && formState ? (
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
                    Display Name
                    <input
                      type="text"
                      value={formState.displayName}
                      onChange={e => setFormState(prev => prev ? { ...prev, displayName: e.target.value } : prev)}
                      style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </label>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
                    Monthly Price (USD)
                    <input
                      type="number"
                      value={formState.monthlyPriceUsd}
                      onChange={e => setFormState(prev => prev ? { ...prev, monthlyPriceUsd: e.target.value } : prev)}
                      step="0.01"
                      style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </label>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
                    Annual Price (USD)
                    <input
                      type="number"
                      value={formState.annualPriceUsd}
                      onChange={e => setFormState(prev => prev ? { ...prev, annualPriceUsd: e.target.value } : prev)}
                      step="0.01"
                      style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </label>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
                    Max Users
                    <input
                      type="number"
                      value={formState.maxUsers}
                      onChange={e => setFormState(prev => prev ? { ...prev, maxUsers: e.target.value } : prev)}
                      style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </label>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
                    Max Agents
                    <input
                      type="number"
                      value={formState.maxAgents}
                      onChange={e => setFormState(prev => prev ? { ...prev, maxAgents: e.target.value } : prev)}
                      style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </label>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
                    Max Sites
                    <input
                      type="number"
                      value={formState.maxSites}
                      onChange={e => setFormState(prev => prev ? { ...prev, maxSites: e.target.value } : prev)}
                      style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </label>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151', gridColumn: '1 / -1' }}>
                    Features (comma-separated)
                    <input
                      type="text"
                      value={formState.features}
                      onChange={e => setFormState(prev => prev ? { ...prev, features: e.target.value } : prev)}
                      placeholder="cmdb, mobile, webhooks, sso"
                      style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </label>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
                    Stripe Price ID (Monthly)
                    <input
                      type="text"
                      value={formState.stripePriceIdMonthly}
                      onChange={e => setFormState(prev => prev ? { ...prev, stripePriceIdMonthly: e.target.value } : prev)}
                      placeholder="price_xxx"
                      style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </label>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
                    Stripe Price ID (Annual)
                    <input
                      type="text"
                      value={formState.stripePriceIdAnnual}
                      onChange={e => setFormState(prev => prev ? { ...prev, stripePriceIdAnnual: e.target.value } : prev)}
                      placeholder="price_xxx"
                      style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </label>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', cursor: 'pointer', marginBottom: '12px' }}>
                  <input
                    type="checkbox"
                    checked={formState.isPublic}
                    onChange={e => setFormState(prev => prev ? { ...prev, isPublic: e.target.checked } : prev)}
                  />
                  Public (visible to new subscribers)
                </label>

                {saveError && (
                  <p style={{ color: '#dc2626', fontSize: '12px', margin: '0 0 8px' }}>Error: {saveError}</p>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => void savePlan(plan.id)}
                    disabled={saving}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: '500',
                      backgroundColor: saving ? '#9ca3af' : '#4338ca',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: '500',
                      backgroundColor: '#fff',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Monthly</p>
                    <p style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                      ${plan.monthlyPriceUsd}/mo
                    </p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Annual</p>
                    <p style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                      ${plan.annualPriceUsd}/yr
                    </p>
                  </div>
                </div>

                <div style={{ marginBottom: '12px', fontSize: '13px', color: '#374151' }}>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '4px' }}>
                    <span>Users: <strong>{plan.limitsJson.maxUsers}</strong></span>
                    <span>Agents: <strong>{plan.limitsJson.maxAgents}</strong></span>
                    <span>Sites: <strong>{plan.limitsJson.maxSites}</strong></span>
                  </div>
                  {plan.limitsJson.features.length > 0 && (
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>
                      Features: {plan.limitsJson.features.join(', ')}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => startEdit(plan)}
                    style={{
                      padding: '6px 14px',
                      fontSize: '13px',
                      fontWeight: '500',
                      backgroundColor: '#4338ca',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Edit Plan
                  </button>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: plan.isPublic ? '#dcfce7' : '#f3f4f6',
                      color: plan.isPublic ? '#166534' : '#6b7280',
                      fontWeight: '500',
                    }}
                  >
                    {plan.isPublic ? 'Public' : 'Archived'}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
