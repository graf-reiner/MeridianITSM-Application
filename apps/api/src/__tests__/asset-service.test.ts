import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock scaffold
// ---------------------------------------------------------------------------

const { mockPrismaObj, mockTx } = vi.hoisted(() => {
  return { mockPrismaObj: {} as Record<string, any>, mockTx: {} as Record<string, any> };
});

// Mock fns for transaction context
const txExecuteRaw = vi.fn();
const txQueryRaw = vi.fn();
const txAssetCreate = vi.fn();

// Mock fns for direct prisma calls
const prismaAssetFindFirst = vi.fn();
const prismaAssetFindMany = vi.fn();
const prismaAssetCount = vi.fn();
const prismaAssetUpdate = vi.fn();
const prismaTransaction = vi.fn();

Object.assign(mockTx, {
  asset: { create: txAssetCreate },
  $executeRaw: txExecuteRaw,
  $queryRaw: txQueryRaw,
});

Object.assign(mockPrismaObj, {
  asset: {
    findFirst: prismaAssetFindFirst,
    findMany: prismaAssetFindMany,
    count: prismaAssetCount,
    update: prismaAssetUpdate,
  },
  $transaction: prismaTransaction,
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@meridian/db', () => ({ prisma: mockPrismaObj }));

// Import service under test (after mocks)
import { createAsset, updateAsset, listAssets } from '../services/asset.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ACTOR_ID = '00000000-0000-0000-0000-000000000099';
const ASSET_ID = '00000000-0000-0000-0000-a00000000001';
const USER_ID = '00000000-0000-0000-0000-u00000000001';
const SITE_ID = '00000000-0000-0000-0000-s00000000001';

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: $transaction passes callback the mockTx
  prismaTransaction.mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssetService', () => {
  it('creates asset with sequential assetTag (AST-00001)', async () => {
    txExecuteRaw.mockResolvedValue(undefined);
    txQueryRaw.mockResolvedValue([{ next: BigInt(1) }]);

    const createdAsset = {
      id: ASSET_ID,
      tenantId: TENANT_ID,
      assetTag: 'AST-00001',
      status: 'IN_STOCK',
      site: null,
    };
    txAssetCreate.mockResolvedValue(createdAsset);

    const result = await createAsset(
      mockPrismaObj as any,
      TENANT_ID,
      { manufacturer: 'Dell', model: 'Latitude 5530' },
      ACTOR_ID,
    );

    expect(result.assetTag).toBe('AST-00001');
    expect(txAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          assetTag: 'AST-00001',
          manufacturer: 'Dell',
          model: 'Latitude 5530',
          status: 'IN_STOCK',
        }),
      }),
    );
  });

  it('rejects invalid status transition (DISPOSED -> DEPLOYED)', async () => {
    prismaAssetFindFirst.mockResolvedValue({
      id: ASSET_ID,
      tenantId: TENANT_ID,
      status: 'DISPOSED',
    });

    await expect(
      updateAsset(
        mockPrismaObj as any,
        TENANT_ID,
        ASSET_ID,
        { status: 'DEPLOYED' },
        ACTOR_ID,
      ),
    ).rejects.toThrow('Invalid status transition from DISPOSED to DEPLOYED');
  });

  it('allows valid status transition (IN_STOCK -> DEPLOYED)', async () => {
    prismaAssetFindFirst.mockResolvedValue({
      id: ASSET_ID,
      tenantId: TENANT_ID,
      status: 'IN_STOCK',
    });

    const updatedAsset = {
      id: ASSET_ID,
      tenantId: TENANT_ID,
      status: 'DEPLOYED',
      site: null,
    };
    prismaAssetUpdate.mockResolvedValue(updatedAsset);

    const result = await updateAsset(
      mockPrismaObj as any,
      TENANT_ID,
      ASSET_ID,
      { status: 'DEPLOYED' },
      ACTOR_ID,
    );

    expect(result!.status).toBe('DEPLOYED');
    expect(prismaAssetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ASSET_ID },
        data: expect.objectContaining({ status: 'DEPLOYED' }),
      }),
    );
  });

  it('allows valid status transition (DEPLOYED -> IN_REPAIR)', async () => {
    prismaAssetFindFirst.mockResolvedValue({
      id: ASSET_ID,
      tenantId: TENANT_ID,
      status: 'DEPLOYED',
    });

    const updatedAsset = {
      id: ASSET_ID,
      tenantId: TENANT_ID,
      status: 'IN_REPAIR',
      site: null,
    };
    prismaAssetUpdate.mockResolvedValue(updatedAsset);

    const result = await updateAsset(
      mockPrismaObj as any,
      TENANT_ID,
      ASSET_ID,
      { status: 'IN_REPAIR' },
      ACTOR_ID,
    );

    expect(result!.status).toBe('IN_REPAIR');
  });

  it('assigns asset to user and site', async () => {
    prismaAssetFindFirst.mockResolvedValue({
      id: ASSET_ID,
      tenantId: TENANT_ID,
      status: 'IN_STOCK',
      assignedToId: null,
      siteId: null,
    });

    const updatedAsset = {
      id: ASSET_ID,
      tenantId: TENANT_ID,
      status: 'IN_STOCK',
      assignedToId: USER_ID,
      siteId: SITE_ID,
      site: { id: SITE_ID, name: 'HQ' },
    };
    prismaAssetUpdate.mockResolvedValue(updatedAsset);

    const result = await updateAsset(
      mockPrismaObj as any,
      TENANT_ID,
      ASSET_ID,
      { assignedToId: USER_ID, siteId: SITE_ID },
      ACTOR_ID,
    );

    expect(result!.assignedToId).toBe(USER_ID);
    expect(result!.siteId).toBe(SITE_ID);
    expect(prismaAssetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedToId: USER_ID,
          siteId: SITE_ID,
        }),
      }),
    );
  });

  it('lists assets with status filter', async () => {
    const assets = [
      { id: 'a1', status: 'IN_STOCK', site: null },
      { id: 'a2', status: 'IN_STOCK', site: null },
    ];
    prismaAssetFindMany.mockResolvedValue(assets);
    prismaAssetCount.mockResolvedValue(2);

    const result = await listAssets(mockPrismaObj as any, TENANT_ID, {
      status: 'IN_STOCK',
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(prismaAssetFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          status: 'IN_STOCK',
        }),
      }),
    );
  });

  it('lists assets filtered by assignedToId', async () => {
    const assets = [{ id: 'a1', assignedToId: USER_ID, site: null }];
    prismaAssetFindMany.mockResolvedValue(assets);
    prismaAssetCount.mockResolvedValue(1);

    const result = await listAssets(mockPrismaObj as any, TENANT_ID, {
      assignedToId: USER_ID,
    });

    expect(result.data).toHaveLength(1);
    expect(prismaAssetFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          assignedToId: USER_ID,
        }),
      }),
    );
  });

  it('stores purchase tracking fields (purchaseDate, purchaseCost, warrantyExpiry)', async () => {
    txExecuteRaw.mockResolvedValue(undefined);
    txQueryRaw.mockResolvedValue([{ next: BigInt(5) }]);

    const purchaseDate = '2025-06-15';
    const warrantyExpiry = '2028-06-15';

    const createdAsset = {
      id: ASSET_ID,
      tenantId: TENANT_ID,
      assetTag: 'AST-00005',
      status: 'IN_STOCK',
      purchaseDate: new Date(purchaseDate),
      purchaseCost: 1299.99,
      warrantyExpiry: new Date(warrantyExpiry),
      site: null,
    };
    txAssetCreate.mockResolvedValue(createdAsset);

    const result = await createAsset(
      mockPrismaObj as any,
      TENANT_ID,
      {
        manufacturer: 'Lenovo',
        model: 'ThinkPad X1',
        purchaseDate,
        purchaseCost: 1299.99,
        warrantyExpiry,
      },
      ACTOR_ID,
    );

    expect(result.purchaseCost).toBe(1299.99);
    expect(txAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purchaseDate: new Date(purchaseDate),
          purchaseCost: 1299.99,
          warrantyExpiry: new Date(warrantyExpiry),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 8 — Asset hardware fields removed (CASR-01)
// ---------------------------------------------------------------------------
//
// Wave 3 (plan 08-04) PROMOTED — these previously were it.todo scaffolds.
// They prove the asset.service.ts CreateAssetData interface no longer carries
// the 10 hardware/OS fields and createAsset's prisma.asset.create call no
// longer writes them. Tenant scoping (CLAUDE.md Rule 1) preserved by the
// existing tests above.
describe('Phase 8 - Asset hardware fields removed (CASR-01)', () => {
  it('createAsset rejects hostname field', () => {
    // Compile-time check via @ts-expect-error.
    // If `hostname?` were still on CreateAssetData, this line would compile
    // silently and the test would FAIL (because @ts-expect-error requires an
    // actual error to consume).
    // @ts-expect-error - hostname removed from CreateAssetData in Phase 8 (CASR-01)
    const _bad: import('../services/asset.service.js').CreateAssetData = { hostname: 'x' };
    expect(_bad).toBeDefined();
  });

  it('createAsset does not write any of the 10 dropped hardware fields', async () => {
    txExecuteRaw.mockResolvedValue(undefined);
    txQueryRaw.mockResolvedValue([{ next: BigInt(1) }]);
    txAssetCreate.mockResolvedValue({
      id: ASSET_ID,
      tenantId: TENANT_ID,
      assetTag: 'AST-00001',
      status: 'IN_STOCK',
      site: null,
    });

    await createAsset(
      mockPrismaObj as any,
      TENANT_ID,
      { manufacturer: 'Dell' },
      ACTOR_ID,
    );

    // Inspect prisma.asset.create call args
    expect(txAssetCreate).toHaveBeenCalledTimes(1);
    const callArgs = txAssetCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    const dropped = [
      'hostname',
      'operatingSystem',
      'osVersion',
      'cpuModel',
      'cpuCores',
      'ramGb',
      'disks',
      'networkInterfaces',
      'softwareInventory',
      'lastInventoryAt',
    ];
    for (const field of dropped) {
      expect(callArgs.data).not.toHaveProperty(field);
    }
    // Belt-and-suspenders: tenantId IS present (multi-tenancy preserved)
    expect(callArgs.data).toHaveProperty('tenantId', TENANT_ID);
  });
});
