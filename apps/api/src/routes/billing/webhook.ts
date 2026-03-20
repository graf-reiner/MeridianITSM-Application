import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { stripe } from '../../services/stripe.service.js';

// Module augmentation to add rawBody to FastifyRequest
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

// Create BullMQ queue instance for stripe webhook events
// Uses the same host/port extraction pattern as apps/worker/src/queues/connection.ts
const stripeWebhookQueue = new Queue('stripe-webhook', {
  connection: {
    host: (() => {
      try {
        return new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname;
      } catch {
        return 'localhost';
      }
    })(),
    port: (() => {
      try {
        return Number(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port) || 6379;
      } catch {
        return 6379;
      }
    })(),
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  },
});

/**
 * Stripe webhook route.
 *
 * CRITICAL: This route must receive the raw body as a Buffer for Stripe signature verification.
 * We use preParsing hook to capture the raw body without disrupting other routes' JSON parsing.
 */
export async function webhookRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/billing/webhook',
    {
      config: { rawBody: true },
      preParsing: async (request, _reply, payload) => {
        // Collect raw body chunks into Buffer for Stripe signature verification
        const chunks: Buffer[] = [];
        for await (const chunk of payload) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        request.rawBody = Buffer.concat(chunks);
        // Return a readable stream of the same data for Fastify's parser
        const { Readable } = await import('node:stream');
        return Readable.from(request.rawBody);
      },
    },
    async (request, reply) => {
      const sig = request.headers['stripe-signature'];

      if (!sig || typeof sig !== 'string') {
        return reply.status(400).send({ error: 'Missing stripe-signature header' });
      }

      if (!request.rawBody) {
        return reply.status(400).send({ error: 'Missing request body' });
      }

      let event;
      try {
        event = stripe.webhooks.constructEvent(
          request.rawBody,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET!,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        request.log.warn(`[billing/webhook] Signature verification failed: ${message}`);
        return reply.status(400).send({ error: 'Webhook signature verification failed' });
      }

      // Enqueue immediately — do NOT process inline (Stripe retries on non-200 or >20s timeout)
      await stripeWebhookQueue.add('stripe-event', {
        eventId: event.id,
        eventType: event.type,
        payload: event,
      });

      request.log.info(`[billing/webhook] Enqueued event ${event.id} (${event.type})`);
      return reply.status(200).send({ received: true });
    },
  );
}
