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

// ─── Phase 8 helpers (CASR-03 / D-05 / D-06) ─────────────────────────────────
//
// Duplicated inline from apps/api/src/services/cmdb-extension.service.ts per
// the project's no-cross-app-import convention (same precedent as
// inferClassKeyFromSnapshot above, mapStripeStatus, etc.). Keep in sync with
// the cmdb-extension.service.ts copy when the parser shape changes.
//
// Pitfall 8 + 10: defensive parser for the various JSON shapes seen in
// Asset.softwareInventory blobs and InventorySnapshot.installedSoftware
// payloads. Supported shapes:
//   - Array<{ name, version, ... }>
//   - { apps: Array<{ name, version, ... }> }
// Anything else returns [] (worker silently skips — no audit row).
function parseSoftwareList(
  blob: unknown,
): Array<{
  name: string;
  version: string;
  vendor?: string | null;
  publisher?: string | null;
  installDate?: string | null;
}> {
  if (!blob) return [];
  const arr = Array.isArray(blob)
    ? blob
    : typeof blob === 'object' &&
        blob !== null &&
        'apps' in blob &&
        Array.isArray((blob as { apps: unknown[] }).apps)
      ? (blob as { apps: unknown[] }).apps
      : [];
  return arr
    .filter(
      (
        item,
      ): item is {
        name: string;
        version: string;
        vendor?: string;
        publisher?: string;
        installDate?: string;
      } =>
        item != null &&
        typeof item === 'object' &&
        'name' in item &&
        typeof (item as { name: unknown }).name === 'string',
    )
    .map((item) => ({
      name: String(item.name),
      version: String(item.version ?? ''),
      vendor: item.vendor ?? null,
      publisher: item.publisher ?? null,
      installDate: item.installDate ?? null,
    }));
}

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

// ─── FK resolvers — Phase 7 ───────────────────────────────────────────────────
//
// Phase 7: duplicated from apps/api/src/services/cmdb-reference-resolver.service.ts
// to avoid cross-app imports. Keep these in sync with the API copy when the
// resolver contract changes (5 resolvers + clearResolverCaches).
//
// Cache correctness invariant: every cache key starts with `${tenantId}:` as
// the FIRST segment so Tenant A's resolved id can never be returned for
// Tenant B even if both tenants have the same classKey / statusKey / envKey.
// Status caches additionally include `statusType` because the same statusKey
// (e.g., 'unknown') exists for both lifecycle and operational types.
//
// The worker's cache and the API process's cache are intentionally
// independent per-process caches. Each process's `clearResolverCaches()`
// resets only that process's own Maps.

/**
 * Resolve a classKey to a CmdbCiClass ID for a given tenant.
 */
