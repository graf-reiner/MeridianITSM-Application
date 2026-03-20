import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { stripe, mapStripeStatus } from '../../services/stripe.service.js';
import { redis } from '../../lib/redis.js';

/**
 * POST /billing/sync-checkout
 *
 * Resolves the webhook race condition after Stripe Elements redirect.
 * Queries Stripe directly (not relying on webhook delivery) to get the latest subscription state.
 * Invalidates Redis plan cache so planGate reflects the new status immediately.
 *
 * Registered in the protected scope (JWT required).
 */
export async function syncCheckoutRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/billing/sync-checkout',
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;

      const subscription = await prisma.tenantSubscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      });

      if (!subscription) {
        return reply.status(404).send({ error: 'No subscription record found for tenant' });
      }

      if (!subscription.stripeSubscriptionId) {
        return reply.status(400).send({ error: 'No Stripe subscription ID on record — checkout may not be complete' });
      }

      // Query Stripe directly to bypass webhook delivery delays (race condition resolver)
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

      const newStatus = mapStripeStatus(stripeSub.status);

      // Note: Stripe API 2026-02-25.clover removed current_period_start/end fields.
      // We use billing_cycle_anchor as the period reference and cancel_at for end date.
      // Update local subscription status
      await prisma.tenantSubscription.update({
        where: { tenantId },
        data: {
          status: newStatus,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
        },
      });

      // Invalidate planGate Redis cache so next request fetches fresh plan data
      await redis.del(`plan:${tenantId}`);

      return reply.status(200).send({
        status: stripeSub.status,
        plan: subscription.plan.name,
      });
    },
  );
}
