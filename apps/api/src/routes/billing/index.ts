import type { FastifyInstance } from 'fastify';
import { webhookRoute } from './webhook.js';
import { createCheckoutIntentRoute } from './create-checkout-intent.js';
import { syncCheckoutRoute } from './sync-checkout.js';
import { invoicesRoute } from './invoices.js';
import { paymentMethodRoute } from './payment-method.js';
import { cancelRoute } from './cancel.js';

/**
 * Public billing routes — no JWT required.
 * Stripe webhooks use their own signature verification mechanism.
 */
export async function billingRoutes(app: FastifyInstance): Promise<void> {
  await app.register(webhookRoute);
}

/**
 * Authenticated billing routes — JWT required.
 * Registered in the protected scope (alongside v1Routes) in server.ts.
 */
export async function authenticatedBillingRoutes(app: FastifyInstance): Promise<void> {
  await app.register(createCheckoutIntentRoute);
  await app.register(syncCheckoutRoute);
  await app.register(invoicesRoute);
  await app.register(paymentMethodRoute);
  await app.register(cancelRoute);
}
