import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * GET /api/v1/billing/plan
 *
 * Returns the tenant's current subscription plan details:
 * tier, status, limits (maxUsers, maxAgents, maxSites, features[]),
 * trial dates, and cancellation state.
 *
 * Registered in the v1 protected scope (JWT + planGatePreHandler applied).
 * staleTime on the frontend is 60s (matches Redis planGate TTL).
 */
export async function billingPlanRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/v1/billing/plan', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;

    const tenantSub = await prisma.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!tenantSub) {
      return reply.status(404).send({ error: 'No subscription found for this tenant' });
    }

    const limits = tenantSub.plan.limitsJson as {
      maxUsers: number;
      maxAgents: number;
      maxSites: number;
      features: string[];
    };

    return reply.status(200).send({
      tier: tenantSub.plan.name,
      status: tenantSub.status,
      limits: {
        maxUsers: limits.maxUsers,
        maxAgents: limits.maxAgents,
        maxSites: limits.maxSites,
        features: limits.features ?? [],
      },
      trialEnd: tenantSub.trialEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: tenantSub.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: tenantSub.currentPeriodEnd?.toISOString() ?? null,
    });
  });
}
