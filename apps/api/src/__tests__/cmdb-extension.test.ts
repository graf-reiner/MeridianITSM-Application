import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 8 — CASR-06 / D-07 / D-08 service tests.
 *
 * Exercises `upsertServerExtensionByAsset` from cmdb-extension.service.ts.
 * Mock scaffold pattern: vi.hoisted + vi.mock (PATTERNS.md section 20), with
 * mocks wired for @meridian/db + cmdb-reference-resolver.service.
 *
 * Multi-tenancy assertion: Test 4 ("rejects cross-tenant Asset") is the
 * affirmative tenant-isolation guard per CLAUDE.md Rule 1 + T-8-02-01.
 */

// ---------------------------------------------------------------------------
// Hoisted mock surfaces (available inside vi.mock factories)
// ---------------------------------------------------------------------------

const {
  mockPrismaObj,
  mockTx,
  txAssetFindFirst,
  txCIFindFirst,
  txCICreate,
  txServerUpsert,
  txSoftwareUpsert,
  txExecuteRaw,
  txQueryRaw,
  prismaTransaction,
  mockResolveClassId,
  mockResolveLifecycleStatusId,
  mockResolveOperationalStatusId,
  mockResolveEnvironmentId,
} = vi.hoisted(() => {
  const mockPrismaObj = {} as Record<string, unknown>;
  const mockTx = {} as Record<string, unknown>;

  const txAssetFindFirst = vi.fn();
  const txCIFindFirst = vi.fn();
  const txCICreate = vi.fn();
  const txServerUpsert = vi.fn();
  const txSoftwareUpsert = vi.fn();
  const txExecuteRaw = vi.fn();
  const txQueryRaw = vi.fn().mockResolvedValue([{ next: 1 }]);
  const prismaTransaction = vi.fn();

  Object.assign(mockTx, {
    asset: { findFirst: txAssetFindFirst },
    cmdbConfigurationItem: { findFirst: txCIFindFirst, create: txCICreate },
    cmdbCiServer: { upsert: txServerUpsert },
    cmdbSoftwareInstalled: { upsert: txSoftwareUpsert },
    $executeRaw: txExecuteRaw,
    $queryRaw: txQueryRaw,
  });

  Object.assign(mockPrismaObj, { $transaction: prismaTransaction });

  const mockResolveClassId = vi.fn().mockResolvedValue('class-uuid-server');
  const mockResolveLifecycleStatusId = vi.fn().mockResolvedValue('status-in-service');
  const mockResolveOperationalStatusId = vi.fn().mockResolvedValue('status-online');
  const mockResolveEnvironmentId = vi.fn().mockResolvedValue('env-prod');

  return {
    mockPrismaObj,
    mockTx,
    txAssetFindFirst,
    txCIFindFirst,
    txCICreate,
    txServerUpsert,
    txSoftwareUpsert,
    txExecuteRaw,
    txQueryRaw,
    prismaTransaction,
    mockResolveClassId,
    mockResolveLifecycleStatusId,
    mockResolveOperationalStatusId,
    mockResolveEnvironmentId,
  };
});

vi.mock('@meridian/db', () => ({ prisma: mockPrismaObj }));

vi.mock('../services/cmdb-reference-resolver.service', () => ({
  resolveClassId: mockResolveClassId,
  resolveLifecycleStatusId: mockResolveLifecycleStatusId,
  resolveOperationalStatusId: mockResolveOperationalStatusId,
  resolveEnvironmentId: mockResolveEnvironmentId,
}));

// ---------------------------------------------------------------------------
// Import service under test (after mocks are in place)
// ---------------------------------------------------------------------------

import {
  upsertServerExtensionByAsset,
  parseSoftwareList,
  type AgentInventorySnapshot,
} from '../services/cmdb-extension.service.js';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TENANT = '00000000-0000-0000-0000-000000000001';
const ASSET = '00000000-0000-0000-0000-0000000000a1';

