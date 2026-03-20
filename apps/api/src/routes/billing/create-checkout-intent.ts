import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@meridian/db';
import { stripe } from '../../services/stripe.service.js';

const createCheckoutIntentBodySchema = z.object({
  priceId: z.string().min(1),
});

/**
 * POST /billing/create-checkout-intent
 *
 * Creates a Stripe subscription with deferred intent (payment_behavior: 'default_incomplete').
 * Returns clientSecret + subscriptionId for Stripe Elements confirmation on the frontend.
 *
 * Registered in the protected scope (JWT required).
 */
export async function createCheckoutIntentRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/billing/create-checkout-intent',
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;

      const parseResult = createCheckoutIntentBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid request body', details: parseResult.error.issues });
      }

      const { priceId } = parseResult.data;

      // Fetch or create Stripe customer
      let subscription = await prisma.tenantSubscription.findUnique({
        where: { tenantId },
      });

      if (!subscription) {
        return reply.status(404).send({ error: 'No subscription record found for tenant' });
      }

      let stripeCustomerId = subscription.stripeCustomerId;

      if (!stripeCustomerId) {
        // Create Stripe customer with tenantId metadata for webhook correlation
        const customer = await stripe.customers.create({
          metadata: { tenantId },
        });
        stripeCustomerId = customer.id;

        // Save stripeCustomerId to TenantSubscription
        await prisma.tenantSubscription.update({
          where: { tenantId },
          data: { stripeCustomerId },
        });
      }

      // Create subscription with deferred intent pattern
      // payment_behavior: 'default_incomplete' — subscription starts incomplete, payment confirmed client-side
      const stripeSub = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      // Persist stripeSubscriptionId immediately (before payment confirmation)
      await prisma.tenantSubscription.update({
        where: { tenantId },
        data: { stripeSubscriptionId: stripeSub.id },
      });

      // Extract client_secret from the expanded latest_invoice.payment_intent
      const latestInvoice = stripeSub.latest_invoice;
      if (
        !latestInvoice ||
        typeof latestInvoice !== 'object' ||
        !('payment_intent' in latestInvoice) ||
        !latestInvoice.payment_intent ||
        typeof latestInvoice.payment_intent !== 'object' ||
        !('client_secret' in latestInvoice.payment_intent)
      ) {
        return reply.status(500).send({ error: 'Could not retrieve payment intent client secret from Stripe' });
      }

      const clientSecret = (latestInvoice.payment_intent as { client_secret: string | null }).client_secret;

      if (!clientSecret) {
        return reply.status(500).send({ error: 'Payment intent client secret is null' });
      }

      return reply.status(200).send({
        clientSecret,
        subscriptionId: stripeSub.id,
      });
    },
  );
}
