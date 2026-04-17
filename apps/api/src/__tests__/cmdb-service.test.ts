import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock functions (available inside vi.mock factories)
// ---------------------------------------------------------------------------

const { mockPrismaObj, mockTx } = vi.hoisted(() => {
  return { mockPrismaObj: {} as Record<string, unknown>, mockTx: {} as Record<string, unknown> };
});

// ---------------------------------------------------------------------------
// Create mock fns at module level
// ---------------------------------------------------------------------------

// Transaction-level mocks
const txCICreate = vi.fn();
const txCIFindFirst = vi.fn();
const txCIFindMany = vi.fn();
const txCIUpdate = vi.fn();
const txCICount = vi.fn();
const txRelCreate = vi.fn();
const txRelFindMany = vi.fn();
const txRelDeleteMany = vi.fn();
const txChangeRecordCreate = vi.fn();
const txChangeRecordCreateMany = vi.fn();
const txExecuteRaw = vi.fn();
const txQueryRaw = vi.fn();
const txCmdbCiServerCreate = vi.fn();
const txCmdbCiApplicationCreate = vi.fn();
const txCmdbCiDatabaseCreate = vi.fn();
const txCmdbCiNetworkDeviceCreate = vi.fn();
const txCmdbCiCloudResourceCreate = vi.fn();
const txCmdbCiEndpointCreate = vi.fn();
const txCmdbServiceCreate = vi.fn();

// Top-level prisma mocks
const prismaCIFindFirst = vi.fn();
const prismaCIFindMany = vi.fn();
const prismaCICount = vi.fn();
const prismaRelCreate = vi.fn();
const prismaRelFindMany = vi.fn();
const prismaRelDeleteMany = vi.fn();
const prismaChangeRecordFindMany = vi.fn();
const prismaChangeRecordCount = vi.fn();
const prismaCategoryCreate = vi.fn();
const prismaCategoryFindFirst = vi.fn();
const prismaCategoryFindMany = vi.fn();
const prismaCategoryUpdate = vi.fn();
const prismaCategoryDelete = vi.fn();
const prismaTransaction = vi.fn();
const prismaQueryRaw = vi.fn();

// Assemble mock tx
Object.assign(mockTx, {
  cmdbConfigurationItem: { create: txCICreate, findFirst: txCIFindFirst, findMany: txCIFindMany, update: txCIUpdate, count: txCICount },
  cmdbRelationship: { create: txRelCreate, findMany: txRelFindMany, deleteMany: txRelDeleteMany },
  cmdbChangeRecord: { create: txChangeRecordCreate, createMany: txChangeRecordCreateMany },
  cmdbCiServer: { create: txCmdbCiServerCreate },
  cmdbCiApplication: { create: txCmdbCiApplicationCreate },
  cmdbCiDatabase: { create: txCmdbCiDatabaseCreate },
  cmdbCiNetworkDevice: { create: txCmdbCiNetworkDeviceCreate },
  cmdbCiCloudResource: { create: txCmdbCiCloudResourceCreate },
  cmdbCiEndpoint: { create: txCmdbCiEndpointCreate },
  cmdbService: { create: txCmdbServiceCreate },
  $executeRaw: txExecuteRaw,
  $queryRaw: txQueryRaw,
});

// Assemble mock prisma
Object.assign(mockPrismaObj, {
  cmdbConfigurationItem: { findFirst: prismaCIFindFirst, findMany: prismaCIFindMany, count: prismaCICount },
  cmdbRelationship: { create: prismaRelCreate, findMany: prismaRelFindMany, deleteMany: prismaRelDeleteMany },
  cmdbChangeRecord: { findMany: prismaChangeRecordFindMany, count: prismaChangeRecordCount },
  cmdbCategory: { create: prismaCategoryCreate, findFirst: prismaCategoryFindFirst, findMany: prismaCategoryFindMany, update: prismaCategoryUpdate, delete: prismaCategoryDelete },
  $transaction: prismaTransaction,
  $queryRaw: prismaQueryRaw,
});

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock('@meridian/db', () => ({ prisma: mockPrismaObj }));

