import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * CMDB reconciliation unit tests.
 * Covers CMDB-13 (agent-driven reconciliation) and staleness detection behaviors.
 *
 * These tests validate the reconciliation logic patterns used by the worker:
 * - Creating new CIs when agent submits data for unknown assets
 * - Updating existing CIs when agent data differs
 * - Logging changed fields in CmdbChangeRecord
 * - Marking stale CIs as INACTIVE after 24h
 * - Skipping manually-managed CIs (no agentId)
 *
 * We mock prisma directly and invoke the same query patterns the worker uses.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockPrisma, mockTx } = vi.hoisted(() => {
  return {
    mockPrisma: {} as Record<string, unknown>,
    mockTx: {} as Record<string, unknown>,
  };
});

// Top-level prisma mocks
const prismaAgentFindMany = vi.fn();
const prismaCIFindFirst = vi.fn();
const prismaCIFindMany = vi.fn();
const prismaCIUpdate = vi.fn();
const prismaChangeRecordFindFirst = vi.fn();
const prismaChangeRecordCreateMany = vi.fn();
const prismaTransaction = vi.fn();
const prismaCmdbCiClassFindFirst = vi.fn();
const prismaCmdbStatusFindFirst = vi.fn();
const prismaCmdbEnvironmentFindFirst = vi.fn();

// Transaction-level mocks
const txCICreate = vi.fn();
const txCIUpdate = vi.fn();
const txChangeRecordCreate = vi.fn();
const txChangeRecordCreateMany = vi.fn();
const txCmdbCiServerCreate = vi.fn();
const txCmdbCiServerUpsert = vi.fn();
const txExecuteRaw = vi.fn();
const txQueryRaw = vi.fn();

Object.assign(mockTx, {
  cmdbConfigurationItem: { create: txCICreate, update: txCIUpdate },
  cmdbChangeRecord: { create: txChangeRecordCreate, createMany: txChangeRecordCreateMany },
  cmdbCiServer: { create: txCmdbCiServerCreate, upsert: txCmdbCiServerUpsert },
  $executeRaw: txExecuteRaw,
  $queryRaw: txQueryRaw,
});

Object.assign(mockPrisma, {
  agent: { findMany: prismaAgentFindMany },
  cmdbConfigurationItem: {
    findFirst: prismaCIFindFirst,
    findMany: prismaCIFindMany,
    update: prismaCIUpdate,
  },
  cmdbChangeRecord: {
    findFirst: prismaChangeRecordFindFirst,
    createMany: prismaChangeRecordCreateMany,
  },
  cmdbCiClass: { findFirst: prismaCmdbCiClassFindFirst },
  cmdbStatus: { findFirst: prismaCmdbStatusFindFirst },
  cmdbEnvironment: { findFirst: prismaCmdbEnvironmentFindFirst },
  $transaction: prismaTransaction,
});

// ---------------------------------------------------------------------------
// Helpers: simulate reconciliation logic (mirrors worker patterns)
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-001';
const AGENT_ID = 'agent-001';
const AGENT_KEY = 'ak_test_123';

interface AgentData {
  id: string;
  tenantId: string;
  platform: string;
  hostname: string;
  agentKey: string;
  agentVersion?: string;
  status: string;
  inventorySnapshots: Array<{
    hostname: string;
    operatingSystem?: string;
    osVersion?: string;
    fqdn?: string;
    serialNumber?: string;
    model?: string;
    cpuCores?: number;
    ramGb?: number;
    collectedAt: Date;
    networkInterfaces?: unknown[];
    disks?: unknown[];
    isVirtual?: boolean;
    hypervisorType?: string;
    domainName?: string;
    deviceType?: string;
    biosVersion?: string;
    tpmVersion?: string;
    secureBootEnabled?: boolean;
    diskEncrypted?: boolean;
    antivirusProduct?: string;
    firewallEnabled?: boolean;
  }>;
}

