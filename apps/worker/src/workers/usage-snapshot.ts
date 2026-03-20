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
 * - activeAgents: count of enrolled agents (placeholder 0 until agent module complete)
 * - ticketCount: total open tickets (placeholder 0 until integrated)
 * - storageBytes: total storage used in bytes (placeholder 0 until storage module complete)
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

        // Placeholder values — will be populated when agent/ticket/storage modules are complete
        const activeAgents = 0;   // Phase 4: Agent module
        const ticketCount = 0;    // Will be updated when ticket aggregation is added
        const storageBytes = 0;   // Phase: Storage module

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
