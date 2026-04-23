import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection, redisConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

// ─── Inline diff helpers (no-cross-app-import rule) ──────────────────────────
// Duplicated from cmdb-reconciliation.ts / apps/api/src/services/inventory-diff.service.ts

type InventorySnapshotForDiff = {
  id: string;
  ramGb?: number | null;
  cpuCores?: number | null;
  cpuThreads?: number | null;
  cpuSpeedMhz?: number | null;
  cpuModel?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  biosVersion?: string | null;
  tpmVersion?: string | null;
  secureBootEnabled?: boolean | null;
  serialNumber?: string | null;
  diskEncrypted?: boolean | null;
  antivirusProduct?: string | null;
  firewallEnabled?: boolean | null;
  operatingSystem?: string | null;
  osVersion?: string | null;
  osBuild?: string | null;
  installedSoftware?: unknown;
  services?: unknown;
  networkInterfaces?: unknown;
  collectedAt: Date;
};

const DIFF_HARDWARE_FIELDS: ReadonlyArray<keyof InventorySnapshotForDiff> = [
  'ramGb', 'cpuCores', 'cpuThreads', 'cpuSpeedMhz', 'cpuModel',
  'manufacturer', 'model', 'biosVersion', 'tpmVersion', 'secureBootEnabled',
  'serialNumber', 'diskEncrypted', 'antivirusProduct', 'firewallEnabled',
  'operatingSystem', 'osVersion', 'osBuild',
];

function diffSoftware(from: unknown, to: unknown) {
  const parse = (blob: unknown): Array<{ name: string; version?: string }> => {
    if (!blob) return [];
    const arr = Array.isArray(blob)
      ? blob
      : typeof blob === 'object' && blob !== null && 'apps' in blob && Array.isArray((blob as { apps: unknown[] }).apps)
        ? (blob as { apps: unknown[] }).apps
        : [];
    return arr
      .filter((item): item is { name: string; version?: string } =>
        item != null && typeof item === 'object' && 'name' in item && typeof (item as { name: unknown }).name === 'string')
      .map((item) => ({ name: item.name, version: typeof item.version === 'string' ? item.version : undefined }));
  };
  const fromMap = new Map<string, { name: string; version: string }>();
  for (const s of parse(from)) fromMap.set(s.name.trim().toLowerCase(), { name: s.name, version: s.version ?? '' });
  const toMap = new Map<string, { name: string; version: string }>();
  for (const s of parse(to)) toMap.set(s.name.trim().toLowerCase(), { name: s.name, version: s.version ?? '' });
  const results: Array<{ op: 'added' | 'removed' | 'updated'; name: string; version?: string; from?: string; to?: string }> = [];
  for (const [key, toEntry] of toMap) {
    const fromEntry = fromMap.get(key);
    if (!fromEntry) results.push({ op: 'added', name: toEntry.name, version: toEntry.version || undefined });
    else if (fromEntry.version !== toEntry.version) results.push({ op: 'updated', name: toEntry.name, from: fromEntry.version || undefined, to: toEntry.version || undefined });
  }
  for (const [key, fromEntry] of fromMap) {
    if (!toMap.has(key)) results.push({ op: 'removed', name: fromEntry.name, version: fromEntry.version || undefined });
  }
  return results;
}

function diffServices(from: unknown, to: unknown) {
  const parse = (blob: unknown): Array<{ name: string; status?: string }> => {
    if (!blob || !Array.isArray(blob)) return [];
    return blob
      .filter((item): item is { name: string; status?: string } =>
        item != null && typeof item === 'object' && 'name' in item && typeof (item as { name: unknown }).name === 'string')
      .map((item) => ({ name: item.name, status: typeof item.status === 'string' ? item.status : undefined }));
  };
  const fromMap = new Map<string, string>();
  for (const s of parse(from)) fromMap.set(s.name, s.status ?? '');
  const toMap = new Map<string, string>();
  for (const s of parse(to)) toMap.set(s.name, s.status ?? '');
  const results: Array<{ op: 'added' | 'removed' | 'changed'; name: string; status?: string; from?: string; to?: string }> = [];
  for (const [name, toStatus] of toMap) {
    const fromStatus = fromMap.get(name);
    if (fromStatus === undefined) results.push({ op: 'added', name, status: toStatus || undefined });
    else if (fromStatus !== toStatus) results.push({ op: 'changed', name, from: fromStatus || undefined, to: toStatus || undefined });
  }
  for (const [name] of fromMap) {
    if (!toMap.has(name)) results.push({ op: 'removed', name });
  }
  return results;
}

