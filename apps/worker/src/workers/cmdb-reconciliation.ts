import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

// ─── CMDB Reconciliation Worker ───────────────────────────────────────────────
//
// Cross-tenant global sweep. Runs every 15 minutes via repeatable job.
// Processes all ACTIVE agents, compares their latest InventorySnapshot to existing CIs,
// creates/updates CIs with promoted columns and extension tables, logs per-field changes,
// and marks stale CIs as deleted after 24h of no contact.

/**
 * Infer a CI class key from agent platform/hostname/OS heuristics.
 * Returns a classKey that maps to CmdbCiClass seed data.
 */
function inferClassKeyFromSnapshot(
  platform: string,
  hostname: string,
  operatingSystem: string | null,
): { classKey: string; legacyType: string } {
  const os = (operatingSystem ?? '').toLowerCase();
  const host = (hostname ?? '').toLowerCase();
  const plt = platform.toLowerCase();

  if (
    os.includes('server') ||
    host.startsWith('srv') ||
    host.includes('-srv-') ||
    os.includes('centos') ||
    os.includes('rhel') ||
    os.includes('debian')
  ) {
    return { classKey: 'server', legacyType: 'SERVER' };
  }

  if (plt === 'linux') return { classKey: 'server', legacyType: 'SERVER' };
  if (plt === 'macos') return { classKey: 'server', legacyType: 'WORKSTATION' };
  if (plt === 'windows') return { classKey: 'server', legacyType: 'WORKSTATION' };

  return { classKey: 'generic', legacyType: 'OTHER' };
}

/**
 * Resolve a classKey to a CmdbCiClass ID for a given tenant.
 * Caches lookups per tenant within a single reconciliation run.
 */
const classIdCache = new Map<string, string>();
async function resolveClassId(tenantId: string, classKey: string): Promise<string | null> {
  const cacheKey = `${tenantId}:${classKey}`;
  if (classIdCache.has(cacheKey)) return classIdCache.get(cacheKey)!;

  const cls = await prisma.cmdbCiClass.findFirst({
    where: { tenantId, classKey },
    select: { id: true },
  });

  if (cls) classIdCache.set(cacheKey, cls.id);
  return cls?.id ?? null;
}

/**
 * Resolve lifecycle status 'in_service' for a tenant.
 */
const statusIdCache = new Map<string, string>();
async function resolveLifecycleStatusId(tenantId: string, statusKey: string): Promise<string | null> {
  const cacheKey = `${tenantId}:lifecycle:${statusKey}`;
  if (statusIdCache.has(cacheKey)) return statusIdCache.get(cacheKey)!;

  const status = await prisma.cmdbStatus.findFirst({
    where: { tenantId, statusType: 'lifecycle', statusKey },
    select: { id: true },
  });

  if (status) statusIdCache.set(cacheKey, status.id);
  return status?.id ?? null;
}

/**
 * Resolve environment 'prod' for a tenant.
 */
const envIdCache = new Map<string, string>();
async function resolveEnvironmentId(tenantId: string, envKey: string): Promise<string | null> {
  const cacheKey = `${tenantId}:${envKey}`;
  if (envIdCache.has(cacheKey)) return envIdCache.get(cacheKey)!;

  const env = await prisma.cmdbEnvironment.findFirst({
    where: { tenantId, envKey },
    select: { id: true },
  });

  if (env) envIdCache.set(cacheKey, env.id);
  return env?.id ?? null;
}