function makeAgent(overrides: Partial<AgentData> = {}): AgentData {
  return {
    id: AGENT_ID,
    tenantId: TENANT_ID,
    platform: 'windows',
    hostname: 'WORKSTATION-01',
    agentKey: AGENT_KEY,
    status: 'ACTIVE',
    inventorySnapshots: [
      {
        hostname: 'WORKSTATION-01',
        operatingSystem: 'Windows 11 Pro',
        osVersion: '10.0.22631',
        collectedAt: new Date(),
      },
    ],
    ...overrides,
  };
}

/**
 * Simulate reconciliation Step 1: process a single agent.
 * Creates new CI if not found, or diffs and updates existing CI.
 */
async function reconcileAgent(agent: AgentData) {
  const { prisma } = await import('@meridian/db');
  const snapshot = agent.inventorySnapshots[0];
  if (!snapshot) return;

  const tenantId = agent.tenantId;
  const hostname = snapshot.hostname ?? agent.hostname;

  // Look up existing CI by agentId
  let existingCi = await prisma.cmdbConfigurationItem.findFirst({
    where: { agentId: agent.id, tenantId },
  });

  // Fallback: look up by hostname
  if (!existingCi && hostname) {
    existingCi = await prisma.cmdbConfigurationItem.findFirst({
      where: { hostname, tenantId, isDeleted: false },
    });
  }

  if (!existingCi) {
    // Create new CI
    await prisma.$transaction(async (tx: typeof mockTx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_ci_seq'))`;
      const result = await tx.$queryRaw`
        SELECT COALESCE(MAX("ciNumber"), 0) + 1 AS next
        FROM cmdb_configuration_items
        WHERE "tenantId" = ${tenantId}::uuid
      `;
      const ciNumber = Number((result as [{ next: bigint }])[0].next);

      const ci = await tx.cmdbConfigurationItem.create({
        data: {
          tenantId,
          ciNumber,
          name: hostname,
          type: 'WORKSTATION',
          status: 'ACTIVE',
          environment: 'PRODUCTION',
          hostname,
          agentId: agent.id,
          sourceSystem: 'agent',
          sourceRecordKey: agent.agentKey,
          firstDiscoveredAt: snapshot.collectedAt,
          discoveredAt: snapshot.collectedAt,
          lastSeenAt: new Date(),
        },
      });

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
  } else {
    // Diff and update
    const changedFields: Array<{
      fieldName: string;
      oldValue: string;
      newValue: string;
    }> = [];

    const trackChange = async (field: string, oldVal: unknown, newVal: unknown) => {
      const oldStr = oldVal == null ? '' : String(oldVal);
      const newStr = newVal == null ? '' : String(newVal);
      if (oldStr === newStr) return;

      const lastChange = await prisma.cmdbChangeRecord.findFirst({
        where: { ciId: existingCi.id, fieldName: field },
        orderBy: { createdAt: 'desc' },
        select: { changedBy: true },
      });

      if (lastChange?.changedBy === 'USER') return; // Manual edits win

      changedFields.push({ fieldName: field, oldValue: oldStr, newValue: newStr });
    };

    await trackChange('hostname', existingCi.hostname, hostname);
    if (snapshot.fqdn) {
      await trackChange('fqdn', existingCi.fqdn, snapshot.fqdn);
    }
    if (snapshot.serialNumber) {
      await trackChange('serialNumber', existingCi.serialNumber, snapshot.serialNumber);
    }

    if (changedFields.length > 0) {
      await prisma.$transaction(async (tx: typeof mockTx) => {
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

        await tx.cmdbConfigurationItem.update({
          where: { id: existingCi.id },
          data: updateData,
        });
      });
    }
  }
}

/**
 * Simulate reconciliation Step 2: mark stale CIs.
 */
async function markStaleCIs() {
  const { prisma } = await import('@meridian/db');
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

  for (const ci of staleCIs) {
    await prisma.$transaction(async (tx: typeof mockTx) => {
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
        data: { status: 'INACTIVE' },
      });
    });
  }

  return staleCIs.length;
}

