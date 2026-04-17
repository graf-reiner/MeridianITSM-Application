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
  return { name: 'Web Server 01', type: 'SERVER', ...overrides };
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
  txCmdbCiClassFindMany.mockResolvedValue([]);
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

    // First CI gets ciNumber sequence applied
    expect(txCICreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          name: 'Web Server 01',
          type: 'SERVER',
          sourceSystem: 'csv-import',
        }),
      }),
    );

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

  // === Phase 7 (CREF-01) ===
  // Scaffold: import requires classKey to resolve to a non-null classId for
  // the tenant. Bodies land in Plan 04 once cmdb-import.service.ts rejects
  // rows whose classKey does not match a seeded CmdbCiClass.
  it.todo('import requires classKey to resolve to non-null classId');
});
