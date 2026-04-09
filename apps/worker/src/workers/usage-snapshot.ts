import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

/**
 * Daily usage snapshot worker.
 *
 * Runs on a daily cron schedule (2 AM UTC) to capture per-tenant usage metrics.
 * Upserts TenantUsageSnapshot records for each active tenant using today's date.
 *
 * Metrics captured:
 * - activeUsers: count of ACTIVE users for the tenant
 * - activeAgents: count of enrolled/active agents for the tenant
 * - ticketCount: total non-cancelled tickets for the tenant
 * - storageBytes: total storage used in bytes (placeholder 0 until storage tracking added)
 */
export const usageSnapshotWorker = new Worker(
  QUEUE_NAMES.USAGE_SNAPSHOT,
  async (_job) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Normalize to start of day UTC

    // Get all active tenants
    const activeTenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    console.log(`[usage-snapshot] Capturing snapshots for ${activeTenants.length} active tenants`);

    let successCount = 0;
    let errorCount = 0;

    for (const tenant of activeTenants) {
      try {
        // Count active users for this tenant
        const activeUsers = await prisma.user.count({
          where: {
            tenantId: tenant.id,
            status: 'ACTIVE',
          },
        });

        // Count enrolled agents for this tenant
        const activeAgents = await prisma.agent.count({
          where: {
            tenantId: tenant.id,
            status: { in: ['ACTIVE', 'ENROLLING'] },
          },
        });

        // Count total tickets (all statuses except CANCELLED)
        const ticketCount = await prisma.ticket.count({
          where: {
            tenantId: tenant.id,
            status: { not: 'CANCELLED' },
          },
        });

        // Storage bytes — placeholder until storage tracking is added to upload pipeline
        const storageBytes = 0;

        // Upsert snapshot for today — @@unique([tenantId, snapshotDate]) prevents duplicates
        await prisma.tenantUsageSnapshot.upsert({
          where: {
            tenantId_snapshotDate: {
              tenantId: tenant.id,
              snapshotDate: today,
            },
          },
          create: {
            tenantId: tenant.id,
            snapshotDate: today,
            activeUsers,
            activeAgents,
            ticketCount,
            storageBytes,
          },
          update: {
            activeUsers,
            activeAgents,
            ticketCount,
            storageBytes,
          },
        });

        successCount++;
      } catch (err) {
        errorCount++;
        console.error(
          `[usage-snapshot] Failed to snapshot tenant ${tenant.id}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    console.log(
      `[usage-snapshot] Completed: ${successCount} succeeded, ${errorCount} failed for date ${today.toISOString().slice(0, 10)}`,
    );
  },
  {
    connection: bullmqConnection,
    concurrency: 1, // Single instance — daily cron job, no parallelism needed
  },
);

usageSnapshotWorker.on('failed', (job, err) => {
  console.error(`[usage-snapshot] Job ${job?.id} failed:`, err.message);
});