export const cmdbReconciliationWorker = new Worker(
  QUEUE_NAMES.CMDB_RECONCILIATION,
  async (job) => {
    console.log(`[cmdb-reconciliation] Running global CI reconciliation sweep (job ${job.id})`);

    // Clear caches for each run
    classIdCache.clear();
    statusIdCache.clear();
    envIdCache.clear();

    let created = 0;
    let updated = 0;
    let staleMarked = 0;

    // ─── Step 1: Process all ACTIVE agents ──────────────────────────────────

    const agents = await prisma.agent.findMany({
      where: { status: 'ACTIVE' },
      include: {
        inventorySnapshots: {
          orderBy: { collectedAt: 'desc' },
          take: 1,
        },
      },
    });

    console.log(`[cmdb-reconciliation] Processing ${agents.length} active agents`);

    for (const agent of agents) {
      const snapshot = agent.inventorySnapshots[0];
      if (!snapshot) continue;

      const tenantId = agent.tenantId;

      try {
        const existingCi = await prisma.cmdbConfigurationItem.findFirst({
          where: { agentId: agent.id, tenantId },
        });

        const hostname = snapshot.hostname ?? agent.hostname;
        const operatingSystem = snapshot.operatingSystem ?? null;
        const osVersion = snapshot.osVersion ?? null;
        const { classKey, legacyType } = inferClassKeyFromSnapshot(agent.platform, hostname, operatingSystem);

        // Resolve reference table IDs
        const classId = await resolveClassId(tenantId, classKey);
        const lifecycleStatusId = await resolveLifecycleStatusId(tenantId, 'in_service');
        const environmentId = await resolveEnvironmentId(tenantId, 'prod');

        if (!existingCi) {
          // ─── Create new CI with promoted columns + server extension ───

          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_ci_seq'))`;
            const result = await tx.$queryRaw<[{ next: bigint }]>`
              SELECT COALESCE(MAX("ciNumber"), 0) + 1 AS next
              FROM cmdb_configuration_items
              WHERE "tenantId" = ${tenantId}::uuid
            `;
            const ciNumber = Number(result[0].next);

            const primaryIp = snapshot.networkInterfaces
              ? extractPrimaryIp(snapshot.networkInterfaces as unknown[])
              : null;

            // Compute total disk storage from snapshot
            const totalStorageGb = computeTotalStorageGb(snapshot.disks);
            const isVirtual = snapshot.isVirtual ?? false;

            const ci = await tx.cmdbConfigurationItem.create({
              data: {
                tenantId,
                ciNumber,
                name: hostname,
                // Legacy enum fields
                type: legacyType as never,
                status: 'ACTIVE' as never,
                environment: 'PRODUCTION' as never,
                // New reference table FKs
                classId,
                lifecycleStatusId,
                environmentId,
                // Promoted columns from enriched snapshot
                hostname,
                fqdn: snapshot.fqdn ?? null,
                ipAddress: primaryIp,
                serialNumber: snapshot.serialNumber ?? null,
                model: snapshot.model ?? null,
                version: snapshot.osVersion ?? null,
                // Agent link
                agentId: agent.id,
                // Governance
                sourceSystem: 'agent',
                sourceRecordKey: agent.agentKey,
                firstDiscoveredAt: snapshot.collectedAt,
                discoveredAt: snapshot.collectedAt,
                lastSeenAt: new Date(),
                reconciliationRank: 50,
                // Additional data in JSON (security, software, etc.)
                attributesJson: {
                  agentPlatform: agent.platform,
                  agentVersion: agent.agentVersion ?? null,
                  deviceType: snapshot.deviceType,
                  biosVersion: snapshot.biosVersion,
                  tpmVersion: snapshot.tpmVersion,
                  secureBootEnabled: snapshot.secureBootEnabled,
                  diskEncrypted: snapshot.diskEncrypted,
                  antivirusProduct: snapshot.antivirusProduct,
                  firewallEnabled: snapshot.firewallEnabled,
                  isVirtual: snapshot.isVirtual,
                  hypervisorType: snapshot.hypervisorType,
                  domainName: snapshot.domainName,
                } as never,
              },
            });

            // Create server extension with full hardware detail
            if (classKey === 'server' || legacyType === 'SERVER' || legacyType === 'WORKSTATION') {
              await tx.cmdbCiServer.create({
                data: {
                  ciId: ci.id,
                  tenantId,
                  serverType: isVirtual ? (snapshot.hypervisorType ?? 'virtual_machine') : 'physical',
                  operatingSystem,
                  osVersion,
                  cpuCount: snapshot.cpuCores,
                  memoryGb: snapshot.ramGb,
                  storageGb: totalStorageGb,
                  domainName: snapshot.domainName ?? null,
                  virtualizationPlatform: snapshot.hypervisorType ?? null,
                  backupRequired: false,
                },
              });
            }

            await tx.cmdbChangeRecord.create({
              data: {
                tenantId,
                ciId: ci.id,
                changeType: 'CREATED',
                changedBy: 'AGENT',
                agentId: agent.id,
              },
            });
          });

          created++;
          console.log(`[cmdb-reconciliation] Created CI for agent ${agent.id} (host: ${hostname})`);
        } else {
          // ─── Diff and update existing CI ─────────────────────────────

          const changedFields: Array<{
            fieldName: string;
            oldValue: string;
            newValue: string;
          }> = [];

          const trackChangeIfNotUserLocked = async (
            field: string,
            oldVal: unknown,
            newVal: unknown,
          ) => {
            const oldStr = oldVal == null ? '' : String(oldVal);
            const newStr = newVal == null ? '' : String(newVal);
            if (oldStr === newStr) return;

            const lastChange = await prisma.cmdbChangeRecord.findFirst({
              where: { ciId: existingCi.id, fieldName: field },
              orderBy: { createdAt: 'desc' },
              select: { changedBy: true },
            });

            if (lastChange?.changedBy === 'USER') {
              return; // Manual edits win
            }

            changedFields.push({ fieldName: field, oldValue: oldStr, newValue: newStr });
          };

          // Compare promoted columns — enriched fields
          await trackChangeIfNotUserLocked('name', existingCi.name, hostname);
          await trackChangeIfNotUserLocked('hostname', existingCi.hostname, hostname);

          if (snapshot.fqdn) {
            await trackChangeIfNotUserLocked('fqdn', existingCi.fqdn, snapshot.fqdn);
          }

          const primaryIp = snapshot.networkInterfaces
            ? extractPrimaryIp(snapshot.networkInterfaces as unknown[])
            : null;
          if (primaryIp) {
            await trackChangeIfNotUserLocked('ipAddress', existingCi.ipAddress, primaryIp);
          }

          if (snapshot.serialNumber) {
            await trackChangeIfNotUserLocked('serialNumber', existingCi.serialNumber, snapshot.serialNumber);
          }
          if (snapshot.model) {
            await trackChangeIfNotUserLocked('model', existingCi.model, snapshot.model);
          }

          if (changedFields.length > 0) {
            await prisma.$transaction(async (tx) => {
              await tx.cmdbChangeRecord.createMany({
                data: changedFields.map((f) => ({
                  tenantId,
                  ciId: existingCi.id,
                  changeType: 'UPDATED' as const,
                  fieldName: f.fieldName,
                  oldValue: f.oldValue,
                  newValue: f.newValue,
                  changedBy: 'AGENT' as const,
                  agentId: agent.id,
                })),
              });

              const updateData: Record<string, unknown> = { lastSeenAt: new Date() };
              for (const f of changedFields) {
                updateData[f.fieldName] = f.newValue || null;
              }

              // Also set reference FKs if not yet set
              if (!existingCi.classId && classId) updateData['classId'] = classId;
              if (!existingCi.lifecycleStatusId && lifecycleStatusId) updateData['lifecycleStatusId'] = lifecycleStatusId;
              if (!existingCi.environmentId && environmentId) updateData['environmentId'] = environmentId;
              if (!existingCi.sourceSystem) updateData['sourceSystem'] = 'agent';
              if (!existingCi.sourceRecordKey) updateData['sourceRecordKey'] = agent.agentKey;

              await tx.cmdbConfigurationItem.update({
                where: { id: existingCi.id },
                data: updateData as never,
              });

              // Upsert server extension with enriched data
              if (classKey === 'server' || legacyType === 'SERVER' || legacyType === 'WORKSTATION') {
                const isVm = snapshot.isVirtual ?? false;
                const totalStorageGb = computeTotalStorageGb(snapshot.disks);
                await tx.cmdbCiServer.upsert({
                  where: { ciId: existingCi.id },
                  create: {
                    ciId: existingCi.id,
                    tenantId,
                    serverType: isVm ? (snapshot.hypervisorType ?? 'virtual_machine') : 'physical',
                    operatingSystem,
                    osVersion,
                    cpuCount: snapshot.cpuCores,
                    memoryGb: snapshot.ramGb,
                    storageGb: totalStorageGb,
                    domainName: snapshot.domainName ?? null,
                    virtualizationPlatform: snapshot.hypervisorType ?? null,
                    backupRequired: false,
                  },
                  update: {
                    ...(operatingSystem ? { operatingSystem } : {}),
                    ...(osVersion ? { osVersion } : {}),
                    ...(snapshot.cpuCores ? { cpuCount: snapshot.cpuCores } : {}),
                    ...(snapshot.ramGb ? { memoryGb: snapshot.ramGb } : {}),
                    ...(totalStorageGb ? { storageGb: totalStorageGb } : {}),
                    ...(snapshot.domainName ? { domainName: snapshot.domainName } : {}),
                    ...(snapshot.hypervisorType ? { virtualizationPlatform: snapshot.hypervisorType } : {}),
                    ...(isVm ? { serverType: snapshot.hypervisorType ?? 'virtual_machine' } : {}),
                  },
                });
              }
            });

            updated++;
          } else {
            // Just bump lastSeenAt and backfill reference FKs
            const backfill: Record<string, unknown> = { lastSeenAt: new Date() };
            if (!existingCi.classId && classId) backfill['classId'] = classId;
            if (!existingCi.lifecycleStatusId && lifecycleStatusId) backfill['lifecycleStatusId'] = lifecycleStatusId;
            if (!existingCi.environmentId && environmentId) backfill['environmentId'] = environmentId;
            if (!existingCi.sourceSystem) backfill['sourceSystem'] = 'agent';

            await prisma.cmdbConfigurationItem.update({
              where: { id: existingCi.id },
              data: backfill as never,
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cmdb-reconciliation] Error processing agent ${agent.id}: ${message}`);
      }
    }

    // ─── Step 2: Mark stale CIs (agentId set, lastSeenAt > 24h) ────────────

    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleCIs = await prisma.cmdbConfigurationItem.findMany({
      where: {
        agentId: { not: null },
        status: 'ACTIVE',
        isDeleted: false,
        lastSeenAt: { lt: staleThreshold },
      },
      select: { id: true, tenantId: true, agentId: true },
    });

    console.log(`[cmdb-reconciliation] Found ${staleCIs.length} stale CIs to mark`);

    for (const ci of staleCIs) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.cmdbChangeRecord.create({
            data: {
              tenantId: ci.tenantId,
              ciId: ci.id,
              changeType: 'UPDATED',
              fieldName: 'status',
              oldValue: 'ACTIVE',
              newValue: 'INACTIVE',
              changedBy: 'AGENT',
              agentId: ci.agentId,
            },
          });

          await tx.cmdbConfigurationItem.update({
            where: { id: ci.id },
            data: { status: 'INACTIVE' as never },
          });
        });

        staleMarked++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cmdb-reconciliation] Error marking CI ${ci.id} stale: ${message}`);
      }
    }

    console.log(
      `[cmdb-reconciliation] Reconciliation complete — created: ${created}, updated: ${updated}, stale marked: ${staleMarked}`,
    );
  },
  {
    connection: bullmqConnection,
    concurrency: 1,
  },
);

