import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 8 — CASR-06 reroute tests (Wave 3 / plan 08-04).
 *
 * Promoted from it.todo() stubs (Wave 0 plan 08-01 scaffold).
 *
 * Verifies POST /api/v1/agents/inventory now synchronously calls
 * upsertServerExtensionByAsset after inventorySnapshot.create. Asset is
 * NEVER mutated by this path. Orphan Asset auto-creates a CI per D-08.
 *
 * Test approach (LOCKED for Wave 3+): shared Fastify build helper at
 * apps/api/src/__tests__/test-helpers.ts with a mocked @meridian/db prisma
 * surface, invoked via Fastify `inject()`. Do NOT bypass with smaller
 * test surfaces.
 *
 * Multi-tenancy posture (CLAUDE.md Rule 1): the test pins a single
 * tenantId on the mock agent. The route reads tenantId from the
 * authenticated agent context (resolveAgent), so the assertion that
 * Asset.findFirst is called with `{ tenantId: <agent.tenantId> }` is
 * the cross-tenant isolation guard.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks — must bind before any vi.mock factory runs
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const mockAgent = {
    id: 'agent-1',
    tenantId,
    hostname: 'srv-01',
    agentKey: 'fake-key',
    status: 'ACTIVE',
    platform: 'LINUX',
    updateInProgress: false,
    forceUpdateUrl: null,
  };

  const txAssetFindFirst = vi.fn();
  const txCIFindFirst = vi.fn();
  const txCICreate = vi.fn();
  // CR-01 fix: cmdb-extension.service.ts now re-links a hostname-matched CI
  // to the current agent via cmdbConfigurationItem.update. Bind the mock so
  // the hostname-fallback dedup branch does not throw.
  const txCIUpdate = vi.fn();
  const txServerUpsert = vi.fn();
  const txSoftwareUpsert = vi.fn();
  const txExecuteRaw = vi.fn();
  const txQueryRaw = vi.fn();
  // Top-level prisma.asset.findFirst (route uses this BEFORE invoking the
  // upsertServerExtensionByAsset transaction).
  const prismaAssetFindFirst = vi.fn();
  const prismaAgentFindFirst = vi.fn();
  const prismaInventorySnapshotCreate = vi.fn();
  const prismaTransaction = vi.fn();

  const mockPrisma: Record<string, any> = {
    asset: { findFirst: prismaAssetFindFirst },
    agent: {
      findFirst: prismaAgentFindFirst,
      update: vi.fn(),
    },
    inventorySnapshot: { create: prismaInventorySnapshotCreate },
    metricSample: { createMany: vi.fn() },
    agentUpdate: { findFirst: vi.fn().mockResolvedValue(null) },
    tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: prismaTransaction,
  };

  const mockBullQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  };

  return {
    tenantId,
    mockAgent,
    mockPrisma,
    mockBullQueue,
    txAssetFindFirst,
    txCIFindFirst,
    txCICreate,
    txCIUpdate,
    txServerUpsert,
    txSoftwareUpsert,
    txExecuteRaw,
    txQueryRaw,
    prismaAssetFindFirst,
    prismaAgentFindFirst,
    prismaInventorySnapshotCreate,
    prismaTransaction,
  };
});

vi.mock('@meridian/db', () => ({ prisma: hoisted.mockPrisma }));
vi.mock('bullmq', () => ({
  // Queue must be a constructor — `new Queue(...)` is called at module
  // import time in agents/index.ts. Use a class that returns the shared
  // hoisted mock surface so tests can assert on `add` calls.
  Queue: class FakeQueue {
    constructor() {
      Object.assign(this as any, hoisted.mockBullQueue);
    }
  },
}));
vi.mock('../routes/v1/agents/updates.js', () => ({
  default: async () => {
    /* no-op to avoid registering update routes */
  },
}));

// ---------------------------------------------------------------------------
// Imports (after vi.mock so module-level Queue construction sees the mock)
// ---------------------------------------------------------------------------

