import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { stripe } from '../../services/stripe.service.js';

/**
 * POST /billing/cancel
 *
 * Sets cancel_at_period_end = true on the Stripe subscription.
 * The subscription remains active until the current billing period ends,
 * then Stripe sends a customer.subscription.deleted event.
 *
 * Registered in the protected scope (JWT required).
 */
export async function cancelRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/billing/cancel',
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;

      const subscription = await prisma.tenantSubscription.findUnique({
        where: { tenantId },
        select: { stripeSubscriptionId: true, currentPeriodEnd: true },
      });

      if (!subscription?.stripeSubscriptionId) {
        return reply.status(404).send({ error: 'No active Stripe subscription found for tenant' });
      }

      // Schedule cancellation at end of current billing period (not immediate)
      const updatedSub = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      // Mirror the cancelAtPeriodEnd flag in our database
      await prisma.tenantSubscription.update({
        where: { tenantId },
        data: { cancelAtPeriodEnd: true },
      });

      // Note: Stripe API 2026-02-25.clover removed current_period_end.
      // cancel_at is the timestamp when subscription will be canceled.
      return reply.status(200).send({
        cancelAtPeriodEnd: true,
        cancelAt: updatedSub.cancel_at,
      });
    },
  );
}
