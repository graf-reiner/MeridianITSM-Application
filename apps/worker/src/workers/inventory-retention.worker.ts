import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

export const inventoryRetentionWorker = new Worker(
  QUEUE_NAMES.INVENTORY_RETENTION,
  async (job) => {
    console.log(`[inventory-retention] Starting nightly retention sweep (job ${job.id})`);

    let tenantsProcessed = 0;
    let cursor: string | undefined;

    do {
      const tenants = await prisma.tenant.findMany({
        take: 50,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, changeRetentionDays: true, snapshotRetentionCount: true },
        orderBy: { id: 'asc' },
      });

      for (const tenant of tenants) {
        const { id: tenantId } = tenant;
        const changeRetentionDays = tenant.changeRetentionDays ?? 90;
        const snapshotRetentionCount = tenant.snapshotRetentionCount ?? 30;
        const cutoff = new Date(Date.now() - changeRetentionDays * 86_400_000);

        try {
          // 1. Delete old CmdbChangeRecord rows
          const deletedChangeRecords = await prisma.cmdbChangeRecord.deleteMany({
            where: { tenantId, createdAt: { lt: cutoff } },
          });

          // 2. Delete old InventoryDiff rows
          const deletedDiffs = await prisma.inventoryDiff.deleteMany({
            where: { tenantId, collectedAt: { lt: cutoff } },
          });

          // 3. Prune old InventorySnapshot rows per agent
          const agents = await prisma.agent.findMany({
            where: { tenantId },
            select: { id: true },
          });

          let deletedSnapshots = 0;

          for (const agent of agents) {
            // Snapshots referenced by any InventoryDiff
            const referencedDiffs = await prisma.inventoryDiff.findMany({
              where: { tenantId, agentId: agent.id },
              select: { fromSnapshotId: true, toSnapshotId: true },
            });
            const referencedIds = new Set<string>(
              [
                ...referencedDiffs.map((d) => d.fromSnapshotId),
                ...referencedDiffs.map((d) => d.toSnapshotId),
              ].filter((id): id is string => id !== null && id !== undefined),
            );

            // Most recent N snapshots
            const recent = await prisma.inventorySnapshot.findMany({
              where: { tenantId, agentId: agent.id },
              orderBy: { collectedAt: 'desc' },
              take: snapshotRetentionCount,
              select: { id: true },
            });
            const recentIds = new Set(recent.map((s) => s.id));

            const keepIds = new Set([...referencedIds, ...recentIds]);

            // Safety guard: if nothing to keep, skip to avoid deleting everything
            if (keepIds.size === 0) continue;

            const result = await prisma.inventorySnapshot.deleteMany({
              where: {
                tenantId,
                agentId: agent.id,
                id: { notIn: [...keepIds] },
              },
            });
            deletedSnapshots += result.count;
          }

          console.log(
            `[inventory-retention] Tenant ${tenantId}: deleted ${deletedChangeRecords.count} change records, ` +
              `${deletedDiffs.count} inventory diffs, ${deletedSnapshots} snapshots`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[inventory-retention] Error processing tenant ${tenantId}: ${message}`);
          // Continue with remaining tenants — don't fail the whole job
        }

        tenantsProcessed++;
      }

      cursor = tenants.length === 50 ? tenants[tenants.length - 1]?.id : undefined;
    } while (cursor);

    console.log(`[inventory-retention] Retention sweep complete: ${tenantsProcessed} tenants processed`);
  },
  {
    connection: bullmqConnection,
    concurrency: 1, // Single-threaded: cross-tenant batch job, no parallelism needed
  },
);

inventoryRetentionWorker.on('failed', (job, err) => {
  console.error(`[inventory-retention] Job ${job?.id} failed:`, err.message);
});