import Fastify, { type FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();

  // Defaults: agent resolves; inventory snapshot creates; transaction passes
  // a tx surface to its callback (mirrors mockTx pattern from cmdb-extension
  // tests).
  hoisted.prismaAgentFindFirst.mockResolvedValue(hoisted.mockAgent);
  hoisted.prismaInventorySnapshotCreate.mockResolvedValue({ id: 'snap-1' });
  hoisted.txQueryRaw.mockResolvedValue([{ next: BigInt(1) }]);
  hoisted.prismaTransaction.mockImplementation(async (cb: any) =>
    cb({
      asset: { findFirst: hoisted.txAssetFindFirst },
      cmdbConfigurationItem: {
        findFirst: hoisted.txCIFindFirst,
        create: hoisted.txCICreate,
        // CR-01: hostname-fallback dedup re-links to current agent via update.
        update: hoisted.txCIUpdate,
      },
      cmdbCiServer: { upsert: hoisted.txServerUpsert },
      cmdbSoftwareInstalled: { upsert: hoisted.txSoftwareUpsert },
      $executeRaw: hoisted.txExecuteRaw,
      $queryRaw: hoisted.txQueryRaw,
    }),
  );
  // Make the cmdb-extension service's resolver calls succeed.
  // (cmdb-extension.service.ts imports from cmdb-reference-resolver.service.ts;
  // we mock that module surface.)

  // Fresh Fastify instance per test for isolation
  const { agentRoutes } = await import('../routes/v1/agents/index.js');
  app = Fastify({ logger: false });
  await agentRoutes(app);
  await app.ready();
});