cmdbReconciliationWorker.on('failed', (job, err) => {
  console.error(`[cmdb-reconciliation] Job ${job?.id} failed:`, err.message);
});

/**
 * Compute total storage in GB from disks JSON data.
 */
function computeTotalStorageGb(disks: unknown): number | null {
  if (!Array.isArray(disks)) return null;
  let totalBytes = 0;
  for (const disk of disks) {
    if (disk && typeof disk === 'object') {
      const obj = disk as Record<string, unknown>;
      const size = obj.sizeBytes ?? obj.SizeBytes ?? obj.size;
      if (typeof size === 'number') totalBytes += size;
    }
  }
  return totalBytes > 0 ? Math.round(totalBytes / 1073741824 * 100) / 100 : null;
}

/**
 * Extract the primary (non-loopback) IP from network interfaces data.
 */
function extractPrimaryIp(interfaces: unknown[]): string | null {
  if (!Array.isArray(interfaces)) return null;
  for (const iface of interfaces) {
    if (iface && typeof iface === 'object') {
      const obj = iface as Record<string, unknown>;
      const ip = (obj.ipv4 ?? obj.ip ?? obj.address) as string | undefined;
      if (ip && !ip.startsWith('127.') && ip !== '::1') {
        return ip;
      }
    }
  }
  return null;
}
