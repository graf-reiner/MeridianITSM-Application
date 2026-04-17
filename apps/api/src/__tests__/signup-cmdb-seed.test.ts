import { describe, it, vi, beforeEach } from 'vitest';

/**
 * Phase 7 — Signup endpoint CMDB reference-data seeding (CREF-01..04 tenant lifecycle).
 *
 * Wave 0 scaffold: vi.hoisted + Object.assign(mockTx, ...) + vi.mock('@meridian/db', ...)
 * structure mirrors apps/api/src/__tests__/cmdb-service.test.ts:1-120. Bodies are
 * marked `it.todo` because seedCmdbReferenceData is not wired into signup.ts until
 * Plan 02. Multi-tenancy assertion included as a TODO so Plan 02 cannot skip it.
 */

const { mockPrismaObj, mockTx } = vi.hoisted(() => ({
  mockPrismaObj: {} as Record<string, unknown>,
  mockTx: {} as Record<string, unknown>,
}));

const txTenantCreate = vi.fn();
const txCmdbCiClassUpsert = vi.fn();
const txCmdbCiClassUpdate = vi.fn();
const txCmdbStatusUpsert = vi.fn();
const txCmdbEnvUpsert = vi.fn();
const txCmdbRelTypeRefUpsert = vi.fn();
const txRoleUpsert = vi.fn();
const txSlaUpsert = vi.fn();
const txCategoryUpsert = vi.fn();
const txUserCreate = vi.fn();
const prismaTransaction = vi.fn();

Object.assign(mockTx, {
  tenant: { create: txTenantCreate },
  cmdbCiClass: { upsert: txCmdbCiClassUpsert, update: txCmdbCiClassUpdate },
  cmdbStatus: { upsert: txCmdbStatusUpsert },
  cmdbEnvironment: { upsert: txCmdbEnvUpsert },
  cmdbRelationshipTypeRef: { upsert: txCmdbRelTypeRefUpsert },
  role: { upsert: txRoleUpsert },
  sla: { upsert: txSlaUpsert },
  category: { upsert: txCategoryUpsert },
  user: { create: txUserCreate },
});

Object.assign(mockPrismaObj, {
  $transaction: prismaTransaction,
});

vi.mock('@meridian/db', () => ({ prisma: mockPrismaObj }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaTransaction.mockImplementation(
    (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
  );
});

describe('signup endpoint — CMDB reference seeding (Phase 7 CREF-01..04 tenant lifecycle)', () => {
  // Tests stubbed until Plan 02 wires seedCmdbReferenceData into signup.ts.
  // Do NOT replace with `it(..., () => expect(true).toBe(true))` — see
  // STATE.md Tracked Follow-up about api-key.test.ts green-lie placeholders.
  it.todo('signup seeds cmdb reference data — 15 CI classes for the new tenant');
  it.todo('signup seeds 11 statuses (6 lifecycle + 5 operational) for the new tenant');
  it.todo('signup seeds 6 environments for the new tenant');
  it.todo('signup seeds 13 relationship types for the new tenant');
  it.todo('every seed upsert call passes the new tenant.id (multi-tenancy assertion)');
});