function diffHardware(from: InventorySnapshotForDiff, to: InventorySnapshotForDiff) {
  const result: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of DIFF_HARDWARE_FIELDS) {
    const fromVal = from[field] ?? null;
    const toVal = to[field] ?? null;
    if (fromVal === null && toVal === null) continue;
    if (fromVal !== toVal) result[field as string] = { from: fromVal, to: toVal };
  }
  return result;
}

function diffNetwork(from: unknown, to: unknown) {
  const parse = (blob: unknown): Array<{ mac?: string; ip?: string; ipAddress?: string }> => {
    if (!blob || !Array.isArray(blob)) return [];
    return blob
      .filter((item): item is { mac?: string; ip?: string; ipAddress?: string } =>
        item != null && typeof item === 'object')
      .map((item) => ({
        mac: typeof item.mac === 'string' ? item.mac : undefined,
        ip: typeof item.ip === 'string' ? item.ip : undefined,
        ipAddress: typeof item.ipAddress === 'string' ? item.ipAddress : undefined,
      }));
  };
  const fromArr = parse(from);
  const fromMap = new Map<string, string>();
  for (const iface of fromArr) {
    if (!iface.mac) continue;
    fromMap.set(iface.mac.toLowerCase(), iface.ip ?? iface.ipAddress ?? '');
  }
  const toArr = parse(to);
  const toMap = new Map<string, { mac: string; ip: string }>();
  for (const iface of toArr) {
    if (!iface.mac) continue;
    toMap.set(iface.mac.toLowerCase(), { mac: iface.mac, ip: iface.ip ?? iface.ipAddress ?? '' });
  }
  const results: Array<{ op: 'added' | 'removed' | 'changed'; mac: string; ip?: string; fromIp?: string }> = [];
  for (const [key, toEntry] of toMap) {
    const fromIp = fromMap.get(key);
    if (fromIp === undefined) results.push({ op: 'added', mac: toEntry.mac, ip: toEntry.ip || undefined });
    else if (fromIp !== toEntry.ip) results.push({ op: 'changed', mac: toEntry.mac, ip: toEntry.ip || undefined, fromIp: fromIp || undefined });
  }
  for (const [key] of fromMap) {
    if (!toMap.has(key)) {
      const original = fromArr.find((i) => i.mac?.toLowerCase() === key);
      if (original?.mac) results.push({ op: 'removed', mac: original.mac });
    }
  }
  return results;
}

/**
 * Compute the diff between the previous snapshot and `toSnapshot`, then persist
 * an InventoryDiff row. Returns early if no prior snapshot exists or nothing changed.
 *
 * Inlined from apps/api/src/services/inventory-diff.service.ts — no-cross-app-import rule.
 */