// Phase 7: mock the shared resolver so deleteCI/createRelationship unit tests
// do not need a live DB. Each resolver returns a deterministic id.
vi.mock('../services/cmdb-reference-resolver.service', () => ({
  resolveClassId: vi.fn().mockResolvedValue('class-uuid'),
  resolveLifecycleStatusId: vi.fn().mockResolvedValue('lc-retired-uuid'),
  resolveOperationalStatusId: vi.fn().mockResolvedValue('op-uuid'),
  resolveEnvironmentId: vi.fn().mockResolvedValue('env-uuid'),
  resolveRelationshipTypeId: vi.fn().mockResolvedValue('rel-uuid'),
  clearResolverCaches: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import service under test (after mocks are in place)
// ---------------------------------------------------------------------------

import {
  createCI,
  deleteCI,
  createRelationship,
  getImpactAnalysis,
  updateCI,
  createCategory,
} from '../services/cmdb.service';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-aaa-bbb-ccc';
const USER_ID = 'user-111-222-333';
const CI_ID_1 = 'ci-001';
const CI_ID_2 = 'ci-002';
const CI_ID_3 = 'ci-003';
const CATEGORY_ID = 'cat-001';
const PARENT_CATEGORY_ID = 'cat-parent';

// ---------------------------------------------------------------------------
// Reset all mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: $transaction passes through to the callback with mockTx
  prismaTransaction.mockImplementation(
    (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CmdbService', () => {
  it('creates CI with sequential ciNumber', async () => {
    // The service calls $executeRaw for advisory lock, then $queryRaw for next ciNumber
    txExecuteRaw.mockResolvedValue(undefined);
    txQueryRaw.mockResolvedValue([{ next: BigInt(42) }]);

    const createdCI = {
      id: CI_ID_1,
      tenantId: TENANT_ID,
      ciNumber: 42,
      name: 'Web Server 01',
      classId: 'class-uuid-server',
    };
    txCICreate.mockResolvedValue(createdCI);
    txChangeRecordCreate.mockResolvedValue({ id: 'cr-1' });

    // Phase 7: classId is now required; legacy `type` no longer accepted by service
    const result = await createCI(
      TENANT_ID,
      { name: 'Web Server 01', classId: 'class-uuid-server' },
      USER_ID,
    );

    expect(result).toEqual(createdCI);
    // Advisory lock was acquired
    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
    // Next ciNumber was queried
    expect(txQueryRaw).toHaveBeenCalledTimes(1);
    // CI created with correct ciNumber + classId (no legacy enum fields)
    expect(txCICreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          ciNumber: 42,
          name: 'Web Server 01',
          classId: 'class-uuid-server',
        }),
      }),
    );
    // Change record logged as CREATED
    expect(txChangeRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          ciId: CI_ID_1,
          changeType: 'CREATED',
          changedBy: 'USER',
          userId: USER_ID,
        }),
      }),
    );
  });

  // Phase 7: the legacy enum `type` field is no longer part of the service
  // contract. This test has been replaced by the `createCI does not write
  // legacy type field` case at the bottom of the describe block.

  it('creates relationship between two CIs', async () => {
    const sourceCi = { id: CI_ID_1, tenantId: TENANT_ID, name: 'App Server', isDeleted: false };
    const targetCi = { id: CI_ID_2, tenantId: TENANT_ID, name: 'DB Server', isDeleted: false };

    prismaCIFindFirst
      .mockResolvedValueOnce(sourceCi)   // source lookup
      .mockResolvedValueOnce(targetCi);  // target lookup

    const createdRel = {
      id: 'rel-001',
      tenantId: TENANT_ID,
      sourceId: CI_ID_1,
      targetId: CI_ID_2,
      relationshipTypeId: 'rel-uuid',
    };
    prismaRelCreate.mockResolvedValue(createdRel);

    // Phase 7: service now resolves legacy `relationshipType` string → FK id
    // via resolveRelationshipTypeId (mocked above to return 'rel-uuid').
    const result = await createRelationship(TENANT_ID, {
      sourceId: CI_ID_1,
      targetId: CI_ID_2,
      relationshipType: 'DEPENDS_ON',
    });

    expect(result).toEqual(createdRel);
    // Both CIs were validated
    expect(prismaCIFindFirst).toHaveBeenCalledTimes(2);
    // Phase 7: relationshipTypeId is written; legacy `relationshipType` field is NOT
    expect(prismaRelCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          sourceId: CI_ID_1,
          targetId: CI_ID_2,
          relationshipTypeId: 'rel-uuid',
        }),
      }),
    );
    const callData = (prismaRelCreate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(callData).not.toHaveProperty('relationshipType');
  });

  it('prevents self-referencing relationship', async () => {
    await expect(
      createRelationship(TENANT_ID, {
        sourceId: CI_ID_1,
        targetId: CI_ID_1,
        relationshipType: 'DEPENDS_ON',
      }),
    ).rejects.toThrow('A CI cannot have a relationship with itself');

    // Should not even attempt to look up CIs
    expect(prismaCIFindFirst).not.toHaveBeenCalled();
    expect(prismaRelCreate).not.toHaveBeenCalled();
  });

  it('prevents duplicate relationship (same source, target, type)', async () => {
    // Source CI exists
    prismaCIFindFirst
      .mockResolvedValueOnce({ id: CI_ID_1, tenantId: TENANT_ID })   // source
      .mockResolvedValueOnce({ id: CI_ID_2, tenantId: TENANT_ID });  // target

    // Prisma unique constraint violation
    const uniqueError = new Error('Unique constraint failed on the fields: (`sourceId`,`targetId`,`relationshipType`)');
    (uniqueError as Record<string, unknown>).code = 'P2002';
    prismaRelCreate.mockRejectedValue(uniqueError);

    await expect(
      createRelationship(TENANT_ID, {
        sourceId: CI_ID_1,
        targetId: CI_ID_2,
        relationshipType: 'DEPENDS_ON',
      }),
    ).rejects.toThrow();

    // Create was attempted but failed with unique constraint
    expect(prismaRelCreate).toHaveBeenCalledTimes(1);
  });

  it('impact analysis returns depth-limited CIs', async () => {
    const rootCi = { id: CI_ID_1, tenantId: TENANT_ID, name: 'Root Server', type: 'SERVER', status: 'ACTIVE' };
    prismaCIFindFirst.mockResolvedValue(rootCi);

    // Downstream: two CIs at depth 1 and 2
    const downstreamRows = [
      { ciId: CI_ID_2, depth: 1, relationshipType: 'DEPENDS_ON' },
      { ciId: CI_ID_3, depth: 2, relationshipType: 'RUNS_ON' },
    ];
    // Upstream: empty
    const upstreamRows: unknown[] = [];

    prismaQueryRaw
      .mockResolvedValueOnce(downstreamRows)   // downstream CTE
      .mockResolvedValueOnce(upstreamRows);    // upstream CTE

    // CI details for impacted nodes
    const ciDetails = [
      { id: CI_ID_2, name: 'App Server', type: 'SERVER', status: 'ACTIVE', ciNumber: 2, hostname: 'app01', criticality: 'HIGH', classId: null },
      { id: CI_ID_3, name: 'Database', type: 'DATABASE', status: 'ACTIVE', ciNumber: 3, hostname: 'db01', criticality: 'CRITICAL', classId: null },
    ];
    prismaCIFindMany.mockResolvedValue(ciDetails);

    const result = await getImpactAnalysis(TENANT_ID, CI_ID_1, 2);

    expect(result).not.toBeNull();
    expect(result!.rootCi).toEqual(rootCi);
    expect(result!.impacted).toHaveLength(2);
    expect(result!.totalCount).toBe(2);

    // Verify depth-limited results
    expect(result!.impacted[0]).toEqual(
      expect.objectContaining({
        ciId: CI_ID_2,
        depth: 1,
        direction: 'downstream',
        name: 'App Server',
      }),
    );
    expect(result!.impacted[1]).toEqual(
      expect.objectContaining({
        ciId: CI_ID_3,
        depth: 2,
        direction: 'downstream',
        name: 'Database',
      }),
    );

    // maxDepth was capped and used
    expect(prismaCIFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CI_ID_1, tenantId: TENANT_ID },
      }),
    );
    // Two raw queries: downstream + upstream CTEs
    expect(prismaQueryRaw).toHaveBeenCalledTimes(2);
  });

  it('impact analysis handles circular relationships without infinite loop', async () => {
    const rootCi = { id: CI_ID_1, tenantId: TENANT_ID, name: 'CI-A', type: 'SERVER', status: 'ACTIVE' };
    prismaCIFindFirst.mockResolvedValue(rootCi);

    // The recursive CTE uses path tracking (NOT r."targetId" = ANY(ig.path))
    // to prevent cycles. Even with A->B->C->A, the CTE returns each CI once.
    const downstreamRows = [
      { ciId: CI_ID_2, depth: 1, relationshipType: 'DEPENDS_ON' },
      { ciId: CI_ID_3, depth: 2, relationshipType: 'DEPENDS_ON' },
      // CI_ID_1 is NOT returned because the CTE's path check prevents revisiting root
    ];
    const upstreamRows: unknown[] = [];

    prismaQueryRaw
      .mockResolvedValueOnce(downstreamRows)
      .mockResolvedValueOnce(upstreamRows);

    const ciDetails = [
      { id: CI_ID_2, name: 'CI-B', type: 'SERVER', status: 'ACTIVE', ciNumber: 2, hostname: null, criticality: null, classId: null },
      { id: CI_ID_3, name: 'CI-C', type: 'SERVER', status: 'ACTIVE', ciNumber: 3, hostname: null, criticality: null, classId: null },
    ];
    prismaCIFindMany.mockResolvedValue(ciDetails);

    const result = await getImpactAnalysis(TENANT_ID, CI_ID_1, 5);

    // Completes without hanging (no infinite loop)
    expect(result).not.toBeNull();
    // Root CI is NOT in the impacted list (no cycle back to root)
    expect(result!.impacted.every((ci) => ci.ciId !== CI_ID_1)).toBe(true);
    expect(result!.impacted).toHaveLength(2);
  });

  it('logs CI field change in CmdbChangeRecord with old/new values', async () => {
    const existingCI = {
      id: CI_ID_1,
      tenantId: TENANT_ID,
      name: 'Old Name',
      hostname: 'old-host',
      status: 'ACTIVE',
      type: 'SERVER',
      installDate: null,
      attributesJson: null,
    };
    txCIFindFirst.mockResolvedValue(existingCI);
    txChangeRecordCreateMany.mockResolvedValue({ count: 2 });
    txCIUpdate.mockResolvedValue({
      ...existingCI,
      name: 'New Name',
      hostname: 'new-host',
    });

    const result = await updateCI(
      TENANT_ID,
      CI_ID_1,
      { name: 'New Name', hostname: 'new-host' },
      USER_ID,
    );

    expect(result).toBeDefined();
    // Change records were created for each changed field
    expect(txChangeRecordCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            tenantId: TENANT_ID,
            ciId: CI_ID_1,
            changeType: 'UPDATED',
            fieldName: 'name',
            oldValue: 'Old Name',
            newValue: 'New Name',
            changedBy: 'USER',
            userId: USER_ID,
          }),
          expect.objectContaining({
            tenantId: TENANT_ID,
            ciId: CI_ID_1,
            changeType: 'UPDATED',
            fieldName: 'hostname',
            oldValue: 'old-host',
            newValue: 'new-host',
            changedBy: 'USER',
            userId: USER_ID,
          }),
        ]),
      }),
    );
    // CI was actually updated
    expect(txCIUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CI_ID_1 },
        data: expect.objectContaining({
          name: 'New Name',
          hostname: 'new-host',
        }),
      }),
    );
  });

  it('creates category with parent (hierarchical)', async () => {
    const parentCategory = { id: PARENT_CATEGORY_ID, tenantId: TENANT_ID, name: 'Hardware', parentId: null };
    prismaCategoryFindFirst.mockResolvedValue(parentCategory);

    const newCategory = {
      id: CATEGORY_ID,
      tenantId: TENANT_ID,
      name: 'Servers',
      slug: 'servers',
      parentId: PARENT_CATEGORY_ID,
    };
    prismaCategoryCreate.mockResolvedValue(newCategory);

    // Cycle check returns empty (no cycle)
    prismaQueryRaw.mockResolvedValue([]);

    const result = await createCategory(TENANT_ID, {
      name: 'Servers',
      slug: 'servers',
      parentId: PARENT_CATEGORY_ID,
    });

    expect(result).toEqual(newCategory);
    // Parent was validated
    expect(prismaCategoryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PARENT_CATEGORY_ID, tenantId: TENANT_ID },
      }),
    );
    // Category was created with parentId
    expect(prismaCategoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          name: 'Servers',
          slug: 'servers',
          parentId: PARENT_CATEGORY_ID,
        }),
      }),
    );
    // Cycle check query was run
    expect(prismaQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('detects category hierarchy cycle', async () => {
    const parentCategory = { id: PARENT_CATEGORY_ID, tenantId: TENANT_ID, name: 'Child', parentId: CATEGORY_ID };
    prismaCategoryFindFirst.mockResolvedValue(parentCategory);

    const newCategory = {
      id: CATEGORY_ID,
      tenantId: TENANT_ID,
      name: 'Parent',
      slug: 'parent',
      parentId: PARENT_CATEGORY_ID,
    };
    prismaCategoryCreate.mockResolvedValue(newCategory);

    // Cycle detected: the recursive CTE finds the new category's ID in the ancestor chain
    prismaQueryRaw.mockResolvedValue([{ id: CATEGORY_ID }]);

    // Delete is called to rollback
    prismaCategoryDelete.mockResolvedValue(newCategory);

    await expect(
      createCategory(TENANT_ID, {
        name: 'Parent',
        slug: 'parent',
        parentId: PARENT_CATEGORY_ID,
      }),
    ).rejects.toThrow('Category hierarchy cycle detected');

    // Category was created then deleted (rollback)
    expect(prismaCategoryCreate).toHaveBeenCalledTimes(1);
    expect(prismaCategoryDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CATEGORY_ID },
      }),
    );
  });

  // === Phase 7 (CREF-01, CREF-02, CREF-05) — promoted from Wave 0 scaffolds ===

  it('createCI rejects missing classId', async () => {
    await expect(
      createCI(TENANT_ID, { name: 'NoClass' }, USER_ID),
    ).rejects.toThrow(/classId is required/);
    // Service-layer guard runs BEFORE the prisma.$transaction call, so the
    // transaction callback (and the advisory lock + $queryRaw + cmdbConfigurationItem.create)
    // must NEVER fire when classId is absent.
    expect(prismaTransaction).not.toHaveBeenCalled();
    expect(txCICreate).not.toHaveBeenCalled();
  });

  it('createCI does not write legacy type field', async () => {
    txExecuteRaw.mockResolvedValue(undefined);
    txQueryRaw.mockResolvedValue([{ next: BigInt(1) }]);
    txCICreate.mockResolvedValue({ id: CI_ID_1, ciNumber: 1, tenantId: TENANT_ID });
    txChangeRecordCreate.mockResolvedValue({ id: 'cr-1' });

    await createCI(
      TENANT_ID,
      {
        name: 'X',
        classId: 'class-uuid-aaa',
        lifecycleStatusId: 'lc-uuid',
        operationalStatusId: 'op-uuid',
        environmentId: 'env-uuid',
      },
      USER_ID,
    );

    const callArgs = (txCICreate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(callArgs).not.toHaveProperty('type');
    expect(callArgs).not.toHaveProperty('status');
    expect(callArgs).not.toHaveProperty('environment');
    expect(callArgs.classId).toBe('class-uuid-aaa');
    expect(callArgs.lifecycleStatusId).toBe('lc-uuid');
    expect(callArgs.operationalStatusId).toBe('op-uuid');
    expect(callArgs.environmentId).toBe('env-uuid');
  });

  it("deleteCI uses lifecycleStatusId='retired' instead of legacy status='DECOMMISSIONED'", async () => {
    txCIFindFirst.mockResolvedValue({ id: CI_ID_1, tenantId: TENANT_ID });
    txChangeRecordCreate.mockResolvedValue({ id: 'cr-del' });
    txCIUpdate.mockResolvedValue({ id: CI_ID_1, isDeleted: true });

    await deleteCI(TENANT_ID, CI_ID_1, USER_ID);

    const updateArgs = (txCIUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(updateArgs.isDeleted).toBe(true);
    // Phase 7: writes the FK id resolved via resolveLifecycleStatusId
    // (mocked at the top of this file to return 'lc-retired-uuid').
    expect(updateArgs.lifecycleStatusId).toBe('lc-retired-uuid');
    // The legacy enum column is NEVER written.
    expect(updateArgs).not.toHaveProperty('status');
  });
});
