import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@meridian/db';
import { redis } from '../lib/redis.js';
import {
  isFeatureResource,
  getLimitKey,
  type PlanResource,
  type PlanLimits,
} from '@meridian/core';
import type { SubscriptionPlanTierValue } from '../services/stripe.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of the data we cache in Redis (keyed by `plan:${tenantId}`) */
interface CachedPlanData {
  status: string;
  tier: string;
  limitsJson: PlanLimits;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ['ACTIVE', 'TRIALING'] as const;

/**
 * Returns the next subscription tier up from the current tier.
 * Derived from the plan name stored in limitsJson context.
 */
function upgradeTierFor(tier: string): SubscriptionPlanTierValue {
  switch (tier) {
    case 'STARTER':
      return 'PROFESSIONAL';
    case 'PROFESSIONAL':
      return 'BUSINESS';
    case 'BUSINESS':
      return 'ENTERPRISE';
    default:
      return 'ENTERPRISE';
  }
}

/**
 * Fetches the plan data for a tenant — either from Redis cache or Postgres.
 * Returns null when no subscription exists.
 * Writes to Redis with a 60-second TTL on DB hit.
 */
async function getPlanData(tenantId: string): Promise<CachedPlanData | null> {
  const cacheKey = `plan:${tenantId}`;

  // 1. Try Redis cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as CachedPlanData;
  }

  // 2. Cache miss — query DB
  const tenantSub = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });

  if (!tenantSub) {
    return null;
  }

  const data: CachedPlanData = {
    status: tenantSub.status,
    tier: tenantSub.plan.name,
    limitsJson: tenantSub.plan.limitsJson as unknown as PlanLimits,
  };

  // 3. Cache for 60 seconds
  await redis.setex(cacheKey, 60, JSON.stringify(data));

  return data;
}

/**
 * Core enforcement logic — shared between planGatePreHandler and planGate().
 * Returns true if the request should be blocked (reply already sent).
 */
async function enforce(
  tenantId: string,
  reply: FastifyReply,
  resource?: PlanResource,
  currentCountFn?: (tenantId: string) => Promise<number>,
): Promise<boolean> {
  const planData = await getPlanData(tenantId);

  // No subscription at all
  if (!planData) {
    reply.status(402).send({ error: 'NO_SUBSCRIPTION' });
    return true;
  }

  // Subscription is not active
  if (!(ACTIVE_STATUSES as readonly string[]).includes(planData.status)) {
    reply.status(402).send({ error: 'SUBSCRIPTION_INACTIVE', status: planData.status });
    return true;
  }

  // No resource specified — status check only (used by planGatePreHandler)
  if (!resource) {
    return false;
  }

  const limits = planData.limitsJson;
  const upgradeTier = upgradeTierFor(planData.tier);

  // Feature flag check
  if (isFeatureResource(resource)) {
    const features = limits.features ?? [];
    if (!features.includes(resource)) {
      reply.status(402).send({
        error: 'PLAN_LIMIT_EXCEEDED',
        feature: resource,
        upgradeTier,
      });
      return true;
    }
    return false;
  }

  // Numeric limit check
  if (currentCountFn) {
    const limitKey = getLimitKey(resource);

    // null limitKey means this resource has no numeric limit in limitsJson — subscription-status
    // check only (e.g. 'tickets' is unlimited across all plans)
    if (limitKey !== null) {
      const limit = limits[limitKey] as number;

      // -1 means unlimited
      if (limit !== -1) {
        const current = await currentCountFn(tenantId);
        if (current >= limit) {
          reply.status(402).send({
            error: 'PLAN_LIMIT_EXCEEDED',
            limit,
            current,
            feature: resource,
            upgradeTier,
          });
          return true;
        }
      }
    }
  }

  return false;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Global preHandler — registered on ALL protected routes via protectedApp.addHook().
 * Checks subscription status ONLY (not numeric limits — those require knowing which resource).
 * Passes through for ACTIVE and TRIALING subscriptions.
 * Returns 402 for CANCELED, SUSPENDED, or missing subscriptions.
 */
export async function planGatePreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { tenantId } = request.user as { tenantId: string };
  await enforce(tenantId, reply);
}

/**
 * Route-level plan gate — returns a preHandler for specific resource enforcement.
 *
 * Usage:
 *   // Feature flag check:
 *   app.post('/cmdb/items', { preHandler: [planGate('cmdb')] }, handler)
 *
 *   // Numeric limit check:
 *   app.post('/users', { preHandler: [planGate('users', (tid) => countUsers(tid))] }, handler)
 *
 * The returned handler:
 *   1. Checks subscription status (ACTIVE/TRIALING required)
 *   2. For feature resources: checks if resource is in plan.limitsJson.features[]
 *   3. For numeric resources (with countFn): checks current count against plan limit
 *   4. Returns 402 with structured JSON on violation
 */
export function planGate(
  resource: PlanResource,
  currentCountFn?: (tenantId: string) => Promise<number>,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function planGateResourceHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { tenantId } = request.user as { tenantId: string };
    await enforce(tenantId, reply, resource, currentCountFn);
  };
}