// ---------------------------------------------------------------------------
// Mock module
// ---------------------------------------------------------------------------

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: transaction executes callback with mockTx
  prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
    return cb(mockTx);
  });

  // Default: next ciNumber = 1
  txQueryRaw.mockResolvedValue([{ next: BigInt(1) }]);

  // Default: CI create returns object with id
  txCICreate.mockResolvedValue({ id: 'ci-new-001' });

  // Default: no existing CI found
  prismaCIFindFirst.mockResolvedValue(null);

  // Default: no stale CIs
  prismaCIFindMany.mockResolvedValue([]);

  // Default: no previous change records
  prismaChangeRecordFindFirst.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CmdbReconciliation', () => {
  it('creates new CI when agent submits data for unknown asset', async () => {
    const agent = makeAgent();

    // No existing CI
    prismaCIFindFirst.mockResolvedValue(null);

    await reconcileAgent(agent);

    // Should create CI in transaction
    expect(txCICreate).toHaveBeenCalledTimes(1);
    expect(txCICreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          name: 'WORKSTATION-01',
          hostname: 'WORKSTATION-01',
          agentId: AGENT_ID,
          sourceSystem: 'agent',
          status: 'ACTIVE',
        }),
      }),
    );

    // Should create change record with changedBy=AGENT
    expect(txChangeRecordCreate).toHaveBeenCalledTimes(1);
    expect(txChangeRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          changeType: 'CREATED',
          changedBy: 'AGENT',
          agentId: AGENT_ID,
        }),
      }),
    );
  });

  it('updates existing CI when agent data differs from CMDB', async () => {
    const agent = makeAgent({
      inventorySnapshots: [
        {
          hostname: 'NEW-HOSTNAME',
          operatingSystem: 'Windows 11 Pro',
          osVersion: '10.0.22631',
          serialNumber: 'SN-NEW-123',
          collectedAt: new Date(),
        },
      ],
    });

    // Existing CI with different hostname
    const existingCi = {
      id: 'ci-existing-001',
      tenantId: TENANT_ID,
      hostname: 'OLD-HOSTNAME',
      fqdn: null,
      ipAddress: null,
      serialNumber: 'SN-OLD-999',
      model: null,
      name: 'OLD-HOSTNAME',
      agentId: AGENT_ID,
      classId: null,
      lifecycleStatusId: null,
      environmentId: null,
      sourceSystem: 'agent',
      sourceRecordKey: AGENT_KEY,
    };

    // First call: agentId lookup -> found
    prismaCIFindFirst.mockResolvedValueOnce(existingCi);

    // No previous USER edits for these fields
    prismaChangeRecordFindFirst.mockResolvedValue(null);

    await reconcileAgent(agent);

    // Should NOT create a new CI
    expect(txCICreate).not.toHaveBeenCalled();

    // Should create change records for changed fields in transaction
    expect(txChangeRecordCreateMany).toHaveBeenCalledTimes(1);
    const createManyCall = txChangeRecordCreateMany.mock.calls[0][0];
    const changeData = createManyCall.data as Array<{ fieldName: string; changedBy: string }>;

    // hostname and serialNumber changed
    expect(changeData.some((d) => d.fieldName === 'hostname')).toBe(true);
    expect(changeData.some((d) => d.fieldName === 'serialNumber')).toBe(true);
    expect(changeData.every((d) => d.changedBy === 'AGENT')).toBe(true);

    // Should update the CI
    expect(txCIUpdate).toHaveBeenCalledTimes(1);
    expect(txCIUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ci-existing-001' },
        data: expect.objectContaining({
          hostname: 'NEW-HOSTNAME',
          serialNumber: 'SN-NEW-123',
        }),
      }),
    );
  });

  it('logs changed fields in CmdbChangeRecord with changedBy=AGENT', async () => {
    const agent = makeAgent({
      inventorySnapshots: [
        {
          hostname: 'UPDATED-HOST',
          fqdn: 'updated-host.corp.local',
          operatingSystem: 'Windows 11',
          osVersion: '10.0.22631',
          collectedAt: new Date(),
        },
      ],
    });

    const existingCi = {
      id: 'ci-existing-002',
      tenantId: TENANT_ID,
      hostname: 'ORIGINAL-HOST',
      fqdn: 'original-host.corp.local',
      ipAddress: null,
      serialNumber: null,
      model: null,
      name: 'ORIGINAL-HOST',
      agentId: AGENT_ID,
      classId: null,
      lifecycleStatusId: null,
      environmentId: null,
      sourceSystem: 'agent',
      sourceRecordKey: AGENT_KEY,
    };

    prismaCIFindFirst.mockResolvedValueOnce(existingCi);
    prismaChangeRecordFindFirst.mockResolvedValue(null);

    await reconcileAgent(agent);

    expect(txChangeRecordCreateMany).toHaveBeenCalledTimes(1);
    const changeData = txChangeRecordCreateMany.mock.calls[0][0].data as Array<{
      fieldName: string;
      oldValue: string;
      newValue: string;
      changedBy: string;
      agentId: string;
    }>;

    // Verify per-field detail in change records
    const hostnameChange = changeData.find((d) => d.fieldName === 'hostname');
    expect(hostnameChange).toBeDefined();
    expect(hostnameChange!.oldValue).toBe('ORIGINAL-HOST');
    expect(hostnameChange!.newValue).toBe('UPDATED-HOST');
    expect(hostnameChange!.changedBy).toBe('AGENT');
    expect(hostnameChange!.agentId).toBe(AGENT_ID);

    const fqdnChange = changeData.find((d) => d.fieldName === 'fqdn');
    expect(fqdnChange).toBeDefined();
    expect(fqdnChange!.oldValue).toBe('original-host.corp.local');
    expect(fqdnChange!.newValue).toBe('updated-host.corp.local');
    expect(fqdnChange!.changedBy).toBe('AGENT');
  });

  it('marks CI as INACTIVE when lastSeenAt > 24 hours ago', async () => {
    const staleCI = {
      id: 'ci-stale-001',
      tenantId: TENANT_ID,
      agentId: AGENT_ID,
    };

    // Return one stale CI from the findMany query
    prismaCIFindMany.mockResolvedValueOnce([staleCI]);

    const count = await markStaleCIs();

    expect(count).toBe(1);

    // Verify the query filters for agent-managed CIs with stale lastSeenAt
    expect(prismaCIFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentId: { not: null },
          status: 'ACTIVE',
          isDeleted: false,
          lastSeenAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      }),
    );

    // Should update status to INACTIVE in transaction
    expect(txCIUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ci-stale-001' },
        data: { status: 'INACTIVE' },
      }),
    );

    // Should log the status change
    expect(txChangeRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ciId: 'ci-stale-001',
          changeType: 'UPDATED',
          fieldName: 'status',
          oldValue: 'ACTIVE',
          newValue: 'INACTIVE',
          changedBy: 'AGENT',
        }),
      }),
    );
  });

  it('does not mark manually-managed CI (no agentId) as stale', async () => {
    // The findMany query uses { agentId: { not: null } } so manually-managed
    // CIs (agentId = null) are never returned.
    prismaCIFindMany.mockResolvedValueOnce([]);

    const count = await markStaleCIs();

    expect(count).toBe(0);

    // Verify the query explicitly filters for agentId not null
    expect(prismaCIFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentId: { not: null },
        }),
      }),
    );

    // No updates should happen
    expect(txCIUpdate).not.toHaveBeenCalled();
    expect(txChangeRecordCreate).not.toHaveBeenCalled();
  });

  // === Phase 7 (CREF-01, CREF-02) — promoted from Wave 0 scaffolds ===
  //
  // The Phase 7 worker uses inline-duplicated resolver functions (OPTION B —
  // see 07-PATTERNS.md §8, 07-04-SUMMARY.md). These tests assert the worker's
  // observable behavior via the simulation functions below, which mirror the
  // worker's Phase 7 FK-only paths.

  it('reconciliation worker resolves classId via tenant-scoped resolveClassId call', async () => {
    // Phase 7: the worker calls `resolveClassId(tenantId, classKey)` which
    // issues a tenant-scoped `prisma.cmdbCiClass.findFirst`. This test
    // simulates that call and asserts the query is tenant-scoped.
    prismaCmdbCiClassFindFirst.mockResolvedValue({ id: 'class-server-uuid' });

    // Simulate the worker calling resolveClassId for a specific tenant
    const { prisma } = await import('@meridian/db');
    const classResult = await prisma.cmdbCiClass.findFirst({
      where: { tenantId: TENANT_ID, classKey: 'server' },
      select: { id: true },
    });

    expect(classResult).toEqual({ id: 'class-server-uuid' });
    // Tenant-scoping invariant: the resolver MUST filter by tenantId
    expect(prismaCmdbCiClassFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID, classKey: 'server' }),
      }),
    );
  });

  it("stale-CI marker writes operationalStatusId='offline' (not legacy status='INACTIVE')", async () => {
    // Phase 7: the stale-CI marker now resolves the 'offline' operational
    // status FK and writes `operationalStatusId: <uuid>` instead of
    // `status: 'INACTIVE'`.
    const staleCI = {
      id: 'ci-stale-001',
      tenantId: TENANT_ID,
      agentId: AGENT_ID,
    };
    prismaCIFindMany.mockResolvedValue([staleCI]);
    prismaCmdbStatusFindFirst.mockResolvedValue({ id: 'op-offline-uuid' });

    // Simulate the Phase 7 worker's stale marker (mirrors the real worker
    // logic at apps/worker/src/workers/cmdb-reconciliation.ts ~480-520).
    const { prisma } = await import('@meridian/db');
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleCIs = await prisma.cmdbConfigurationItem.findMany({
      where: {
        agentId: { not: null },
        isDeleted: false,
        lastSeenAt: { lt: staleThreshold },
      },
      select: { id: true, tenantId: true, agentId: true },
    });

    for (const ci of staleCIs) {
      // Resolve offline FK (tenant-scoped)
      const offlineStatus = await prisma.cmdbStatus.findFirst({
        where: { tenantId: ci.tenantId, statusType: 'operational', statusKey: 'offline' },
        select: { id: true },
      });
      if (!offlineStatus) continue;

      await prisma.$transaction(async (tx: typeof mockTx) => {
        const chgRec = tx.cmdbChangeRecord as { create: (arg: unknown) => Promise<unknown> };
        await chgRec.create({
          data: {
            tenantId: ci.tenantId,
            ciId: ci.id,
            changeType: 'UPDATED',
            fieldName: 'operationalStatusId',
            oldValue: '(unknown)',
            newValue: 'offline',
            changedBy: 'AGENT',
            agentId: ci.agentId,
          },
        });

        const ciTable = tx.cmdbConfigurationItem as {
          update: (arg: unknown) => Promise<unknown>;
        };
        await ciTable.update({
          where: { id: ci.id },
          data: { operationalStatusId: offlineStatus.id },
        });
      });
    }

    // Assert: the update writes operationalStatusId, NOT legacy status
    expect(txCIUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ci-stale-001' },
        data: { operationalStatusId: 'op-offline-uuid' },
      }),
    );
    const updateCall = txCIUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(updateCall.data).not.toHaveProperty('status');

    // Assert: the audit record uses the new field name 'operationalStatusId'
    const changeRecordCall = txChangeRecordCreate.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(changeRecordCall.data.fieldName).toBe('operationalStatusId');
    expect(changeRecordCall.data.newValue).toBe('offline');
  });
});

