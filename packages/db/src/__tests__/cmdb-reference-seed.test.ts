import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedCmdbReferenceData } from '../seeds/cmdb-reference.js';

// ---------------------------------------------------------------------------
// Mock Prisma.TransactionClient
// ---------------------------------------------------------------------------

describe('seedCmdbReferenceData', () => {
  const TENANT_ID = 'tenant-seed-test-xyz';

  const ciClassUpsert = vi.fn();
  const ciClassUpdate = vi.fn();
  const statusUpsert = vi.fn();
  const envUpsert = vi.fn();
  const relTypeUpsert = vi.fn();

  const mockTx = {
    cmdbCiClass: { upsert: ciClassUpsert, update: ciClassUpdate },
    cmdbStatus: { upsert: statusUpsert },
    cmdbEnvironment: { upsert: envUpsert },
    cmdbRelationshipTypeRef: { upsert: relTypeUpsert },
  } as unknown as Parameters<typeof seedCmdbReferenceData>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    // Upsert returns an object with id matching the classKey for parent-wiring step
    ciClassUpsert.mockImplementation((args: { create: { classKey: string } }) =>
      Promise.resolve({ id: `cls-${args.create.classKey}`, classKey: args.create.classKey }),
    );
    statusUpsert.mockResolvedValue({ id: 'status-id' });
    envUpsert.mockResolvedValue({ id: 'env-id' });
    relTypeUpsert.mockResolvedValue({ id: 'rel-id' });
    ciClassUpdate.mockResolvedValue({});
  });

  it('seeds 15 CI classes for the given tenant', async () => {
    await seedCmdbReferenceData(mockTx, TENANT_ID);

    expect(ciClassUpsert).toHaveBeenCalledTimes(15);
    // Every upsert is scoped to the passed tenantId (multi-tenancy invariant)
    const tenantIds = ciClassUpsert.mock.calls.map(
      (c) => (c[0] as { create: { tenantId: string } }).create.tenantId,
    );
    expect(tenantIds.every((id) => id === TENANT_ID)).toBe(true);
  });

  it('seeds 11 statuses (6 lifecycle + 5 operational)', async () => {
    await seedCmdbReferenceData(mockTx, TENANT_ID);

    expect(statusUpsert).toHaveBeenCalledTimes(11);
    const statusTypes = statusUpsert.mock.calls.map(
      (c) => (c[0] as { create: { statusType: string } }).create.statusType,
    );
    const lifecycle = statusTypes.filter((t) => t === 'lifecycle');
    const operational = statusTypes.filter((t) => t === 'operational');
    expect(lifecycle.length).toBe(6);
    expect(operational.length).toBe(5);
  });

  it('seeds 6 environments', async () => {
    await seedCmdbReferenceData(mockTx, TENANT_ID);
    expect(envUpsert).toHaveBeenCalledTimes(6);
    const tenantIds = envUpsert.mock.calls.map(
      (c) => (c[0] as { create: { tenantId: string } }).create.tenantId,
    );
    expect(tenantIds.every((id) => id === TENANT_ID)).toBe(true);
  });

  it('seeds 13 relationship types', async () => {
    await seedCmdbReferenceData(mockTx, TENANT_ID);
    expect(relTypeUpsert).toHaveBeenCalledTimes(13);
    const tenantIds = relTypeUpsert.mock.calls.map(
      (c) => (c[0] as { create: { tenantId: string } }).create.tenantId,
    );
    expect(tenantIds.every((id) => id === TENANT_ID)).toBe(true);
  });

  it('uses update: {} (idempotent) in every upsert call', async () => {
    await seedCmdbReferenceData(mockTx, TENANT_ID);
    const allUpsertCalls = [
      ...ciClassUpsert.mock.calls,
      ...statusUpsert.mock.calls,
      ...envUpsert.mock.calls,
      ...relTypeUpsert.mock.calls,
    ];
    for (const call of allUpsertCalls) {
      const args = call[0] as { update: unknown };
      expect(args.update).toEqual({});
    }
  });

  it('wires parent-class relationships (virtual_machine→server, etc.)', async () => {
    await seedCmdbReferenceData(mockTx, TENANT_ID);

    // Expect 4 parent-class wiring updates
    expect(ciClassUpdate).toHaveBeenCalledTimes(4);
    const updateTargets = ciClassUpdate.mock.calls.map(
      (c) => (c[0] as { where: { id: string }; data: { parentClassId: string } }),
    );

    const childToParent = new Map(
      updateTargets.map((u) => [u.where.id, u.data.parentClassId]),
    );
    expect(childToParent.get('cls-virtual_machine')).toBe('cls-server');
    expect(childToParent.get('cls-load_balancer')).toBe('cls-network_device');
    expect(childToParent.get('cls-application_instance')).toBe('cls-application');
    expect(childToParent.get('cls-saas_application')).toBe('cls-application');
  });
});
