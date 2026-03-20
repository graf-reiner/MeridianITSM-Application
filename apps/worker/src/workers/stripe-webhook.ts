import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';
import { Redis } from 'ioredis';

// Local Redis client for cache invalidation
// Uses same connection string as bullmqConnection host/port
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

// SubscriptionStatus values (mirrors Prisma enum — duplicated to avoid cross-app import)
type SubscriptionStatusValue = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';

/**
 * Maps a Stripe subscription status string to our internal SubscriptionStatus enum value.
 * Duplicated from apps/api/src/services/stripe.service.ts to avoid cross-app imports.
 */
function mapStripeStatus(stripeStatus: string): SubscriptionStatusValue {
  switch (stripeStatus) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'CANCELED';
    default:
      return 'SUSPENDED';
  }
}

/**
 * Finds a TenantSubscription by Stripe customer ID and updates its status.
 * Returns the tenantId for cache invalidation.
 */
async function updateSubscriptionStatus(
  stripeCustomerId: string,
  status: SubscriptionStatusValue,
  extra?: {
    stripeSubscriptionId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
  },
): Promise<string | null> {
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { stripeCustomerId },
  });

  if (!subscription) {
    console.warn(`[stripe-webhook] No TenantSubscription found for stripeCustomerId=${stripeCustomerId}`);
    return null;
  }

  await prisma.tenantSubscription.update({
    where: { id: subscription.id },
    data: {
      status,
      ...extra,
    },
  });

  return subscription.tenantId;
}

/**
 * Handles customer.subscription.created and customer.subscription.updated events.
 */
async function handleSubscriptionUpsert(sub: {
  id: string;
  customer: string | { id: string };
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end?: boolean;
}): Promise<string | null> {
  const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  return updateSubscriptionStatus(stripeCustomerId, mapStripeStatus(sub.status), {
    stripeSubscriptionId: sub.id,
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  });
}

/**
 * Handles customer.subscription.deleted event.
 */
async function handleSubscriptionCanceled(sub: {
  customer: string | { id: string };
}): Promise<string | null> {
  const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  return updateSubscriptionStatus(stripeCustomerId, 'CANCELED');
}

/**
 * Handles invoice.payment_failed event.
 */
async function handlePaymentFailed(invoice: {
  customer: string | { id: string };
}): Promise<string | null> {
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;
  return updateSubscriptionStatus(stripeCustomerId, 'PAST_DUE');
}

/**
 * Handles invoice.payment_succeeded event.
 */
async function handlePaymentSucceeded(invoice: {
  customer: string | { id: string };
}): Promise<string | null> {
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;
  return updateSubscriptionStatus(stripeCustomerId, 'ACTIVE');
}

export const stripeWebhookWorker = new Worker(
  QUEUE_NAMES.STRIPE_WEBHOOK,
  async (job) => {
    const { eventId, eventType, payload } = job.data as {
      eventId: string;
      eventType: string;
      payload: {
        data: {
          object: Record<string, unknown>;
        };
      };
    };

    // Idempotency check — UNIQUE constraint on stripeEventId prevents duplicate processing
    const existing = await prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: eventId },
    });

    if (existing?.processedAt) {
      console.log(`[stripe-webhook] Skipping already-processed event ${eventId} (${eventType})`);
      return;
    }

    // Upsert event record as "received" — marks event as in-flight
    await prisma.stripeWebhookEvent.upsert({
      where: { stripeEventId: eventId },
      create: {
        stripeEventId: eventId,
        eventType,
        payload: payload as object,
        receivedAt: new Date(),
      },
      update: {},
    });

    let tenantId: string | null = null;

    try {
      const obj = payload.data.object as Record<string, unknown>;

      // Route by event type
      switch (eventType) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          tenantId = await handleSubscriptionUpsert(obj as Parameters<typeof handleSubscriptionUpsert>[0]);
          break;
        case 'customer.subscription.deleted':
          tenantId = await handleSubscriptionCanceled(obj as Parameters<typeof handleSubscriptionCanceled>[0]);
          break;
        case 'invoice.payment_failed':
          tenantId = await handlePaymentFailed(obj as Parameters<typeof handlePaymentFailed>[0]);
          break;
        case 'invoice.payment_succeeded':
          tenantId = await handlePaymentSucceeded(obj as Parameters<typeof handlePaymentSucceeded>[0]);
          break;
        default:
          console.log(`[stripe-webhook] Unhandled event type: ${eventType} (${eventId})`);
      }

      // Invalidate planGate Redis cache after subscription status changes
      if (tenantId) {
        await redis.del(`plan:${tenantId}`);
        console.log(`[stripe-webhook] Invalidated plan cache for tenant ${tenantId}`);
      }

      // Mark as processed
      await prisma.stripeWebhookEvent.update({
        where: { stripeEventId: eventId },
        data: { processedAt: new Date() },
      });

      console.log(`[stripe-webhook] Processed event ${eventId} (${eventType})`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[stripe-webhook] Error processing event ${eventId}: ${errorMessage}`);

      // Save error to event record for debugging
      await prisma.stripeWebhookEvent.update({
        where: { stripeEventId: eventId },
        data: { errorMessage },
      });

      throw err; // Re-throw so BullMQ marks job as failed for retry
    }
  },
  {
    connection: bullmqConnection,
    concurrency: 5,
  },
);

stripeWebhookWorker.on('failed', (job, err) => {
  console.error(`[stripe-webhook] Job ${job?.id} failed:`, err.message);
});

// Export redis for testing
export { redis as stripeWebhookRedis };