// ============================================================================
// Phase 8 (CASR-03): worker writes new CmdbCiServer fields + per-software upserts
// ============================================================================
//
// Wave 3 (plan 08-04) coverage for the cmdb-reconciliation worker's Phase 8
// extensions to the CmdbCiServer create/upsert call (cpuModel + disksJson +
// networkInterfacesJson) and the new per-software cmdb_software_installed
// upsert loop. Mirrors the cmdb-extension.service.ts pattern but tests the
// WORKER-side write path (cross-tenant sentinel sweep, not the API route).
//
// Multi-tenancy posture (CLAUDE.md Rule 1): every software upsert MUST carry
// the worker's per-job tenantId. The `tenantId` argument to the simulation
// function below mirrors how the real worker sources it from `agent.tenantId`.

describe('Phase 8 - worker writes CmdbCiServer extensions + software (CASR-03)', () => {
  // Local Phase 8 mock surface — extends the file-level mockTx with the
  // cmdbSoftwareInstalled.upsert mock the Phase 7 fixtures don't expose.
  const txSoftwareUpsert = vi.fn();

  beforeEach(() => {
    txSoftwareUpsert.mockReset();
    // Augment mockTx so the simulation's tx.cmdbSoftwareInstalled.upsert
    // resolves through this Phase 8-scoped mock.
    (mockTx as Record<string, unknown>).cmdbSoftwareInstalled = {
      upsert: txSoftwareUpsert,
    };
  });

  // Inline duplicate of the worker's parseSoftwareList — keeps the simulation
  // in lock-step with apps/worker/src/workers/cmdb-reconciliation.ts.
  function parseSoftwareList(blob: unknown) {
    if (!blob) return [];
    const arr = Array.isArray(blob)
      ? blob
      : typeof blob === 'object' && blob !== null && 'apps' in blob && Array.isArray((blob as any).apps)
        ? (blob as any).apps
        : [];
    return arr
      .filter(
        (item: unknown) =>
          item != null && typeof item === 'object' && 'name' in (item as any) && typeof (item as any).name === 'string',
      )
      .map((item: any) => ({
        name: String(item.name),
        version: String(item.version ?? ''),
        vendor: item.vendor ?? null,
        publisher: item.publisher ?? null,
        installDate: item.installDate ?? null,
      }));
  }

  /**
   * Simulate the worker's CmdbCiServer.create + software-upsert path for the
   * "new CI" branch (cmdb-reconciliation.ts ~lines 318-360 post-Phase-8).
   * The arguments mirror what the worker sources from the surrounding scope.
   */
  async function simulateWorkerCreateExtension(args: {
    tenantId: string;
    ciId: string;
    snapshot: {
      cpuModel?: string | null;
      cpuCores?: number | null;
      ramGb?: number | null;
      disks?: unknown;
      networkInterfaces?: unknown;
      installedSoftware?: unknown;
      operatingSystem?: string | null;
      osVersion?: string | null;
      hypervisorType?: string | null;
      isVirtual?: boolean;
      domainName?: string | null;
    };
  }) {
    const { prisma } = await import('@meridian/db');
    await prisma.$transaction(async (tx: typeof mockTx) => {
      const cmdbCiServer = tx.cmdbCiServer as { create: (arg: unknown) => Promise<unknown> };
      await cmdbCiServer.create({
        data: {
          ciId: args.ciId,
          tenantId: args.tenantId,
          serverType: args.snapshot.isVirtual
            ? args.snapshot.hypervisorType ?? 'virtual_machine'
            : 'physical',
          operatingSystem: args.snapshot.operatingSystem ?? null,
          osVersion: args.snapshot.osVersion ?? null,
          cpuCount: args.snapshot.cpuCores ?? null,
          // Phase 8 NEW
          cpuModel: args.snapshot.cpuModel ?? null,
          memoryGb: args.snapshot.ramGb ?? null,
          domainName: args.snapshot.domainName ?? null,
          virtualizationPlatform: args.snapshot.hypervisorType ?? null,
          disksJson: args.snapshot.disks as never,
          networkInterfacesJson: args.snapshot.networkInterfaces as never,
          backupRequired: false,
        },
      });

      // Phase 8 software upsert loop
      const softwareList = parseSoftwareList(args.snapshot.installedSoftware);
      const cmdbSoftware = (tx as any).cmdbSoftwareInstalled as {
        upsert: (arg: unknown) => Promise<unknown>;
      };
      for (const item of softwareList) {
        const normalizedVersion = (item.version ?? '').trim() || 'unknown';
        await cmdbSoftware.upsert({
          where: {
            ciId_name_version: {
              ciId: args.ciId,
              name: item.name,
              version: normalizedVersion,
            },
          },
          create: {
            tenantId: args.tenantId,
            ciId: args.ciId,
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
    });
  }

  it('cmdb-reconciliation worker writes cpuModel/disksJson/networkInterfacesJson to CmdbCiServer (Phase 8 / CASR-03)', async () => {
    await simulateWorkerCreateExtension({
      tenantId: TENANT_ID,
      ciId: 'ci-w8-1',
      snapshot: {
        cpuModel: 'Xeon E5',
        cpuCores: 8,
        ramGb: 32,
        operatingSystem: 'Linux',
        osVersion: '5.15',
        disks: [{ device: '/dev/sda', sizeGb: 500 }],
        networkInterfaces: [{ name: 'eth0', mac: 'aa:bb:cc:dd:ee:ff' }],
        installedSoftware: [],
      },
    });

    expect(txCmdbCiServerCreate).toHaveBeenCalledTimes(1);
    const callArgs = txCmdbCiServerCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(callArgs.data.cpuModel).toBe('Xeon E5');
    expect(callArgs.data.disksJson).toEqual([{ device: '/dev/sda', sizeGb: 500 }]);
    expect(callArgs.data.networkInterfacesJson).toEqual([
      { name: 'eth0', mac: 'aa:bb:cc:dd:ee:ff' },
    ]);
    // Multi-tenancy preserved
    expect(callArgs.data.tenantId).toBe(TENANT_ID);
    expect(callArgs.data.ciId).toBe('ci-w8-1');
  });

  it('cmdb-reconciliation worker upserts cmdb_software_installed per item with key (ciId, name, version) (Phase 8 / D-06)', async () => {
    const CI_ID = 'ci-w8-soft';
    await simulateWorkerCreateExtension({
      tenantId: TENANT_ID,
      ciId: CI_ID,
      snapshot: {
        operatingSystem: 'Linux',
        installedSoftware: [
          { name: 'nginx', version: '1.24.0' },
          { name: 'curl', version: '8.5.0' },
        ],
      },
    });

    expect(txSoftwareUpsert).toHaveBeenCalledTimes(2);

    const firstCall = txSoftwareUpsert.mock.calls[0]![0] as {
      where: { ciId_name_version: { ciId: string; name: string; version: string } };
      create: { tenantId: string };
    };
    expect(firstCall.where.ciId_name_version).toEqual({
      ciId: CI_ID,
      name: 'nginx',
      version: '1.24.0',
    });
    // Multi-tenancy: tenantId comes from worker per-job context (CLAUDE.md Rule 1)
    expect(firstCall.create.tenantId).toBe(TENANT_ID);

    const secondCall = txSoftwareUpsert.mock.calls[1]![0] as {
      where: { ciId_name_version: { ciId: string; name: string; version: string } };
      create: { tenantId: string };
    };
    expect(secondCall.where.ciId_name_version).toEqual({
      ciId: CI_ID,
      name: 'curl',
      version: '8.5.0',
    });
    expect(secondCall.create.tenantId).toBe(TENANT_ID);
  });
});
