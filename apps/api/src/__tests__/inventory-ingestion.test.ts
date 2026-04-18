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
      cmdbConfigurationItem: { findFirst: hoisted.txCIFindFirst, create: hoisted.txCICreate },
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
  it('POST /agents/inventory writes to CmdbCiServer not Asset (assetId always null in Wave 5)', async () => {
    // Phase 8 Wave 5: Asset.hostname is dropped so the Wave 3 Asset.findFirst
    // correlation is removed. assetId is ALWAYS passed as null into
    // upsertServerExtensionByAsset, which lets its D-08 branch resolve. If a
    // CmdbConfigurationItem already exists for the given hostname, the service
    // reuses it; otherwise it walks the orphan-create path.
    //
    // For this test: simulate the reuse branch — an existing CI's lookup
    // returns a match, so the server-extension upsert runs against that CI.
    hoisted.txCIFindFirst.mockResolvedValue({ id: 'ci-1' });

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

    // The server-extension upsert MUST be called once
    expect(hoisted.txServerUpsert).toHaveBeenCalledTimes(1);
    const upsertCall = hoisted.txServerUpsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({ ciId: 'ci-1' });
    // Phase 8 NEW fields land on the create branch (which is what upsert uses
    // when no existing row matches; the cmdb-extension service writes both
    // create and update branches with the same hardware payload).
    expect(upsertCall.create.cpuModel).toBe('Xeon');
    expect(upsertCall.create.cpuCount).toBe(4);

    // Asset MUST NOT be mutated by this path. The mockPrisma.asset surface
    // exposes ONLY findFirst (no update / upsert) — Prisma would throw if
    // anything tried to call .update on it.
    expect(hoisted.mockPrisma.asset).not.toHaveProperty('update');
    expect(hoisted.mockPrisma.asset).not.toHaveProperty('upsert');
    expect(hoisted.mockPrisma.asset).not.toHaveProperty('create');

    // Phase 8 Wave 5: prisma.asset.findFirst is NO LONGER called by the route
    // (Asset.hostname column no longer exists). The orphan-friendly null
    // assetId is passed directly into upsertServerExtensionByAsset.
    expect(hoisted.prismaAssetFindFirst).not.toHaveBeenCalled();
  });

  it('POST /agents/inventory auto-creates CI for orphan (no matching CI)', async () => {
    // Phase 8 Wave 5: with assetId=null always, a missing CI triggers the D-08
    // orphan-create path. The new CI carries agent.tenantId and assetId=null.
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

    // Phase 8 Wave 5: no Asset lookup at all
    expect(hoisted.prismaAssetFindFirst).not.toHaveBeenCalled();
  });
});
