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

  // === Phase 7 (CREF-01, CREF-02) ===
  // Scaffolds surfaced as pending; bodies land in Plan 04 once the worker
  // imports resolveClassId/resolveOperationalStatusId from the new
  // cmdb-reference-resolver.service and drops the legacy `type`/`status` writes.
  it.todo('reconciliation worker resolves classId via resolveClassId from shared resolver service');
  it.todo("stale-CI marker writes operationalStatusId='offline' (not legacy status='INACTIVE')");
});
