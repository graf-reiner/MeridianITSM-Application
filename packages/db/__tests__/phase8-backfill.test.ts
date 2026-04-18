import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { migrateTenant } from '../scripts/phase8-backfill.js';
import { seedCmdbReferenceData } from '../src/seeds/cmdb-reference.js';

/**
 * Phase 8 Wave 2 integration tests (CASR-04).
 *
 * Exercises `migrateTenant` from packages/db/scripts/phase8-backfill.ts
 * against a real Postgres instance. Seeds two isolated test tenants so the
 * cross-tenant isolation test (Test 3) can verify that migrating tenant A
 * leaves tenant B untouched.
 *
 * Requires the Phase 8 Wave 1 migration to have been applied to the dev DB
 * (cmdb_software_installed + cmdb_migration_audit tables + the 3 new
 * CmdbCiServer columns). If the DB is not reachable (Docker Desktop not
 * running), these tests FAIL TO CONNECT — that is the expected
 * environmental gate per Phase 08-01 / 08-02 SUMMARY precedent.
 *
 * Test IDs match the VALIDATION.md per-task verification map strings so
 * `vitest run -t "phase8-backfill upserts CmdbCiServer and logs CI-wins
 * conflicts"` and `vitest run -t "phase8-backfill logs conflict per field"`
 * each discover exactly one passing test.
 */

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Unique tenant ids well outside the dev seed range so the tests never
// collide with real tenant data.
const TENANT_A = '11111111-1111-1111-1111-11111111aaa1';
const TENANT_B = '11111111-1111-1111-1111-11111111bbb1';

async function seedTenant(tenantId: string, name: string): Promise<void> {
  await prisma.tenant.upsert({
    where: { id: tenantId },
    create: {
      id: tenantId,
      name,
      slug: `phase8-test-${tenantId.slice(0, 8)}-${Date.now()}`,
      status: 'ACTIVE',
    },
    update: { status: 'ACTIVE' },
  });
  await prisma.$transaction(async (tx) => {
    await seedCmdbReferenceData(tx, tenantId);
  });
}