const classIdCache = new Map<string, string>();
export async function resolveClassId(tenantId: string, classKey: string): Promise<string | null> {
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
 * Resolve a lifecycle status key (e.g., 'in_service', 'retired') for a tenant.
 */
const statusIdCache = new Map<string, string>();
export async function resolveLifecycleStatusId(tenantId: string, statusKey: string): Promise<string | null> {
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
 * Phase 7 NEW: resolve an operational status key (e.g., 'online', 'offline',
 * 'unknown') for a tenant. Used by the stale-CI marker to write
 * operationalStatusId='offline' in place of the legacy status='INACTIVE' enum.
 */
const operationalStatusIdCache = new Map<string, string>();
export async function resolveOperationalStatusId(
  tenantId: string,
  statusKey: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:operational:${statusKey}`;
  if (operationalStatusIdCache.has(cacheKey)) return operationalStatusIdCache.get(cacheKey)!;

  const status = await prisma.cmdbStatus.findFirst({
    where: { tenantId, statusType: 'operational', statusKey },
    select: { id: true },
  });

  if (status) operationalStatusIdCache.set(cacheKey, status.id);
  return status?.id ?? null;
}

/**
 * Resolve an envKey (e.g., 'prod') for a tenant.
 */
const envIdCache = new Map<string, string>();
export async function resolveEnvironmentId(tenantId: string, envKey: string): Promise<string | null> {
  const cacheKey = `${tenantId}:${envKey}`;
  if (envIdCache.has(cacheKey)) return envIdCache.get(cacheKey)!;

  const env = await prisma.cmdbEnvironment.findFirst({
    where: { tenantId, envKey },
    select: { id: true },
  });

  if (env) envIdCache.set(cacheKey, env.id);
  return env?.id ?? null;
}

/**
 * Phase 7 NEW: resolve a relationshipKey (e.g., 'depends_on', 'hosted_on')
 * for a tenant. The worker does not currently write relationships, but this
 * resolver is kept in sync with the API copy so future reconciliation paths
 * (e.g., agent-discovered relationships) have FK resolution available.
 */
const relTypeIdCache = new Map<string, string>();
export async function resolveRelationshipTypeId(
  tenantId: string,
  relationshipKey: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:${relationshipKey}`;
  if (relTypeIdCache.has(cacheKey)) return relTypeIdCache.get(cacheKey)!;

  const ref = await prisma.cmdbRelationshipTypeRef.findFirst({
    where: { tenantId, relationshipKey },
    select: { id: true },
  });

  if (ref) relTypeIdCache.set(cacheKey, ref.id);
  return ref?.id ?? null;
}

/**
 * Clear all per-process resolver caches (5 caches total). Called at the top
 * of each scheduled worker run to pick up tenant-level vocabulary changes.
 */
export function clearResolverCaches(): void {
  classIdCache.clear();
  statusIdCache.clear();
  operationalStatusIdCache.clear();
  envIdCache.clear();
  relTypeIdCache.clear();
}

export const cmdbReconciliationWorker = new Worker(
  QUEUE_NAMES.CMDB_RECONCILIATION,
  async (job) => {
    console.log(`[cmdb-reconciliation] Running global CI reconciliation sweep (job ${job.id})`);

    // Phase 7: clear all 5 resolver caches at the top of each run so
    // tenant-level vocabulary changes between scheduled runs take effect.
    clearResolverCaches();

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
        const hostname = snapshot.hostname ?? agent.hostname;
        const operatingSystem = snapshot.operatingSystem ?? null;
        const osVersion = snapshot.osVersion ?? null;
        const { classKey, legacyType } = inferClassKeyFromSnapshot(agent.platform, hostname, operatingSystem);

        // Resolve reference table IDs. Phase 7: these columns are NOT NULL in
        // the DB, so a missing resolution is a hard error (seed data should
        // always exist after seedCmdbReferenceData runs at tenant creation).
        // operationalStatusId defaults to 'online' here because reaching this
        // code path means the agent is actively reporting an inventory snapshot.
        const classIdRaw = await resolveClassId(tenantId, classKey);
        const lifecycleStatusIdRaw = await resolveLifecycleStatusId(tenantId, 'in_service');
        const environmentIdRaw = await resolveEnvironmentId(tenantId, 'prod');
        const operationalStatusIdRaw = await resolveOperationalStatusId(tenantId, 'online');
        if (!classIdRaw || !lifecycleStatusIdRaw || !environmentIdRaw || !operationalStatusIdRaw) {
          throw new Error(
            `Phase 7: missing reference data for tenant ${tenantId} ` +
              `(classKey=${classKey}: ${classIdRaw ?? 'NULL'}, ` +
              `lifecycle=in_service: ${lifecycleStatusIdRaw ?? 'NULL'}, ` +
              `env=prod: ${environmentIdRaw ?? 'NULL'}, ` +
              `operational=online: ${operationalStatusIdRaw ?? 'NULL'}). ` +
              `Run pnpm tsx packages/db/scripts/seed-existing-tenants-cmdb-ref.ts`,
          );
        }
        const classId: string = classIdRaw;
        const lifecycleStatusId: string = lifecycleStatusIdRaw;
        const environmentId: string = environmentIdRaw;
        const operationalStatusId: string = operationalStatusIdRaw;

        // Look up existing CI: first by agentId, then by hostname (handles re-enrollment)
        let existingCi = await prisma.cmdbConfigurationItem.findFirst({
          where: { agentId: agent.id, tenantId },
        });

        if (!existingCi && hostname) {
          existingCi = await prisma.cmdbConfigurationItem.findFirst({
            where: { hostname, tenantId, isDeleted: false },
          });

          // Re-link the CI to the current agent so future lookups hit the fast path
          if (existingCi) {
            await prisma.cmdbConfigurationItem.update({
              where: { id: existingCi.id },
              data: { agentId: agent.id, sourceRecordKey: agent.agentKey },
            });
            console.log(`[cmdb-reconciliation] Re-linked CI ${existingCi.id} (${hostname}) to new agent ${agent.id}`);
          }
        }

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
                // Phase 7: legacy type/status/environment enum writes removed — FK-only
                // New reference table FKs
                classId,
                lifecycleStatusId,
                operationalStatusId,
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
                  // Phase 8 (CASR-03): new CmdbCiServer columns
                  cpuModel: snapshot.cpuModel ?? null,
                  memoryGb: snapshot.ramGb,
                  storageGb: totalStorageGb,
                  domainName: snapshot.domainName ?? null,
                  virtualizationPlatform: snapshot.hypervisorType ?? null,
                  // Phase 8 (CASR-03): verbatim move targets from Asset.disks /
                  // Asset.networkInterfaces. Worker writes these alongside the
                  // existing extension fields so reconciled CIs carry full
                  // hardware detail per the field-ownership contract.
                  disksJson: snapshot.disks as never,
                  networkInterfacesJson: snapshot.networkInterfaces as never,
                  backupRequired: false,
                },
              });

              // Phase 8 (CASR-03 / D-05 / D-06): write cmdb_software_installed
              // rows for each software item in the snapshot. Multi-tenancy
              // (CLAUDE.md Rule 1): every row carries the worker's per-job
              // tenantId — never derived from the row payload.
              const softwareList = parseSoftwareList(snapshot.installedSoftware);
              for (const item of softwareList) {
                const normalizedVersion = (item.version ?? '').trim() || 'unknown';
                await tx.cmdbSoftwareInstalled.upsert({
                  where: {
                    ciId_name_version: {
                      ciId: ci.id,
                      name: item.name,
                      version: normalizedVersion,
                    },
                  },
                  create: {
                    tenantId,
                    ciId: ci.id,
                    name: item.name,
                    version: normalizedVersion,
                    vendor: item.vendor ?? null,
                    publisher: item.publisher ?? null,
                    installDate: item.installDate ? new Date(item.installDate) : null,
                    source: 'agent',
                    lastSeenAt: new Date(),
                  },
                  update: {
                    lastSeenAt: new Date(),
                    vendor: item.vendor ?? undefined,
                    publisher: item.publisher ?? undefined,
                  },
                });
              }
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
                    // Phase 8 (CASR-03): new CmdbCiServer columns
                    cpuModel: snapshot.cpuModel ?? null,
                    memoryGb: snapshot.ramGb,
                    storageGb: totalStorageGb,
                    domainName: snapshot.domainName ?? null,
                    virtualizationPlatform: snapshot.hypervisorType ?? null,
                    // Phase 8 (CASR-03): verbatim move targets
                    disksJson: snapshot.disks as never,
                    networkInterfacesJson: snapshot.networkInterfaces as never,
                    backupRequired: false,
                  },
                  update: {
                    ...(operatingSystem ? { operatingSystem } : {}),
                    ...(osVersion ? { osVersion } : {}),
                    ...(snapshot.cpuCores ? { cpuCount: snapshot.cpuCores } : {}),
                    // Phase 8 (CASR-03): write the three new fields on update too
                    ...(snapshot.cpuModel ? { cpuModel: snapshot.cpuModel } : {}),
                    ...(snapshot.ramGb ? { memoryGb: snapshot.ramGb } : {}),
                    ...(totalStorageGb ? { storageGb: totalStorageGb } : {}),
                    ...(snapshot.domainName ? { domainName: snapshot.domainName } : {}),
                    ...(snapshot.hypervisorType ? { virtualizationPlatform: snapshot.hypervisorType } : {}),
                    ...(isVm ? { serverType: snapshot.hypervisorType ?? 'virtual_machine' } : {}),
                    ...(snapshot.disks ? { disksJson: snapshot.disks as never } : {}),
                    ...(snapshot.networkInterfaces
                      ? { networkInterfacesJson: snapshot.networkInterfaces as never }
                      : {}),
                  },
                });

                // Phase 8 (CASR-03 / D-05 / D-06): write cmdb_software_installed
                // rows for each software item — same pattern as the create path
                // above. Multi-tenancy: tenantId comes from the worker's per-job
                // context, never from row payload.
                const softwareList = parseSoftwareList(snapshot.installedSoftware);
                for (const item of softwareList) {
                  const normalizedVersion = (item.version ?? '').trim() || 'unknown';
                  await tx.cmdbSoftwareInstalled.upsert({
                    where: {
                      ciId_name_version: {
                        ciId: existingCi.id,
                        name: item.name,
                        version: normalizedVersion,
                      },
                    },
                    create: {
                      tenantId,
                      ciId: existingCi.id,
                      name: item.name,
                      version: normalizedVersion,
                      vendor: item.vendor ?? null,
                      publisher: item.publisher ?? null,
                      installDate: item.installDate ? new Date(item.installDate) : null,
                      source: 'agent',
                      lastSeenAt: new Date(),
                    },
                    update: {
                      lastSeenAt: new Date(),
                      vendor: item.vendor ?? undefined,
                      publisher: item.publisher ?? undefined,
                    },
                  });
                }
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

        // ─── Inventory Diff ─────────────────────────────────────────────────
        // Compute and store a diff between the previous and current snapshot.
        // Duplicated inline from apps/api/src/services/inventory-diff.service.ts
        // per the project's no-cross-app-import convention.
        // Returns early if this is the first snapshot or nothing changed.
        try {
          await computeAndStoreInventoryDiff(tenantId, agent.id, snapshot);
        } catch (diffErr) {
          const msg = diffErr instanceof Error ? diffErr.message : String(diffErr);
          console.error(`[cmdb-reconciliation] Diff write failed for agent ${agent.id}: ${msg}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cmdb-reconciliation] Error processing agent ${agent.id}: ${message}`);
      }
    }

    // ─── Step 2: Mark stale CIs (agentId set, lastSeenAt > 24h) ────────────

    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Phase 7: this filter still reads the legacy `status` enum column.
    // Phase 14 rewrites to JOIN cmdb_statuses ON lifecycleStatusId /
    // operationalStatusId once the legacy columns are dropped.
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
        // Phase 7 (CREF-02): write operationalStatusId='offline' instead of
        // the legacy status='INACTIVE' enum. If the tenant is missing the
        // seeded 'offline' operational status row, skip (with a warning) so
        // the worker never writes a null FK into the column.
        const offlineStatusId = await resolveOperationalStatusId(ci.tenantId, 'offline');
        if (!offlineStatusId) {
          console.warn(
            `[cmdb-reconciliation] Tenant ${ci.tenantId} missing 'offline' operational status — skipping stale marker for CI ${ci.id}`,
          );
          continue;
        }

        await prisma.$transaction(async (tx) => {
          await tx.cmdbChangeRecord.create({
            data: {
              tenantId: ci.tenantId,
              ciId: ci.id,
              changeType: 'UPDATED',
              // Phase 7: audit now references the FK column by name + the
              // operational-status key (not the old enum label).
              fieldName: 'operationalStatusId',
              oldValue: '(unknown)',
              newValue: 'offline',
              changedBy: 'AGENT',
              agentId: ci.agentId,
            },
          });

          await tx.cmdbConfigurationItem.update({
            where: { id: ci.id },
            // Phase 7: legacy status='INACTIVE' write removed — FK-only.
            data: { operationalStatusId: offlineStatusId },
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

// ─── Inventory Diff (inlined from apps/api/src/services/inventory-diff.service.ts) ──
//
// Duplicated here per the project's no-cross-app-import convention.
// Keep in sync with the API service copy when diff logic or types change.

type InventorySnapshotForDiff = {
  id: string;
  agentId: string;
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

function diffSoftwareInline(from: unknown, to: unknown) {
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

function diffServicesInline(from: unknown, to: unknown) {
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

function diffHardwareInline(from: InventorySnapshotForDiff, to: InventorySnapshotForDiff) {
  const result: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of DIFF_HARDWARE_FIELDS) {
    const fromVal = from[field] ?? null;
    const toVal = to[field] ?? null;
    if (fromVal === null && toVal === null) continue;
    if (fromVal !== toVal) result[field as string] = { from: fromVal, to: toVal };
  }
  return result;
}

function diffNetworkInline(from: unknown, to: unknown) {
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
 * Compute the diff between the previous snapshot and `toSnapshot` for this agent,
 * then persist an InventoryDiff row. Returns early if no prior snapshot exists or
 * if nothing changed across all diff sections.
 *
 * Inlined from apps/api/src/services/inventory-diff.service.ts — no-cross-app-import rule.
 */
async function computeAndStoreInventoryDiff(
  tenantId: string,
  agentId: string,
  toSnapshot: InventorySnapshotForDiff,
): Promise<void> {
  const fromSnapshot = await prisma.inventorySnapshot.findFirst({
    where: { tenantId, agentId, id: { not: toSnapshot.id } },
    orderBy: { collectedAt: 'desc' },
  });

  if (!fromSnapshot) return; // first snapshot — nothing to diff

  const software = diffSoftwareInline(fromSnapshot.installedSoftware, toSnapshot.installedSoftware);
  const services = diffServicesInline(fromSnapshot.services, toSnapshot.services);
  const hardware = diffHardwareInline(fromSnapshot as InventorySnapshotForDiff, toSnapshot);
  const network  = diffNetworkInline(fromSnapshot.networkInterfaces, toSnapshot.networkInterfaces);

  const hasChanges =
    software.length > 0 ||
    services.length > 0 ||
    Object.keys(hardware).length > 0 ||
    network.length > 0;

  if (!hasChanges) return; // no-op snapshot

  const diffJson: Record<string, unknown> = {};
  if (software.length > 0) diffJson.software = software;
  if (services.length > 0) diffJson.services = services;
  if (Object.keys(hardware).length > 0) diffJson.hardware = hardware;
  if (network.length > 0) diffJson.network = network;

  await prisma.inventoryDiff.create({
    data: {
      tenantId,
      agentId,
      ciId: null, // linked by timeline API via agentId → CI lookup
      fromSnapshotId: fromSnapshot.id,
      toSnapshotId: toSnapshot.id,
      diffJson: diffJson as never,
      collectedAt: toSnapshot.collectedAt,
    },
  });
}
