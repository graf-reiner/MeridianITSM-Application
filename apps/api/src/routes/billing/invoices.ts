import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { stripe } from '../../services/stripe.service.js';

/**
 * GET /billing/invoices
 *
 * Returns the last 20 invoices from Stripe for the tenant's customer.
 * Mapped to a simplified shape for the billing UI.
 *
 * Registered in the protected scope (JWT required).
 */
export async function invoicesRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/billing/invoices',
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;

      const subscription = await prisma.tenantSubscription.findUnique({
        where: { tenantId },
        select: { stripeCustomerId: true },
      });

      if (!subscription?.stripeCustomerId) {
        // No Stripe customer yet — return empty list (tenant may be on trial without payment method)
        return reply.status(200).send({ invoices: [] });
      }

      const invoiceList = await stripe.invoices.list({
        customer: subscription.stripeCustomerId,
        limit: 20,
      });

      const invoices = invoiceList.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountDue: inv.amount_due,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        created: inv.created,
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
        pdfUrl: inv.invoice_pdf ?? null,
      }));

      return reply.status(200).send({ invoices });
    },
  );
}