async function computeAndStoreInventoryDiff(
  tenantId: string,
  agentId: string,
  toSnapshot: InventorySnapshotForDiff,
): Promise<void> {
  // Narrow to snapshots strictly before toSnapshot in time — more precise than
  // the API service version which only excludes by ID. Avoids edge-case tie-breaks
  // during backfill where two snapshots could share a collectedAt timestamp.
  const fromSnapshot = await prisma.inventorySnapshot.findFirst({
    where: { tenantId, agentId, id: { not: toSnapshot.id }, collectedAt: { lt: toSnapshot.collectedAt } },
    orderBy: { collectedAt: 'desc' },
  });
  if (!fromSnapshot) return;

  const software = diffSoftware(fromSnapshot.installedSoftware, toSnapshot.installedSoftware);
  const services = diffServices(fromSnapshot.services, toSnapshot.services);
  const hardware = diffHardware(fromSnapshot as InventorySnapshotForDiff, toSnapshot);
  const network  = diffNetwork(fromSnapshot.networkInterfaces, toSnapshot.networkInterfaces);

  const hasChanges =
    software.length > 0 ||
    services.length > 0 ||
    Object.keys(hardware).length > 0 ||
    network.length > 0;

  if (!hasChanges) return;

  const diffJson: Record<string, unknown> = {};
  if (software.length > 0) diffJson.software = software;
  if (services.length > 0) diffJson.services = services;
  if (Object.keys(hardware).length > 0) diffJson.hardware = hardware;
  if (network.length > 0) diffJson.network = network;

  await prisma.inventoryDiff.create({
    data: {
      tenantId,
      agentId,
      ciId: null,
      fromSnapshotId: fromSnapshot.id,
      toSnapshotId: toSnapshot.id,
      diffJson: diffJson as never,
      collectedAt: toSnapshot.collectedAt,
    },
  });
}

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
            // Snapshots referenced by InventoryDiffs that survived the retention window
            const referencedDiffs = await prisma.inventoryDiff.findMany({
              where: { tenantId, agentId: agent.id, collectedAt: { gte: cutoff } },
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

            // Safety guard: distinguish "no snapshots" from "nothing to keep"
            const snapshotCount = await prisma.inventorySnapshot.count({
              where: { tenantId, agentId: agent.id },
            });
            if (snapshotCount === 0) continue;
            if (keepIds.size === 0) {
              console.warn(`[inventory-retention] No keep candidates for agent ${agent.id} (${snapshotCount} snapshots exist) — skipping to avoid full deletion`);
              continue;
            }

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

// ─── InventoryDiff Backfill Worker ───────────────────────────────────────────
//
// One-time job that backfills InventoryDiff rows for existing historical snapshots.
// Safe to run multiple times (idempotent). Completion tracked via Redis key.
// Auto-enqueued at startup (from index.ts) if not already completed.

export const inventoryDiffBackfillWorker = new Worker(
  QUEUE_NAMES.INVENTORY_DIFF_BACKFILL,
  async (job) => {
    console.log(`[inventory-diff-backfill] Starting backfill (job ${job.id})`);

    let tenantsProcessed = 0;
    let totalAgents = 0;
    let cursor: string | undefined;

    do {
      const tenants = await prisma.tenant.findMany({
        take: 50,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, changeRetentionDays: true },
        orderBy: { id: 'asc' },
      });

      for (const tenant of tenants) {
        const { id: tenantId } = tenant;
        const changeRetentionDays = tenant.changeRetentionDays ?? 90;
        const cutoff = new Date(Date.now() - changeRetentionDays * 86_400_000);

        try {
          const agents = await prisma.agent.findMany({
            where: { tenantId },
            select: { id: true },
          });

          for (const agent of agents) {
            totalAgents++;
            const { id: agentId } = agent;

            try {
              // Fetch all snapshots within the retention window, oldest first
              const snapshots = await prisma.inventorySnapshot.findMany({
                where: { tenantId, agentId, collectedAt: { gte: cutoff } },
                orderBy: { collectedAt: 'asc' },
                select: {
                  id: true,
                  agentId: true,
                  collectedAt: true,
                  ramGb: true,
                  cpuCores: true,
                  cpuThreads: true,
                  cpuSpeedMhz: true,
                  cpuModel: true,
                  manufacturer: true,
                  model: true,
                  biosVersion: true,
                  tpmVersion: true,
                  secureBootEnabled: true,
                  serialNumber: true,
                  diskEncrypted: true,
                  antivirusProduct: true,
                  firewallEnabled: true,
                  operatingSystem: true,
                  osVersion: true,
                  osBuild: true,
                  installedSoftware: true,
                  services: true,
                  networkInterfaces: true,
                },
              });

              if (snapshots.length < 2) continue;

              // Process each snapshot (skip the first — no prior to diff against)
              for (const snap of snapshots.slice(1)) {
                // Idempotency check: skip if a diff already exists pointing to this snapshot
                const existing = await prisma.inventoryDiff.findFirst({
                  where: { tenantId, agentId, toSnapshotId: snap.id },
                  select: { id: true },
                });
                if (existing) continue;

                await computeAndStoreInventoryDiff(tenantId, agentId, snap as InventorySnapshotForDiff);
              }

              console.log(`[inventory-diff-backfill] Agent ${agentId} (tenant ${tenantId}): processed ${snapshots.length} snapshots`);
            } catch (agentErr) {
              const msg = agentErr instanceof Error ? agentErr.message : String(agentErr);
              console.error(`[inventory-diff-backfill] Error on agent ${agentId} (tenant ${tenantId}): ${msg}`);
              // Continue with remaining agents — don't abort the whole backfill
            }
          }

          tenantsProcessed++;
        } catch (tenantErr) {
          const msg = tenantErr instanceof Error ? tenantErr.message : String(tenantErr);
          console.error(`[inventory-diff-backfill] Error on tenant ${tenantId}: ${msg}`);
          // Continue with remaining tenants
        }
      }

      cursor = tenants.length === 50 ? tenants[tenants.length - 1]?.id : undefined;
    } while (cursor);

    console.log(
      `[inventory-diff-backfill] Backfill complete: ${tenantsProcessed} tenants, ${totalAgents} agents processed`,
    );

    // Mark completion in Redis so startup logic doesn't re-enqueue on next restart
    await redisConnection.set('inventory-diff-backfill:completed', '1');
    console.log('[inventory-diff-backfill] Completion flag set in Redis');
  },
  {
    connection: bullmqConnection,
    concurrency: 1, // Single-threaded: cross-tenant batch job
  },
);

inventoryDiffBackfillWorker.on('failed', (job, err) => {
  console.error(`[inventory-diff-backfill] Job ${job?.id} failed:`, err.message);
});
