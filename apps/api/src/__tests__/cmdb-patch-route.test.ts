/**
 * Phase 8 (CASR-05 dependency for Wave 5 plan 06 Asset detail "Link a CI" flow).
 *
 * PATCH /api/v1/cmdb/cis/:id route tests — dual-tenant-ownership guard.
 *
 * Threats verified:
 *   - T-8-05-09 Spoofing (cross-tenant): CI + Asset ownership checks block
 *     cross-tenant Asset link attempts (Test 2, Test 3).
 *   - T-8-05-10 Tampering: Zod .strict() rejects unknown body keys (covered
 *     by the schema in the route source).
 *
 * Multi-tenancy posture (CLAUDE.md Rule 1):
 *   - Every test asserts prisma.cmdbConfigurationItem.findFirst was called
 *     with where.tenantId === user.tenantId.
 *   - Cross-tenant tests assert the second findFirst (Asset) ALSO used the
 *     caller's tenantId, so a cross-tenant assetId returns null → 404.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock surfaces (MUST be inside vi.hoisted because vi.mock factory
// evaluates BEFORE module-level const bindings).
// ---------------------------------------------------------------------------
const hoisted = vi.hoisted(() => {
  const ciFindFirst = vi.fn();
  const assetFindFirst = vi.fn();
  const ciUpdate = vi.fn();
  const mockPrisma = {
    cmdbConfigurationItem: {
      findFirst: ciFindFirst,
      update: ciUpdate,
    },
    asset: {
      findFirst: assetFindFirst,
    },
  };
  return { ciFindFirst, assetFindFirst, ciUpdate, mockPrisma };
});

vi.mock('@meridian/db', () => ({ prisma: hoisted.mockPrisma }));

// Mock the rbac plugin so we can control permission gating per-test.
const hoistedRbac = vi.hoisted(() => {
  const passThrough = vi.fn(
    () => async (_req: unknown, _reply: unknown) => undefined,
  );
  return { passThrough };
});

vi.mock('../plugins/rbac.js', () => ({
  requirePermission: hoistedRbac.passThrough,
}));

// Mock cmdb.service.js because the cmdbRoutes import pulls it in and we don't
// need it for these PATCH tests. Return no-op vi.fn for each exported symbol.
vi.mock('../services/cmdb.service.js', () => ({
  createCI: vi.fn(),
  getCI: vi.fn(),
  listCIs: vi.fn(),
  updateCI: vi.fn(),
  deleteCI: vi.fn(),
  createRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
  getCIRelationships: vi.fn(),
  getImpactAnalysis: vi.fn(),
  listCIChangeHistory: vi.fn(),
  createCategory: vi.fn(),
  listCategories: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  getAffectedApplications: vi.fn(),
}));

vi.mock('../services/cmdb-import.service.js', () => ({
  importCIs: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import the route AFTER mocks are in place.
// ---------------------------------------------------------------------------
import Fastify, { type FastifyInstance } from 'fastify';
import { cmdbRoutes } from '../routes/v1/cmdb/index';

// UUID format: 8-4-4-4-12 hex chars.
const TENANT_A = '00000000-0000-4000-8000-00000000000a';
const TENANT_B = '00000000-0000-4000-8000-00000000000b';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CI_ID_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ASSET_ID_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ASSET_ID_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

async function buildApp(tenantId = TENANT_A, userId = USER_A): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Inject a fake user context before any PATCH call so req.user resolves.
  app.addHook('preHandler', async (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).user = { tenantId, userId };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).currentUser = { tenantId, userId, roles: ['admin'] };
  });

  await app.register(cmdbRoutes);
  return app;
}

describe('PATCH /api/v1/cmdb/cis/:id (Phase 8 / CASR-05 dependency)', () => {
  beforeEach(() => {
    hoisted.ciFindFirst.mockReset();
    hoisted.assetFindFirst.mockReset();
    hoisted.ciUpdate.mockReset();
  });

  it('PATCH /cmdb/cis/:id with { assetId } updates link when both tenants match', async () => {
    hoisted.ciFindFirst.mockResolvedValue({ id: CI_ID_A });
    hoisted.assetFindFirst.mockResolvedValue({ id: ASSET_ID_A });
    hoisted.ciUpdate.mockResolvedValue({ id: CI_ID_A, assetId: ASSET_ID_A });

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/cmdb/cis/${CI_ID_A}`,
        payload: { assetId: ASSET_ID_A },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: { id: CI_ID_A, assetId: ASSET_ID_A },
      });

      // Multi-tenancy belt: CI findFirst called with caller's tenantId
      expect(hoisted.ciFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: CI_ID_A, tenantId: TENANT_A }),
        }),
      );
      // Asset findFirst also scoped to caller's tenantId (NOT the body's — body cannot carry a tenantId)
      expect(hoisted.assetFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: ASSET_ID_A, tenantId: TENANT_A }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('PATCH /cmdb/cis/:id rejects cross-tenant Asset link', async () => {
    // CI is in tenant A (user's own tenant), but the supplied assetId is a
    // tenant B asset — findFirst returns null because of tenantId scoping.
    hoisted.ciFindFirst.mockResolvedValue({ id: CI_ID_A });
    hoisted.assetFindFirst.mockResolvedValue(null);

    const app = await buildApp(TENANT_A);
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/cmdb/cis/${CI_ID_A}`,
        payload: { assetId: ASSET_ID_B },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toMatch(/Asset not found in this tenant/i);
      // ciUpdate MUST NOT be called
      expect(hoisted.ciUpdate).not.toHaveBeenCalled();
      // Asset findFirst used caller's tenantId (proving we did NOT trust any
      // body-level tenant hint).
      const assetCall = hoisted.assetFindFirst.mock.calls[0]![0];
      expect(assetCall.where.tenantId).toBe(TENANT_A);
    } finally {
      await app.close();
    }
  });

  it('PATCH /cmdb/cis/:id rejects when CI does not belong to tenant', async () => {
    hoisted.ciFindFirst.mockResolvedValue(null);

    const app = await buildApp(TENANT_A);
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/cmdb/cis/${CI_ID_A}`,
        payload: { assetId: ASSET_ID_A },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toMatch(/CI not found/i);
      // Asset findFirst MUST NOT even be called — short-circuit on CI miss
      expect(hoisted.assetFindFirst).not.toHaveBeenCalled();
      expect(hoisted.ciUpdate).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('PATCH /cmdb/cis/:id with { assetId: null } unlinks the CI', async () => {
    hoisted.ciFindFirst.mockResolvedValue({ id: CI_ID_A });
    hoisted.ciUpdate.mockResolvedValue({ id: CI_ID_A, assetId: null });

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/cmdb/cis/${CI_ID_A}`,
        payload: { assetId: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: { id: CI_ID_A, assetId: null },
      });
      // Asset findFirst is NOT called on the null-unlink path
      expect(hoisted.assetFindFirst).not.toHaveBeenCalled();
      // Update called with assetId: null
      const updateCall = hoisted.ciUpdate.mock.calls[0]![0];
      expect(updateCall.data.assetId).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('PATCH /cmdb/cis/:id Zod .strict() rejects unknown body keys (T-8-05-10)', async () => {
    hoisted.ciFindFirst.mockResolvedValue({ id: CI_ID_A });

    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/cmdb/cis/${CI_ID_A}`,
        // Attempt to inject a cross-tenant tenantId — .strict() must reject.
        payload: { assetId: ASSET_ID_A, tenantId: TENANT_B },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/Invalid body/i);
      expect(hoisted.ciUpdate).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
