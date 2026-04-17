import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * CMDB bulk import service unit tests.
 * Covers CMDB-10 (CSV/JSON bulk import) and per-row validation behaviors.
 */

// ---------------------------------------------------------------------------
// Hoisted mock functions
// ---------------------------------------------------------------------------

const { mockTx, mockPrisma } = vi.hoisted(() => {
  return {
    mockTx: {} as Record<string, unknown>,
    mockPrisma: {} as Record<string, unknown>,
  };
});

const txCICreate = vi.fn();
const txChangeRecordCreate = vi.fn();
const txExecuteRaw = vi.fn();
const txQueryRaw = vi.fn();
const txCmdbCategoryFindMany = vi.fn();
const txCmdbCiClassFindMany = vi.fn();
const txCmdbStatusFindMany = vi.fn();
const txCmdbEnvironmentFindMany = vi.fn();
const txCmdbVendorFindMany = vi.fn();
const prismaTransaction = vi.fn();

Object.assign(mockTx, {
  cmdbConfigurationItem: { create: txCICreate },
  cmdbChangeRecord: { create: txChangeRecordCreate },
  cmdbCategory: { findMany: txCmdbCategoryFindMany },
  cmdbCiClass: { findMany: txCmdbCiClassFindMany },
  cmdbStatus: { findMany: txCmdbStatusFindMany },
  cmdbEnvironment: { findMany: txCmdbEnvironmentFindMany },
  cmdbVendor: { findMany: txCmdbVendorFindMany },
  $executeRaw: txExecuteRaw,
  $queryRaw: txQueryRaw,
});

Object.assign(mockPrisma, {
  $transaction: prismaTransaction,
});

// ---------------------------------------------------------------------------
// Mock @meridian/db
// ---------------------------------------------------------------------------

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));

// ---------------------------------------------------------------------------
// Import SUT
// ---------------------------------------------------------------------------

import { importCIs } from '../services/cmdb-import.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-001';
const USER_ID = 'user-001';

