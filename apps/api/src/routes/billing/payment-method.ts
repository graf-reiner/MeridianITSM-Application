import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@meridian/db';
import { stripe } from '../../services/stripe.service.js';

const updatePaymentMethodBodySchema = z.object({
  paymentMethodId: z.string().min(1),
});

/**
 * POST /billing/update-payment-method
 *
 * Attaches a new payment method to the Stripe customer and sets it as the default
 * for future invoices. The payment method must already be confirmed via Stripe Elements.
 *
 * Registered in the protected scope (JWT required).
 */
export async function paymentMethodRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/billing/update-payment-method',
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;

      const parseResult = updatePaymentMethodBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid request body', details: parseResult.error.issues });
      }

      const { paymentMethodId } = parseResult.data;

      const subscription = await prisma.tenantSubscription.findUnique({
        where: { tenantId },
        select: { stripeCustomerId: true },
      });

      if (!subscription?.stripeCustomerId) {
        return reply.status(404).send({ error: 'No Stripe customer found for tenant' });
      }

      const stripeCustomerId = subscription.stripeCustomerId;

      // Attach payment method to the customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId,
      });

      // Set as the default payment method for future invoices
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      return reply.status(200).send({ success: true });
    },
  );
}
