// ============================================================================
// Shared Fastify test app builder for route-level integration tests.
// LOCKED in Phase 8 Wave 3 (plan 08-04) — all route-level tests in this and
// later waves use this helper for consistency. Do NOT bypass with smaller-
// surface alternatives.
//
// Multi-tenancy posture (CLAUDE.md Rule 1): the helper hard-codes a single
// test tenantId on the mockAgent so every test execution stays inside one
// tenant boundary. Cross-tenant tests should construct a SECOND helper
// instance with a different tenantId and assert isolation explicitly.
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { vi } from 'vitest';

export interface TestAppHandles {
  app: FastifyInstance;
  mockPrisma: Record<string, any>;
  // Hoisted mock fns the test can configure / assert against
  txAssetFindFirst: ReturnType<typeof vi.fn>;
  txCIFindFirst: ReturnType<typeof vi.fn>;
  txCICreate: ReturnType<typeof vi.fn>;
  txServerUpsert: ReturnType<typeof vi.fn>;
  txSoftwareUpsert: ReturnType<typeof vi.fn>;
  mockAgent: { id: string; tenantId: string; hostname: string; agentKey: string };
}

export interface BuildTestAppOptions {
  tenantId?: string;
  registerRoutes?: (app: FastifyInstance) => Promise<void>;
}

export async function buildTestApp(opts: BuildTestAppOptions = {}): Promise<TestAppHandles> {
  const tenantId = opts.tenantId ?? '00000000-0000-0000-0000-000000000001';

  const txAssetFindFirst = vi.fn();
  const txCIFindFirst = vi.fn();
  const txCICreate = vi.fn();
  const txServerUpsert = vi.fn();
  const txSoftwareUpsert = vi.fn();
  const txExecuteRaw = vi.fn();
  const txQueryRaw = vi.fn().mockResolvedValue([{ next: BigInt(1) }]);

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

  const mockPrisma: Record<string, any> = {
    asset: { findFirst: txAssetFindFirst },
    agent: {
      findFirst: vi.fn().mockResolvedValue(mockAgent),
      update: vi.fn().mockResolvedValue(mockAgent),
    },
    inventorySnapshot: {
      create: vi.fn().mockResolvedValue({ id: 'snap-1', tenantId, agentId: mockAgent.id }),
    },
    metricSample: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    agentUpdate: { findFirst: vi.fn().mockResolvedValue(null) },
    tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn().mockImplementation(async (cb: any) =>
      cb({
        asset: { findFirst: txAssetFindFirst },
        cmdbConfigurationItem: { findFirst: txCIFindFirst, create: txCICreate },
        cmdbCiServer: { upsert: txServerUpsert },
        cmdbSoftwareInstalled: { upsert: txSoftwareUpsert },
        cmdbCiClass: { findFirst: vi.fn().mockResolvedValue({ id: 'class-server-id' }) },
        cmdbStatus: {
          findFirst: vi.fn().mockResolvedValue({ id: 'status-id' }),
        },
        cmdbEnvironment: { findFirst: vi.fn().mockResolvedValue({ id: 'env-prod-id' }) },
        $executeRaw: txExecuteRaw,
        $queryRaw: txQueryRaw,
      }),
    ),
    cmdbCiClass: { findFirst: vi.fn().mockResolvedValue({ id: 'class-server-id' }) },
    cmdbStatus: { findFirst: vi.fn().mockResolvedValue({ id: 'status-id' }) },
    cmdbEnvironment: { findFirst: vi.fn().mockResolvedValue({ id: 'env-prod-id' }) },
  };

  // The CALLER must `vi.mock('@meridian/db', () => ({ prisma: mockPrisma }))`
  // BEFORE invoking buildTestApp() — vi.mock binds at module-import time.
  // This helper just bundles the configured mocks for assertion convenience.
  const app = Fastify({ logger: false });

  if (opts.registerRoutes) {
    await opts.registerRoutes(app);
  }

  return {
    app,
    mockPrisma,
    txAssetFindFirst,
    txCIFindFirst,
    txCICreate,
    txServerUpsert,
    txSoftwareUpsert,
    mockAgent,
  };
}