function validRow(overrides: Record<string, unknown> = {}) {
  // Phase 7: classKey is mandatory — it must resolve to a seeded CI class.
  return { name: 'Web Server 01', type: 'SERVER', classKey: 'server', ...overrides };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: transaction executes callback with mockTx
  prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
    return cb(mockTx);
  });

  // Default: next ciNumber = 1
  txQueryRaw.mockResolvedValue([{ next: BigInt(1) }]);

  // Default: no reference table lookups needed
  txCmdbCategoryFindMany.mockResolvedValue([]);
  // Phase 7: every validRow() uses classKey 'server' — resolve it by default
  // so existing tests do not trip the new mandatory-classKey guard.
  txCmdbCiClassFindMany.mockResolvedValue([{ id: 'class-server-uuid', classKey: 'server' }]);
  txCmdbStatusFindMany.mockResolvedValue([]);
  txCmdbEnvironmentFindMany.mockResolvedValue([]);
  txCmdbVendorFindMany.mockResolvedValue([]);

  // Default: CI create returns an object with id
  txCICreate.mockResolvedValue({ id: 'ci-new-001' });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CmdbImportService', () => {
  it('imports valid CSV rows as CIs', async () => {
    const rows = [validRow(), validRow({ name: 'DB Server 01', type: 'DATABASE' })];

    const result = await importCIs(TENANT_ID, rows, USER_ID);

    expect(result.imported).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(txCICreate).toHaveBeenCalledTimes(2);
    expect(txChangeRecordCreate).toHaveBeenCalledTimes(2);

    // First CI gets ciNumber sequence applied. Phase 7: classId is the
    // FK write; legacy `type` enum is no longer written.
    expect(txCICreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          name: 'Web Server 01',
          classId: 'class-server-uuid',
          sourceSystem: 'csv-import',
        }),
      }),
    );
    const firstCallData = (txCICreate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(firstCallData).not.toHaveProperty('type');
    expect(firstCallData).not.toHaveProperty('status');
    expect(firstCallData).not.toHaveProperty('environment');

    // Change record uses changedBy=IMPORT
    expect(txChangeRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          changeType: 'CREATED',
          changedBy: 'IMPORT',
          userId: USER_ID,
        }),
      }),
    );
  });

  it('rejects rows with missing required fields', async () => {
    const rows = [{ type: 'SERVER' }]; // missing name

    const result = await importCIs(TENANT_ID, rows, USER_ID);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
    expect(txCICreate).not.toHaveBeenCalled();
  });

  it('rejects rows with invalid CI type', async () => {
    const rows = [{ name: 'Bad CI', type: 'INVALID_TYPE' }];

    const result = await importCIs(TENANT_ID, rows, USER_ID);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
    // Error should reference the type field
    expect(result.errors[0].errors.some((e) => e.path.includes('type'))).toBe(true);
  });

  it('returns per-row error details for invalid rows', async () => {
    const rows = [
      { type: 'SERVER' },           // row 1: missing name
      { name: '', type: 'SERVER' }, // row 2: empty name
    ];

    const result = await importCIs(TENANT_ID, rows, USER_ID);

    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].row).toBe(1);
    expect(result.errors[1].row).toBe(2);
    // Each error entry has ZodIssue array
    expect(result.errors[0].errors.length).toBeGreaterThan(0);
    expect(result.errors[1].errors.length).toBeGreaterThan(0);
  });

  it('imports good rows even when some rows have errors', async () => {
    const rows = [
      validRow({ name: 'Good Server' }),
      { type: 'INVALID' },                    // bad row
      validRow({ name: 'Another Good Server' }),
    ];

    const result = await importCIs(TENANT_ID, rows, USER_ID);

    expect(result.imported).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(txCICreate).toHaveBeenCalledTimes(2);
  });

  it('reports success/skip/error counts', async () => {
    const rows = [
      validRow({ name: 'Server A' }),
      { name: '', type: 'SERVER' },   // invalid (empty name)
      validRow({ name: 'Server B' }),
      { type: 'BAD' },                // invalid (no name + bad type)
      validRow({ name: 'Server C' }),
    ];

    const result = await importCIs(TENANT_ID, rows, USER_ID);

    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(2);
    expect(result.errors).toHaveLength(2);
    // Total should add up
    expect(result.imported + result.skipped).toBe(rows.length);
  });

  // === Phase 7 (CREF-01) — promoted from Wave 0 scaffold ===

  it('import requires classKey to resolve to non-null classId', async () => {
    // Mock classMap to return ONLY the 'server' class — the unknown key
    // 'nonexistent_class' must NOT resolve.
    txCmdbCiClassFindMany.mockResolvedValue([{ id: 'class-server-uuid', classKey: 'server' }]);

    const rows = [
      validRow({ name: 'Good Server' }),                          // classKey='server' → resolves
      validRow({ name: 'Bad Class', classKey: 'nonexistent_class' }), // does NOT resolve
    ];

    const result = await importCIs(TENANT_ID, rows, USER_ID);

    // Only the resolvable row imports
    expect(result.imported).toBe(1);
    // The bad-classKey row surfaces as a per-row error (skipped, not imported)
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errors[0].message).toMatch(/did not resolve/);
    expect(result.errors[0].errors[0].path).toContain('classKey');
    // Service only called create for the good row
    expect(txCICreate).toHaveBeenCalledTimes(1);
  });

  it('import rejects rows whose classKey is missing entirely', async () => {
    txCmdbCiClassFindMany.mockResolvedValue([{ id: 'class-server-uuid', classKey: 'server' }]);

    // Row omits classKey (and the default in validRow is overridden to undefined)
    const rows = [{ name: 'No Class Provided' }];

    const result = await importCIs(TENANT_ID, rows, USER_ID);

    // The row passes Zod (name only is required) but fails the classKey guard
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errors[0].message).toMatch(/did not resolve/);
    expect(txCICreate).not.toHaveBeenCalled();
  });
});
