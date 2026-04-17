import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedCmdbReferenceData } from '@meridian/db/seeds/cmdb-reference';

// ---------------------------------------------------------------------------
// Phase 7 (CREF-01..04 + tenant-lifecycle): verifies that the tenant-creation
// seeder, which is wired into both signup.ts (apps/api/src/routes/auth/signup.ts)
// and owner provisioning.ts (apps/owner/src/lib/provisioning.ts), produces the
// correct per-tenant reference vocabulary and carries the new tenant.id through
// every upsert. The plan allows this simpler direct-seeder-call approach
// instead of invoking the Fastify signup handler: "an acceptable simpler path
// is to call seedCmdbReferenceData(mockTx, NEW_TENANT_ID) directly and assert
// the upsert counts — which still proves the seeder works AND the wiring
// exists (the wiring assertion is then covered by a grep in Acceptance
// Criteria)".
//
// The grep-based wiring assertion is covered by the Acceptance Criteria in
// the Plan 07-02 spec ("signup.ts calls the seeder with tx and tenant.id
// inside a transaction: grep -q 'seedCmdbReferenceData(tx, tenant\.id)'").
// ---------------------------------------------------------------------------

const NEW_TENANT_ID = 'tenant-id-aaa-bbb-ccc';

describe('signup → seedCmdbReferenceData wiring', () => {
  const txCmdbCiClassUpsert = vi.fn();
  const txCmdbCiClassUpdate = vi.fn();
  const txCmdbStatusUpsert = vi.fn();
  const txCmdbEnvUpsert = vi.fn();
  const txCmdbRelTypeRefUpsert = vi.fn();

  const mockTx = {
    cmdbCiClass: { upsert: txCmdbCiClassUpsert, update: txCmdbCiClassUpdate },
    cmdbStatus: { upsert: txCmdbStatusUpsert },
    cmdbEnvironment: { upsert: txCmdbEnvUpsert },
    cmdbRelationshipTypeRef: { upsert: txCmdbRelTypeRefUpsert },
  } as unknown as Parameters<typeof seedCmdbReferenceData>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    txCmdbCiClassUpsert.mockImplementation(
      (args: { create: { classKey: string } }) =>
        Promise.resolve({ id: `class-id-${args.create.classKey}`, classKey: args.create.classKey }),
    );
    txCmdbCiClassUpdate.mockResolvedValue({});
    txCmdbStatusUpsert.mockResolvedValue({ id: 'status-id' });
    txCmdbEnvUpsert.mockResolvedValue({ id: 'env-id' });
    txCmdbRelTypeRefUpsert.mockResolvedValue({ id: 'rel-id' });
  });

  it('signup seeds cmdb reference data — 15 CI classes for the new tenant', async () => {
    await seedCmdbReferenceData(mockTx, NEW_TENANT_ID);

    // 15 CI classes upserted
    expect(txCmdbCiClassUpsert).toHaveBeenCalledTimes(15);

    // Every upsert carries NEW_TENANT_ID — multi-tenancy invariant
    const tenantIds = txCmdbCiClassUpsert.mock.calls.map(
      (c) => (c[0] as { create: { tenantId: string } }).create.tenantId,
    );
    expect(tenantIds.every((id) => id === NEW_TENANT_ID)).toBe(true);
  });

  it('signup seeds 11 statuses (6 lifecycle + 5 operational) all scoped to the new tenant', async () => {
    await seedCmdbReferenceData(mockTx, NEW_TENANT_ID);

    expect(txCmdbStatusUpsert).toHaveBeenCalledTimes(11);
    const calls = txCmdbStatusUpsert.mock.calls.map(
      (c) => c[0] as { create: { tenantId: string; statusType: string } },
    );
    expect(calls.every((c) => c.create.tenantId === NEW_TENANT_ID)).toBe(true);
    expect(calls.filter((c) => c.create.statusType === 'lifecycle').length).toBe(6);
    expect(calls.filter((c) => c.create.statusType === 'operational').length).toBe(5);
  });

  it('signup seeds 6 environments all scoped to the new tenant', async () => {
    await seedCmdbReferenceData(mockTx, NEW_TENANT_ID);

    expect(txCmdbEnvUpsert).toHaveBeenCalledTimes(6);
    const tenantIds = txCmdbEnvUpsert.mock.calls.map(
      (c) => (c[0] as { create: { tenantId: string } }).create.tenantId,
    );
    expect(tenantIds.every((id) => id === NEW_TENANT_ID)).toBe(true);
  });

  it('signup seeds 13 relationship types all scoped to the new tenant', async () => {
    await seedCmdbReferenceData(mockTx, NEW_TENANT_ID);

    expect(txCmdbRelTypeRefUpsert).toHaveBeenCalledTimes(13);
    const tenantIds = txCmdbRelTypeRefUpsert.mock.calls.map(
      (c) => (c[0] as { create: { tenantId: string } }).create.tenantId,
    );
    expect(tenantIds.every((id) => id === NEW_TENANT_ID)).toBe(true);
  });

  it('every upsert is idempotent (update: {} preserves tenant customizations)', async () => {
    await seedCmdbReferenceData(mockTx, NEW_TENANT_ID);

    const allUpsertCalls = [
      ...txCmdbCiClassUpsert.mock.calls,
      ...txCmdbStatusUpsert.mock.calls,
      ...txCmdbEnvUpsert.mock.calls,
      ...txCmdbRelTypeRefUpsert.mock.calls,
    ];
    for (const call of allUpsertCalls) {
      const args = call[0] as { update: unknown };
      expect(args.update).toEqual({});
    }
  });
});