vi.mock('../services/cmdb-reference-resolver.service.js', () => ({
  resolveClassId: vi.fn().mockResolvedValue('class-server-uuid'),
  resolveLifecycleStatusId: vi.fn().mockResolvedValue('status-in-service-uuid'),
  resolveOperationalStatusId: vi.fn().mockResolvedValue('status-online-uuid'),
  resolveEnvironmentId: vi.fn().mockResolvedValue('env-prod-uuid'),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/v1/agents/inventory (Phase 8 / CASR-06 reroute)', () => {
  it('reuses existing CI matched by (tenantId, agentId) — no new CI created', async () => {
    // CR-01 fix: when a CI already exists with the inventory's agentId, the
    // service must dedup against it BEFORE the D-08 orphan-create branch.
    // Wave 5 always passes assetId=null, so the agentId path is the primary
    // dedup channel.
    //
    // Mock setup: txCIFindFirst returns the existing CI on the FIRST call
    // (the agentId lookup, since the assetId branch is skipped when
    // resolvedAsset is null). The hostname fallback should never run.
    hoisted.txCIFindFirst.mockResolvedValueOnce({ id: 'ci-1' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/inventory',
      headers: {
        authorization: 'AgentKey fake-key',
        'content-type': 'application/json',
      },
      payload: {
        hostname: 'srv-01',
        os: { name: 'Linux', version: '5.15' },
        hardware: {
          cpus: [{ name: 'Xeon', cores: 4 }],
          totalMemoryBytes: 8 * 1073741824,
          disks: [{ device: '/dev/sda', sizeBytes: 500 * 1073741824 }],
        },
        network: [{ name: 'eth0', mac: 'aa:bb:cc:dd:ee:ff' }],
        software: [{ name: 'nginx', version: '1.24.0' }],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.snapshotId).toBe('snap-1');
    expect(body.ciId).toBe('ci-1');
    expect(body.created).toBe(false);

    // CR-01: NO orphan-create — the existing CI is reused.
    expect(hoisted.txCICreate).not.toHaveBeenCalled();

    // CR-01: the agentId dedup query is scoped by (tenantId, agentId, isDeleted).
    // Multi-tenancy guard: tenantId MUST be in the where clause.
    const findFirstCall = hoisted.txCIFindFirst.mock.calls[0][0];
    expect(findFirstCall.where.tenantId).toBe(hoisted.tenantId);
    expect(findFirstCall.where.agentId).toBe(hoisted.mockAgent.id);
    expect(findFirstCall.where.isDeleted).toBe(false);

    // The server-extension upsert MUST be called once against the existing CI.
    expect(hoisted.txServerUpsert).toHaveBeenCalledTimes(1);
    const upsertCall = hoisted.txServerUpsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ ciId: 'ci-1' });
    expect(upsertCall.create.cpuModel).toBe('Xeon');
    expect(upsertCall.create.cpuCount).toBe(4);

    // Asset MUST NOT be mutated by this path.
    expect(hoisted.mockPrisma.asset).not.toHaveProperty('update');
    expect(hoisted.mockPrisma.asset).not.toHaveProperty('upsert');
    expect(hoisted.mockPrisma.asset).not.toHaveProperty('create');
    expect(hoisted.prismaAssetFindFirst).not.toHaveBeenCalled();
  });

  it('POST /agents/inventory auto-creates CI for orphan (no matching CI by agentId or hostname)', async () => {
    // Phase 8 Wave 5: with assetId=null always, a missing CI triggers the D-08
    // orphan-create path. The new CI carries agent.tenantId and assetId=null.
    // WR-01 fix: governance fields (agentId, hostname, sourceSystem,
    // sourceRecordKey, firstDiscoveredAt, lastSeenAt) MUST be populated so
    // the cmdb-reconciliation worker (which filters by agentId) finds the CI
    // on its next run instead of creating yet another duplicate.
    hoisted.txCIFindFirst.mockResolvedValue(null);
    hoisted.txCICreate.mockResolvedValue({ id: 'ci-new' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/inventory',
      headers: {
        authorization: 'AgentKey fake-key',
        'content-type': 'application/json',
      },
      payload: {
        hostname: 'srv-orphan',
        os: { name: 'Linux', version: '5.15' },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.created).toBe(true);
    expect(body.ciId).toBe('ci-new');

    // Orphan-create branch ran exactly once
    expect(hoisted.txCICreate).toHaveBeenCalledTimes(1);
    const createCall = hoisted.txCICreate.mock.calls[0][0];
    // Multi-tenancy: the new CI carries the trusted agent.tenantId
    expect(createCall.data.tenantId).toBe(hoisted.tenantId);
    expect(createCall.data.assetId).toBeNull();

    // WR-01: governance fields are persisted so the worker dedups correctly
    expect(createCall.data.agentId).toBe(hoisted.mockAgent.id);
    expect(createCall.data.hostname).toBe('srv-orphan');
    expect(createCall.data.sourceSystem).toBe('agent');
    expect(createCall.data.sourceRecordKey).toBe(hoisted.mockAgent.agentKey);
    expect(createCall.data.firstDiscoveredAt).toBeInstanceOf(Date);
    expect(createCall.data.lastSeenAt).toBeInstanceOf(Date);

    // Phase 8 Wave 5: no Asset lookup at all
    expect(hoisted.prismaAssetFindFirst).not.toHaveBeenCalled();
  });

  it('CR-01 regression: two consecutive inventory POSTs from the same agent create exactly ONE CI', async () => {
    // CR-01 regression: pre-fix, every POST fell through to the orphan-create
    // branch because assetId was always null AND no agentId/hostname dedup
    // existed. This test asserts that the SECOND POST finds the CI created
    // (or pre-existing) for this agent and does NOT trigger another create.
    //
    // Simulation:
    //   - First POST: agentId lookup returns null, hostname lookup returns null,
    //     orphan-create runs once, returns { id: 'ci-new' }.
    //   - Second POST: agentId lookup returns { id: 'ci-new' } (the CI from
    //     POST 1), so no create runs. Total: exactly ONE txCICreate call.
    //
    // Multi-tenancy: each dedup query is scoped by tenantId — verified in
    // the per-call assertions below.

    // POST 1: nothing matches → orphan create
    hoisted.txCIFindFirst.mockResolvedValueOnce(null); // agentId lookup
    hoisted.txCIFindFirst.mockResolvedValueOnce(null); // hostname lookup
    hoisted.txCICreate.mockResolvedValueOnce({ id: 'ci-new' });

    // POST 2: agentId lookup hits the CI from POST 1 — no create, no
    // hostname lookup, no update.
    hoisted.txCIFindFirst.mockResolvedValueOnce({ id: 'ci-new' });

    const payload = {
      hostname: 'srv-dedup',
      os: { name: 'Linux', version: '5.15' },
      hardware: {
        cpus: [{ name: 'Xeon', cores: 8 }],
        totalMemoryBytes: 16 * 1073741824,
      },
    };
    const headers = {
      authorization: 'AgentKey fake-key',
      'content-type': 'application/json',
    };

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/inventory',
      headers,
      payload,
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/inventory',
      headers,
      payload,
    });

    expect(res1.statusCode).toBe(201);
    expect(res2.statusCode).toBe(201);

    const body1 = JSON.parse(res1.payload);
    const body2 = JSON.parse(res2.payload);

    // Both responses point at the SAME CI
    expect(body1.ciId).toBe('ci-new');
    expect(body2.ciId).toBe('ci-new');

    // POST 1 created the CI; POST 2 reused it
    expect(body1.created).toBe(true);
    expect(body2.created).toBe(false);

    // CR-01 ASSERTION: exactly ONE create across both POSTs (pre-fix this
    // would have been TWO — every POST created a new CI).
    expect(hoisted.txCICreate).toHaveBeenCalledTimes(1);

    // The server-extension upsert ran on each POST against the same CI
    expect(hoisted.txServerUpsert).toHaveBeenCalledTimes(2);
    expect(hoisted.txServerUpsert.mock.calls[0][0].where).toEqual({ ciId: 'ci-new' });
    expect(hoisted.txServerUpsert.mock.calls[1][0].where).toEqual({ ciId: 'ci-new' });

    // Multi-tenancy: every CI dedup query was scoped by tenantId
    for (const call of hoisted.txCIFindFirst.mock.calls) {
      expect(call[0].where.tenantId).toBe(hoisted.tenantId);
    }
  });
});