const SNAPSHOT: AgentInventorySnapshot = {
  hostname: 'srv-01',
  fqdn: null,
  operatingSystem: 'Linux',
  osVersion: '5.10',
  cpuCount: 4,
  cpuModel: 'Xeon',
  ramGb: 8,
  storageGb: null,
  disks: null,
  networkInterfaces: null,
  domainName: null,
  hypervisorType: null,
  isVirtual: false,
  installedSoftware: [{ name: 'nginx', version: '1.24.0' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  txQueryRaw.mockResolvedValue([{ next: 1 }]);
  mockResolveClassId.mockResolvedValue('class-uuid-server');
  mockResolveLifecycleStatusId.mockResolvedValue('status-in-service');
  mockResolveOperationalStatusId.mockResolvedValue('status-online');
  mockResolveEnvironmentId.mockResolvedValue('env-prod');
  prismaTransaction.mockImplementation(
    (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('upsertServerExtensionByAsset (Phase 8 / CASR-06 / D-07 / D-08)', () => {
  it('upsertServerExtensionByAsset writes only to CmdbCiServer (never touches Asset)', async () => {
    txAssetFindFirst.mockResolvedValue({ id: ASSET });
    txCIFindFirst.mockResolvedValue({ id: 'ci-1' });

    await upsertServerExtensionByAsset(
      mockTx as never,
      TENANT,
      ASSET,
      SNAPSHOT,
    );

    // CmdbCiServer upserted exactly once
    expect(txServerUpsert).toHaveBeenCalledTimes(1);
    // Asset MUST NOT have been mutated — mockTx.asset exposes only findFirst.
    expect(mockTx.asset).not.toHaveProperty('update');
    expect(mockTx.asset).not.toHaveProperty('upsert');
    expect(mockTx.asset).not.toHaveProperty('create');
    // Asset lookup went through a tenant-scoped findFirst (T-8-02-01)
    expect(txAssetFindFirst).toHaveBeenCalledWith({
      where: { id: ASSET, tenantId: TENANT },
      select: { id: true },
    });
  });

  it('upsertServerExtensionByAsset auto-creates CI for orphan', async () => {
    // Orphan path: assetId=null, no existing CI
    txCIFindFirst.mockResolvedValue(null);
    txCICreate.mockResolvedValue({ id: 'ci-new' });

    const result = await upsertServerExtensionByAsset(
      mockTx as never,
      TENANT,
      null,
      SNAPSHOT,
    );

    expect(result.created).toBe(true);
    expect(result.ciId).toBe('ci-new');
    expect(txCICreate).toHaveBeenCalledTimes(1);
    // Advisory lock acquired before ciNumber allocation (Pitfall 2)
    expect(txExecuteRaw).toHaveBeenCalled();
    // Class resolver called with inferred classKey
    expect(mockResolveClassId).toHaveBeenCalledWith(TENANT, 'server');
  });

  it('upsertServerExtensionByAsset upserts CmdbSoftwareInstalled', async () => {
    txAssetFindFirst.mockResolvedValue({ id: ASSET });
    txCIFindFirst.mockResolvedValue({ id: 'ci-1' });

    await upsertServerExtensionByAsset(
      mockTx as never,
      TENANT,
      ASSET,
      SNAPSHOT,
    );

    // One software row upserted with composite unique key (D-06)
    expect(txSoftwareUpsert).toHaveBeenCalledTimes(1);
    const call = txSoftwareUpsert.mock.calls[0][0];
    expect(call.where.ciId_name_version).toEqual({
      ciId: 'ci-1',
      name: 'nginx',
      version: '1.24.0',
    });
    // tenantId carried onto the row from the trusted function param (T-8-02-02)
    expect(call.create.tenantId).toBe(TENANT);
  });

  it('upsertServerExtensionByAsset rejects cross-tenant Asset', async () => {
    // Cross-tenant assetId: findFirst filters by tenantId so returns null
    // (the asset exists but belongs to another tenant).
    txAssetFindFirst.mockResolvedValue(null);

    await expect(
      upsertServerExtensionByAsset(mockTx as never, TENANT, ASSET, SNAPSHOT),
    ).rejects.toThrow(/asset .* not found in tenant/);

    // Critically: no writes happened — the throw is pre-write
    expect(txServerUpsert).not.toHaveBeenCalled();
    expect(txSoftwareUpsert).not.toHaveBeenCalled();
    expect(txCICreate).not.toHaveBeenCalled();
  });

  it('upsertServerExtensionByAsset throws on missing reference data', async () => {
    // Orphan path + missing classId → Pitfall 7 actionable error
    txCIFindFirst.mockResolvedValue(null);
    mockResolveClassId.mockResolvedValueOnce(null);

    await expect(
      upsertServerExtensionByAsset(mockTx as never, TENANT, null, SNAPSHOT),
    ).rejects.toThrow(/missing reference data/);

    expect(txCICreate).not.toHaveBeenCalled();
    expect(txServerUpsert).not.toHaveBeenCalled();
  });
});

describe('parseSoftwareList (Phase 8)', () => {
  it('returns empty array for null/undefined/invalid', () => {
    expect(parseSoftwareList(null)).toEqual([]);
    expect(parseSoftwareList(undefined)).toEqual([]);
    expect(parseSoftwareList('not-an-array')).toEqual([]);
    expect(parseSoftwareList(42)).toEqual([]);
  });

  it('parses direct array shape', () => {
    const out = parseSoftwareList([{ name: 'nginx', version: '1.24.0' }]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('nginx');
    expect(out[0].version).toBe('1.24.0');
  });

  it('parses { apps: [...] } wrapper shape', () => {
    const out = parseSoftwareList({ apps: [{ name: 'postgres', version: '15.2' }] });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('postgres');
  });

  it('filters items lacking a string name', () => {
    const out = parseSoftwareList([
      { name: 'ok', version: '1.0' },
      { version: '1.0' }, // no name
      { name: 42, version: '1.0' }, // non-string name
      null,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('ok');
  });
});
