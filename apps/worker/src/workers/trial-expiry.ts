import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { Redis } from 'ioredis';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES, emailNotificationQueue } from '../queues/definitions.js';

// Local Redis client for plan cache invalidation
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

/**
 * Trial expiry worker — runs on a daily cron (6 AM UTC).
 *
 * Processes two scenarios:
 *
 * 1. Dunning (trial-3d warning):
 *    Queries tenants whose trial ends within the next 3 days.
 *    Enqueues a 'trial-expiring' email notification for each.
 *
 * 2. Trial expiry (suspension):
 *    Queries tenants whose trial has already expired.
 *    Sets TenantSubscription status to SUSPENDED, marks Tenant as suspended,
 *    invalidates the Redis plan cache, and enqueues a 'trial-expired' email.
 */
export const trialExpiryWorker = new Worker(
  QUEUE_NAMES.TRIAL_EXPIRY,
  async (_job) => {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // ── 1. Dunning: send warning emails to trials expiring within 3 days ──────
    const expiringSoon = await prisma.tenantSubscription.findMany({
      where: {
        status: 'TRIALING',
        trialEnd: {
          gte: now,
          lte: in3Days,
        },
      },
      select: {
        tenantId: true,
        trialEnd: true,
        tenant: { select: { name: true } },
      },
    });

    for (const sub of expiringSoon) {
      try {
        await emailNotificationQueue.add('trial-expiring', {
          tenantId: sub.tenantId,
          type: 'trial-expiring',
          data: {
            tenantName: sub.tenant.name,
            trialEnd: sub.trialEnd?.toISOString(),
          },
        });
        console.log(`[trial-expiry] Sent trial expiry warning to tenant ${sub.tenantId}`);
      } catch (err) {
        console.error(
          `[trial-expiry] Failed to enqueue trial-expiring email for tenant ${sub.tenantId}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    // ── 2. Suspension: suspend tenants whose trial has expired ────────────────
    const expired = await prisma.tenantSubscription.findMany({
      where: {
        status: 'TRIALING',
        trialEnd: { lt: now },
      },
      select: {
        tenantId: true,
        tenant: { select: { name: true } },
      },
    });

    for (const sub of expired) {
      try {
        // Update subscription status to SUSPENDED
        await prisma.tenantSubscription.update({
          where: { tenantId: sub.tenantId },
          data: { status: 'SUSPENDED' },
        });

        // Update Tenant record — sets status and suspendedAt timestamp
        await prisma.tenant.update({
          where: { id: sub.tenantId },
          data: {
            status: 'SUSPENDED',
            suspendedAt: now,
          },
        });

        // Invalidate Redis plan cache so planGate enforces suspension immediately
        await redis.del(`plan:${sub.tenantId}`);

        // Send trial-expired notification email
        await emailNotificationQueue.add('trial-expired', {
          tenantId: sub.tenantId,
          type: 'trial-expired',
          data: {
            tenantName: sub.tenant.name,
          },
        });

        console.log(`[trial-expiry] Suspended tenant ${sub.tenantId} — trial expired`);
      } catch (err) {
        console.error(
          `[trial-expiry] Failed to suspend tenant ${sub.tenantId}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    console.log(
      `[trial-expiry] Completed: ${expiringSoon.length} dunning warnings sent, ${expired.length} tenants suspended`,
    );
  },
  {
    connection: bullmqConnection,
    concurrency: 1, // Single instance — daily cron, no parallelism needed
  },
);

trialExpiryWorker.on('failed', (job, err) => {
  console.error(`[trial-expiry] Job ${job?.id} failed:`, err.message);
});

// Export redis for testing
export { redis as trialExpiryRedis };
