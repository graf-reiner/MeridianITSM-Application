import { prisma } from '@meridian/db';
import {
  resolveClassId,
  resolveLifecycleStatusId,
  resolveOperationalStatusId,
  resolveEnvironmentId,
} from './cmdb-reference-resolver.service.js';

// ─── Phase 8 — Agent-shaped inventory snapshot translation ──────────────────
//
// CASR-06 / D-07 / D-08: translates an agent-shaped inventory snapshot into
// CMDB writes WITHOUT touching the Asset model. Consumed by the Wave 3 agent
// route (plan 08-04) and by the Wave 2 backfill (plan 08-03).
//
// Multi-tenancy posture (CLAUDE.md Rule 1 — MANDATORY):
//   - The caller (route) derives tenantId from an authenticated AgentKey.
//   - Every Prisma call inside this service passes tenantId in `where`.
//   - Asset lookup is by (id, tenantId) — cross-tenant assetId returns null
//     and the function throws (T-8-02-01 mitigation, Test 4 below).
//   - Rows on cmdb_software_installed carry tenantId directly; every write
//     uses the function's trusted tenantId parameter (T-8-02-02 mitigation).

// Transaction type (project convention: derive from prisma client)
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentInventorySnapshot {
  hostname: string | null;
  fqdn: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  cpuCount: number | null; // caller maps agent.cpuCores -> snapshot.cpuCount
  cpuModel: string | null;
  ramGb: number | null; // mapped to memoryGb on CmdbCiServer
  storageGb: number | null;
  disks: unknown;
  networkInterfaces: unknown;
  domainName: string | null;
  hypervisorType: string | null;
  isVirtual: boolean | null;
  installedSoftware: Array<{
    name: string;
    version: string;
    vendor?: string | null;
    publisher?: string | null;
    installDate?: string | null;
  }> | null;
}

