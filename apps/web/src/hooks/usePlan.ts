'use client';

import { useQuery } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Subscription tier values matching the SubscriptionPlanTier Prisma enum */
type PlanTier = 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE';

/** Subscription status values matching the SubscriptionStatus Prisma enum */
type PlanStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';

/** Shape of the response from GET /api/v1/billing/plan */
export interface PlanContext {
  tier: PlanTier;
  status: PlanStatus;
  limits: {
    maxUsers: number;
    maxAgents: number;
    maxSites: number;
    features: string[];
  };
  trialEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: string | null;
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchPlan(): Promise<PlanContext> {
  const res = await fetch('/api/v1/billing/plan', {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch plan: ${res.status}`);
  }
  return res.json() as Promise<PlanContext>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * usePlan() — React hook providing plan-aware UI gating.
 *
 * Fetches the tenant's current plan from GET /api/v1/billing/plan.
 * staleTime matches the planGate Redis TTL (60s) to avoid stale enforcement.
 *
 * Usage:
 *   const { plan, hasFeature, isActive, isTrial, isWithinLimit } = usePlan();
 *
 *   if (!hasFeature('cmdb')) return <UpgradePrompt feature="cmdb" />;
 *   if (!isWithinLimit('users', currentUserCount)) return <UpgradePrompt feature="users" />;
 */
export function usePlan() {
  const { data: plan, isLoading } = useQuery<PlanContext>({
    queryKey: ['plan'],
    queryFn: fetchPlan,
    staleTime: 60_000, // 60s — matches planGate Redis TTL
  });

  /**
   * Returns true if the given feature is included in the plan's features array.
   * Features: 'cmdb', 'mobile', 'webhooks', 'api_access', 'scheduled_reports'
   */
  function hasFeature(feature: string): boolean {
    return plan?.limits.features.includes(feature) ?? false;
  }

  /**
   * Returns true if the subscription is currently active (ACTIVE or TRIALING).
   */
  function isActive(): boolean {
    return plan?.status === 'ACTIVE' || plan?.status === 'TRIALING';
  }

  /**
   * Returns true if the subscription is in the TRIALING state.
   */
  function isTrial(): boolean {
    return plan?.status === 'TRIALING';
  }

  /**
   * Returns true if the current usage count is within the plan's limit for a resource.
   * Resource corresponds to a numeric limit: 'users' -> maxUsers, 'agents' -> maxAgents, 'sites' -> maxSites.
   * Returns true (allow) when plan data is not yet loaded.
   * Returns true when the plan limit is -1 (unlimited).
   *
   * @param resource - 'users' | 'agents' | 'sites'
   * @param current - The current count of the resource for this tenant
   */
  function isWithinLimit(resource: string, current: number): boolean {
    if (!plan) return true; // Optimistically allow until plan loads

    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const limitKey = `max${capitalize(resource)}` as keyof PlanContext['limits'];
    const limit = plan.limits[limitKey] as number | undefined;

    if (limit === undefined) return true; // Unknown resource — allow
    if (limit === -1) return true; // -1 = unlimited

    return current < limit;
  }

  return {
    plan,
    isLoading,
    hasFeature,
    isActive,
    isTrial,
    isWithinLimit,
  };
}
