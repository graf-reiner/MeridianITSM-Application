import { describe, it } from 'vitest';

/**
 * Phase 8 — CASR-06 / D-07 / D-08 scaffold.
 *
 * Vitest discovery target for the `upsertServerExtensionByAsset` service
 * that lands in Wave 1 (plan 08-02). Bodies are `it.todo(...)` in Wave 0 so
 * vitest reports them as PENDING (not green-lie, not red-blocker). Wave 1
 * replaces each `it.todo` with a real `it(...)` block using the mock scaffold
 * commented out below (copied from PATTERNS.md section 20 verbatim so the
 * Wave 1 agent doesn't have to re-derive it).
 *
 * Every it.todo title matches the VALIDATION.md `-t "..."` filter strings so
 * `pnpm --filter @meridian/api vitest run -t "..."` discovers the correct
 * pending test without string drift.
 */
describe('upsertServerExtensionByAsset (Phase 8 / CASR-06 / D-07 / D-08)', () => {
  it.todo('upsertServerExtensionByAsset writes only to CmdbCiServer (never touches Asset)');
  it.todo('upsertServerExtensionByAsset auto-creates CI for orphan');
  it.todo('upsertServerExtensionByAsset upserts CmdbSoftwareInstalled');
  it.todo('upsertServerExtensionByAsset rejects cross-tenant Asset');
  it.todo('upsertServerExtensionByAsset throws on missing reference data');
});

// ---------------------------------------------------------------------------
// Wave 1 mock scaffold (PATTERNS.md section 20 — UNCOMMENT when implementing)
// ---------------------------------------------------------------------------
//
// import { describe, it, expect, vi, beforeEach } from 'vitest';
//
// const { mockPrismaObj, mockTx } = vi.hoisted(() => ({
//   mockPrismaObj: {} as Record<string, unknown>,
//   mockTx: {} as Record<string, unknown>,
// }));
//
// const txAssetFindFirst = vi.fn();
// const txCIFindFirst = vi.fn();
// const txCICreate = vi.fn();
// const txCIUpdate = vi.fn();
// const txServerUpsert = vi.fn();
// const txSoftwareUpsert = vi.fn();
// const txExecuteRaw = vi.fn();
// const txQueryRaw = vi.fn();
// const prismaTransaction = vi.fn();
//
// Object.assign(mockTx, {
//   asset: { findFirst: txAssetFindFirst },
//   cmdbConfigurationItem: { findFirst: txCIFindFirst, create: txCICreate, update: txCIUpdate },
//   cmdbCiServer: { upsert: txServerUpsert },
//   cmdbSoftwareInstalled: { upsert: txSoftwareUpsert },
//   $executeRaw: txExecuteRaw,
//   $queryRaw: txQueryRaw,
// });
//
// Object.assign(mockPrismaObj, { $transaction: prismaTransaction });
//
// vi.mock('@meridian/db', () => ({ prisma: mockPrismaObj }));
// vi.mock('../services/cmdb-reference-resolver.service', () => ({
//   resolveClassId: vi.fn().mockResolvedValue('class-uuid-server'),
//   resolveLifecycleStatusId: vi.fn().mockResolvedValue('status-uuid-in-service'),
//   resolveOperationalStatusId: vi.fn().mockResolvedValue('status-uuid-online'),
//   resolveEnvironmentId: vi.fn().mockResolvedValue('env-uuid-prod'),
// }));
//
// beforeEach(() => {
//   vi.clearAllMocks();
//   prismaTransaction.mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx));
// });
//
// // Sample test skeleton (PATTERNS.md section 20 verbatim):
// //
// // it('upsertServerExtensionByAsset writes only to CmdbCiServer (never touches Asset)', async () => {
// //   txAssetFindFirst.mockResolvedValue({ id: 'asset-1', tenantId: TENANT_ID });
// //   txCIFindFirst.mockResolvedValue({ id: 'ci-1', tenantId: TENANT_ID });
// //   txServerUpsert.mockResolvedValue({ ciId: 'ci-1' });
// //   txSoftwareUpsert.mockResolvedValue({});
// //   await prismaTransaction((tx: typeof mockTx) =>
// //     upsertServerExtensionByAsset(tx as never, TENANT_ID, 'asset-1', SAMPLE_SNAPSHOT),
// //   );
// //   expect(txServerUpsert).toHaveBeenCalledTimes(1);
// //   expect(mockTx.asset).not.toHaveProperty('update');  // Asset MUST NOT have been written
// // });