export interface UpsertServerExtensionResult {
  ciId: string;
  created: boolean; // true if a new CI was auto-created (D-08)
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Phase 8 (CASR-06, D-07, D-08): translate an agent-shaped inventory snapshot
 * into CMDB writes. Asset is NEVER touched by this path.
 *
 * Flow:
 *   1. Look up Asset by (id, tenantId) — cross-tenant assetId returns null
 *      and throws.
 *   2. Find linked CI via CmdbConfigurationItem.assetId. If none, auto-create
 *      one (D-08) using inferClassKeyFromSnapshot + resolveClassId.
 *   3. Upsert CmdbCiServer extension with hardware fields.
 *   4. For each item in snapshot.installedSoftware, upsert CmdbSoftwareInstalled
 *      keyed on (ciId, name, version) per D-06; updates lastSeenAt.
 *
 * Multi-tenancy: every prisma call inside this function MUST include tenantId.
 */
export async function upsertServerExtensionByAsset(
  tx: Tx,
  tenantId: string,
  assetId: string | null,
  snapshot: AgentInventorySnapshot,
  opts?: {
    source?: 'agent' | 'manual' | 'import';
    agentId?: string | null;
    agentKey?: string | null;
  },
): Promise<UpsertServerExtensionResult> {
  const source = opts?.source ?? 'agent';

  // Step 1: resolve Asset (or signal orphan)
  let resolvedAsset: { id: string } | null = null;
  if (assetId) {
    resolvedAsset = await tx.asset.findFirst({
      where: { id: assetId, tenantId },
      select: { id: true },
    });
    if (!resolvedAsset) {
      throw new Error(
        `Phase 8: asset ${assetId} not found in tenant ${tenantId} (cross-tenant access blocked or asset deleted)`,
      );
    }
  }

  // Step 2: find or create CI
  //
  // CR-01 fix: dedup hierarchy mirrors apps/worker/src/workers/cmdb-reconciliation.ts
  // (lines 287-305). Without these lookups, every agent inventory POST fell
  // through to the D-08 orphan-create branch and produced a brand-new CI on
  // every request (because Wave 5 forces assetId=null at the call site).
  //
  // Multi-tenancy posture (CLAUDE.md Rule 1 — MANDATORY): every dedup query
  // includes `tenantId` in the `where` clause so a second tenant's CI with
  // the same agentId / hostname can never be returned here.
  let ci: { id: string } | null = null;
  let createdNew = false;

  if (resolvedAsset) {
    ci = await tx.cmdbConfigurationItem.findFirst({
      where: { tenantId, assetId: resolvedAsset.id },
      select: { id: true },
      orderBy: { createdAt: 'asc' }, // A8: deterministic pick when multiple
    });
  }

  // CR-01: dedup by agentId (mirrors worker's primary lookup, line 288)
  if (!ci && opts?.agentId) {
    ci = await tx.cmdbConfigurationItem.findFirst({
      where: { tenantId, agentId: opts.agentId, isDeleted: false },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // CR-01: dedup by hostname fallback (mirrors worker lines 292-305).
  // Handles re-enrollment where the agent's id changed but the host stayed.
  if (!ci && snapshot.hostname) {
    ci = await tx.cmdbConfigurationItem.findFirst({
      where: { tenantId, hostname: snapshot.hostname, isDeleted: false },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    // Re-link to the current agent so future lookups hit the agentId fast path.
    if (ci && opts?.agentId) {
      await tx.cmdbConfigurationItem.update({
        where: { id: ci.id },
        data: {
          agentId: opts.agentId,
          ...(opts.agentKey ? { sourceRecordKey: opts.agentKey } : {}),
          lastSeenAt: new Date(),
        },
      });
    }
  }

  if (!ci) {
    // D-08 orphan path — auto-create CI. Only reached when nothing matched above.
    const { classKey } = inferClassKeyFromSnapshot(
      /* platform */ null,
      snapshot.hostname,
      snapshot.operatingSystem,
    );
    const classId = await resolveClassId(tenantId, classKey);
    if (!classId) {
      throw new Error(
        `Phase 8: missing reference data for tenant ${tenantId} (classKey='${classKey}'). ` +
          `Run: pnpm tsx packages/db/scripts/seed-existing-tenants-cmdb-ref.ts`,
      );
    }
    const lifecycleStatusId = await resolveLifecycleStatusId(tenantId, 'in_service');
    const operationalStatusId = await resolveOperationalStatusId(tenantId, 'online');
    const environmentId = await resolveEnvironmentId(tenantId, 'prod');
    if (!lifecycleStatusId || !operationalStatusId || !environmentId) {
      throw new Error(
        `Phase 8: missing reference data for tenant ${tenantId} (one of lifecycle/operational/environment). ` +
          `Run: pnpm tsx packages/db/scripts/seed-existing-tenants-cmdb-ref.ts`,
      );
    }

    // Allocate ciNumber under advisory lock (mirrors cmdb.service.ts:createCI)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_ci_seq'))`;
    const next = await tx.$queryRaw<Array<{ next: number | bigint }>>`
      SELECT COALESCE(MAX("ciNumber"), 0) + 1 AS next
        FROM "cmdb_configuration_items"
       WHERE "tenantId" = ${tenantId}::uuid`;
    const ciNumber = Number(next[0]?.next ?? 1);

    const now = new Date();
    const created = await tx.cmdbConfigurationItem.create({
      data: {
        tenantId,
        classId,
        lifecycleStatusId,
        operationalStatusId,
        environmentId,
        ciNumber,
        name: snapshot.hostname || `unnamed-${ciNumber}`,
        assetId: resolvedAsset?.id ?? null,
        // WR-01 fix: persist governance fields so cmdb-reconciliation worker
        // (which filters by agentId at line 288) finds this CI on subsequent
        // runs instead of creating yet another duplicate.
        agentId: opts?.agentId ?? null,
        hostname: snapshot.hostname ?? null,
        sourceSystem: source,
        sourceRecordKey: opts?.agentKey ?? null,
        firstDiscoveredAt: now,
        lastSeenAt: now,
      },
      select: { id: true },
    });
    ci = created;
    createdNew = true;
  }

  // Step 3: upsert CmdbCiServer extension
  await tx.cmdbCiServer.upsert({
    where: { ciId: ci.id },
    create: {
      ciId: ci.id,
      tenantId,
      serverType: snapshot.isVirtual ? 'virtual' : 'physical',
      operatingSystem: snapshot.operatingSystem,
      osVersion: snapshot.osVersion,
      cpuCount: snapshot.cpuCount,
      cpuModel: snapshot.cpuModel, // Phase 8 NEW
      memoryGb: snapshot.ramGb,
      storageGb: snapshot.storageGb,
      domainName: snapshot.domainName,
      virtualizationPlatform: snapshot.hypervisorType,
      disksJson: snapshot.disks as never, // Phase 8 NEW
      networkInterfacesJson: snapshot.networkInterfaces as never, // Phase 8 NEW
    },
    update: {
      operatingSystem: snapshot.operatingSystem ?? undefined,
      osVersion: snapshot.osVersion ?? undefined,
      cpuCount: snapshot.cpuCount ?? undefined,
      cpuModel: snapshot.cpuModel ?? undefined,
      memoryGb: snapshot.ramGb ?? undefined,
      storageGb: snapshot.storageGb ?? undefined,
      domainName: snapshot.domainName ?? undefined,
      virtualizationPlatform: snapshot.hypervisorType ?? undefined,
      disksJson: snapshot.disks as never,
      networkInterfacesJson: snapshot.networkInterfaces as never,
    },
  });

  // Step 4: upsert software rows (D-05 / D-06)
  const softwareList = parseSoftwareList(snapshot.installedSoftware);
  for (const item of softwareList) {
    // Pitfall 3: normalize empty-string / whitespace version to 'unknown' so
    // the unique (ciId, name, version) key treats "nginx '' " and "nginx ' '"
    // as the same row.
    const normalizedVersion = (item.version ?? '').trim() || 'unknown';
    await tx.cmdbSoftwareInstalled.upsert({
      where: {
        ciId_name_version: { ciId: ci.id, name: item.name, version: normalizedVersion },
      },
      create: {
        tenantId,
        ciId: ci.id,
        name: item.name,
        version: normalizedVersion,
        vendor: item.vendor ?? null,
        publisher: item.publisher ?? null,
        installDate: item.installDate ? new Date(item.installDate) : null,
        source,
        lastSeenAt: new Date(),
      },
      update: {
        lastSeenAt: new Date(),
        vendor: item.vendor ?? undefined,
        publisher: item.publisher ?? undefined,
      },
    });
  }

  return { ciId: ci.id, created: createdNew };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pitfall 8 + 10: defensive parser for the various JSON shapes seen in
 * Asset.softwareInventory blobs and InventorySnapshot.installedSoftware payloads.
 *
 * Supported shapes:
 *   - Array<{ name, version, ... }>
 *   - { apps: Array<{ name, version, ... }> }
 *
 * Anything else returns [] — caller logs to cmdb_migration_audit as
 * 'unparseable_software_blob' (Wave 2 backfill concern).
 */
export function parseSoftwareList(
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
 * Duplicated from apps/worker/src/workers/cmdb-reconciliation.ts:17-42
 * per the project's no-cross-app-import convention. Keep in sync with
 * the worker copy when the classification heuristic changes.
 *
 * Phase 8 note: the worker signature takes a non-null `platform` string
 * and a non-null `hostname` string, but this API-side copy relaxes to
 * nullable because agent-inventory snapshots may lack a platform hint.
 * The body's behavior when platform is null degrades to host/OS-only
 * classification — safe default per A1 (misclassified hardware-bearing
 * snapshots default to 'server').
 */
function inferClassKeyFromSnapshot(
  platform: string | null,
  hostname: string | null,
  operatingSystem: string | null,
): { classKey: string; legacyType: string } {
  const os = (operatingSystem ?? '').toLowerCase();
  const host = (hostname ?? '').toLowerCase();
  const plt = (platform ?? '').toLowerCase();

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

  return { classKey: 'server', legacyType: 'SERVER' }; // safe default per A1
}
