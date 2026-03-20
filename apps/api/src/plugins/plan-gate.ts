import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Plan gate preHandler — stub for Phase 1.
 * Phase 2 will implement actual plan/subscription enforcement:
 * - Check TenantSubscription usage vs. planLimitsJson
 * - Return 402 Payment Required when limits exceeded
 * - Check feature flags (CMDB, mobile, webhooks) in SubscriptionPlan.features[]
 */
export async function planGatePreHandler(
  _request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  // No-op in Phase 1 — all plan limits pass through
  return;
}