async function cleanupTenant(tenantId: string): Promise<void> {
  // Delete child tables first to respect FK constraints; use deleteMany so
  // a missing table (e.g., Wave 1 migration not yet applied) raises a
  // clear error instead of silently succeeding.
  await prisma.cmdbMigrationAudit.deleteMany({ where: { tenantId } });
  await prisma.cmdbSoftwareInstalled.deleteMany({ where: { tenantId } });
  await prisma.cmdbCiServer.deleteMany({ where: { tenantId } });
  await prisma.cmdbConfigurationItem.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.cmdbRelationshipTypeRef.deleteMany({ where: { tenantId } });
  await prisma.cmdbCiClass.deleteMany({ where: { tenantId } });
  await prisma.cmdbStatus.deleteMany({ where: { tenantId } });
  await prisma.cmdbEnvironment.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

async function createLinkedCI(
  tenantId: string,
  assetId: string,
  ciNumber = 1,
): Promise<string> {
  const cls = await prisma.cmdbCiClass.findFirstOrThrow({
    where: { tenantId, classKey: 'server' },
  });
  const lc = await prisma.cmdbStatus.findFirstOrThrow({
    where: { tenantId, statusType: 'lifecycle', statusKey: 'in_service' },
  });
  const op = await prisma.cmdbStatus.findFirstOrThrow({
    where: { tenantId, statusType: 'operational', statusKey: 'online' },
  });
  const env = await prisma.cmdbEnvironment.findFirstOrThrow({
    where: { tenantId, envKey: 'prod' },
  });
  const ci = await prisma.cmdbConfigurationItem.create({
    data: {
      tenantId,
      classId: cls.id,
      lifecycleStatusId: lc.id,
      operationalStatusId: op.id,
      environmentId: env.id,
      ciNumber,
      name: `srv-test-${ciNumber}`,
      assetId,
    },
    select: { id: true },
  });
  return ci.id;
}

beforeEach(async () => {
  await cleanupTenant(TENANT_A);
  await cleanupTenant(TENANT_B);
  await seedTenant(TENANT_A, 'Phase 8 Test Tenant A');
  await seedTenant(TENANT_B, 'Phase 8 Test Tenant B');
});

afterAll(async () => {
  await cleanupTenant(TENANT_A);
  await cleanupTenant(TENANT_B);
  await prisma.$disconnect();
  await pool.end();
});

describe('phase8-backfill (CASR-04)', () => {
  it('phase8-backfill upserts CmdbCiServer and logs CI-wins conflicts', async () => {
    // Asset has cpuModel = 'Xeon E5'; existing CI extension has cpuModel = 'Xeon E7'.
    // Expectation: one audit row with fieldName='cpuModel', status='overwritten_by_ci'.
    const assetId = (
      await prisma.asset.create({
        data: {
          tenantId: TENANT_A,
          assetTag: 'A001',
          cpuModel: 'Xeon E5',
          cpuCores: 4,
          ramGb: 16,
        },
        select: { id: true },
      })
    ).id;

    const ciId = await createLinkedCI(TENANT_A, assetId, 1);
    await prisma.cmdbCiServer.create({
      data: {
        ciId,
        tenantId: TENANT_A,
        serverType: 'physical',
        cpuModel: 'Xeon E7',
        cpuCount: 8,
        memoryGb: 32,
      },
    });

    const result = await migrateTenant(TENANT_A, 'Phase 8 Test Tenant A');

    expect(result.assetsProcessed).toBe(1);
    // CI extension already exists with DIFFERENT values — expect cpuModel
    // + cpuCount + memoryGb to each log one CI-wins conflict row.
    const audit = await prisma.cmdbMigrationAudit.findMany({
      where: { tenantId: TENANT_A, recordId: assetId },
    });
    expect(audit.length).toBeGreaterThanOrEqual(1);
    const cpuModelConflict = audit.find((a) => a.fieldName === 'cpuModel');
    expect(cpuModelConflict).toBeDefined();
    expect(cpuModelConflict?.status).toBe('overwritten_by_ci');
    expect(cpuModelConflict?.phase).toBe('phase8');
    // oldValue (Asset-side) + newValue (CI-side) are JSON-canonicalized.
    expect(cpuModelConflict?.oldValue).toBe(JSON.stringify('Xeon E5'));
    expect(cpuModelConflict?.newValue).toBe(JSON.stringify('Xeon E7'));

    // CmdbCiServer value should remain 'Xeon E7' (CI wins — D-01).
    const extAfter = await prisma.cmdbCiServer.findUniqueOrThrow({ where: { ciId } });
    expect(extAfter.cpuModel).toBe('Xeon E7');
  });

  it('phase8-backfill logs conflict per field', async () => {
    // Asset has 2 conflicting fields (cpuCores + ramGb) with existing CI ext.
    // Expectation: 2 audit rows, one per conflicting field.
    const assetId = (
      await prisma.asset.create({
        data: {
          tenantId: TENANT_A,
          assetTag: 'A002',
          cpuCores: 4,
          ramGb: 16,
        },
        select: { id: true },
      })
    ).id;

    const ciId = await createLinkedCI(TENANT_A, assetId, 2);
    await prisma.cmdbCiServer.create({
      data: {
        ciId,
        tenantId: TENANT_A,
        serverType: 'physical',
        cpuCount: 8,
        memoryGb: 32,
      },
    });

    await migrateTenant(TENANT_A, 'Phase 8 Test Tenant A');

    const audit = await prisma.cmdbMigrationAudit.findMany({
      where: { tenantId: TENANT_A, recordId: assetId },
    });
    const fields = audit.map((a) => a.fieldName).sort();
    expect(fields).toContain('cpuCount');
    expect(fields).toContain('memoryGb');
    // Each conflict row must carry the phase marker and status.
    for (const row of audit) {
      expect(row.status).toBe('overwritten_by_ci');
      expect(row.phase).toBe('phase8');
      expect(row.tenantId).toBe(TENANT_A);
    }
  });

  it('phase8-backfill respects tenant isolation (does not touch tenant B data)', async () => {
    // Seed both tenants with hardware-bearing Assets; backfill only tenant A.
    // Expectation: tenant B has zero CIs, zero audit rows, zero ext rows.
    await prisma.asset.create({
      data: { tenantId: TENANT_A, assetTag: 'A003', cpuModel: 'Xeon' },
    });
    await prisma.asset.create({
      data: { tenantId: TENANT_B, assetTag: 'B001', cpuModel: 'Ryzen' },
    });

    await migrateTenant(TENANT_A, 'Phase 8 Test Tenant A');

    // Tenant B: nothing should have been written by the tenant A backfill.
    const auditB = await prisma.cmdbMigrationAudit.count({ where: { tenantId: TENANT_B } });
    expect(auditB).toBe(0);
    const ciB = await prisma.cmdbConfigurationItem.count({ where: { tenantId: TENANT_B } });
    expect(ciB).toBe(0);
    const extB = await prisma.cmdbCiServer.count({ where: { tenantId: TENANT_B } });
    expect(extB).toBe(0);
    const swB = await prisma.cmdbSoftwareInstalled.count({ where: { tenantId: TENANT_B } });
    expect(swB).toBe(0);

    // Tenant B's Asset row is unchanged.
    const assetB = await prisma.asset.findFirstOrThrow({
      where: { tenantId: TENANT_B, assetTag: 'B001' },
    });
    expect(assetB.cpuModel).toBe('Ryzen');
  });

  it('phase8-backfill is idempotent on second run', async () => {
    // Asset has 1 field conflicting with existing CI ext.
    // Expectation: first run logs 1+ conflicts; second run logs 0 new
    // conflicts because the Asset side has not changed AND the CI side has
    // not changed either (CI wins preserved its original values).
    const assetId = (
      await prisma.asset.create({
        data: { tenantId: TENANT_A, assetTag: 'A004', cpuModel: 'Xeon E5' },
        select: { id: true },
      })
    ).id;

    const ciId = await createLinkedCI(TENANT_A, assetId, 3);
    await prisma.cmdbCiServer.create({
      data: {
        ciId,
        tenantId: TENANT_A,
        serverType: 'physical',
        cpuModel: 'Xeon E7',
      },
    });

    await migrateTenant(TENANT_A, 'Phase 8 Test Tenant A');
    const auditAfterFirst = await prisma.cmdbMigrationAudit.count({
      where: { tenantId: TENANT_A },
    });
    expect(auditAfterFirst).toBeGreaterThanOrEqual(1);

    // Second run — no new conflicts because no values changed.
    await migrateTenant(TENANT_A, 'Phase 8 Test Tenant A');
    const auditAfterSecond = await prisma.cmdbMigrationAudit.count({
      where: { tenantId: TENANT_A },
    });
    expect(auditAfterSecond).toBe(auditAfterFirst);
  });
});
