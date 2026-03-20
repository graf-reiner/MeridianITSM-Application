import type { FastifyInstance } from 'fastify';
import { webhookRoute } from './webhook.js';

/**
 * Billing routes plugin — PUBLIC scope (no JWT required).
 *
 * Stripe webhooks use their own signature verification mechanism and do not
 * send JWT tokens. These routes are registered alongside health and auth routes
 * in the public scope.
 *
 * NOTE: Billing routes that DO require authentication (checkout, sync, invoices, etc.)
 * will be registered in the protected scope in a later plan.
 */
export async function billingRoutes(app: FastifyInstance): Promise<void> {
  await app.register(webhookRoute);
}
