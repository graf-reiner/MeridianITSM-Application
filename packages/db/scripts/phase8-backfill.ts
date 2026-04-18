/**
 * Phase 8 per-tenant Asset → CmdbCiServer + CmdbSoftwareInstalled backfill.
 *
 * WAVE 0: SKELETON ONLY. This file ships a discoverable skeleton that compiles,
 * runs `--dry-run` cleanly, and exits zero with a `[SKELETON]` log line per
 * tenant. The full per-tenant CI find/create + extension upsert + software
 * upsert + CI-wins conflict logging body lands in Wave 2 (plan 08-03).
 *
 * T-8-01-01 mitigation: this skeleton performs ZERO INSERT/UPDATE/DELETE
 * statements. The Wave 2 implementation will add writes behind the --dry-run
 * guard per phase7-backfill.ts convention.
 *
 * Usage:
 *   pnpm tsx packages/db/scripts/phase8-backfill.ts              [WILL BE LIVE IN WAVE 2]
 *   pnpm tsx packages/db/scripts/phase8-backfill.ts --dry-run    no writes
 *
 * Multi-tenancy: every operation runs per-tenant inside the for-loop; every
 * Prisma query in the Wave 2 body must include `tenantId` in its WHERE clause.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

type TenantResult = { ciUpserted: number; softwareUpserted: number; conflicts: number };

async function migrateTenant(tenantId: string, tenantName: string): Promise<TenantResult> {
  console.log(
    `=== Tenant: ${tenantName} (${tenantId}) === [SKELETON — implementation in Wave 2]`,
  );
  // Wave 2 body goes here — per-tenant Asset scan with raw SQL reads (chicken-
  // and-egg avoidance per RESEARCH Pattern 1), CmdbCiServer upsert, software
  // list parse + CmdbSoftwareInstalled upsert, CI-wins conflict logging via
  // cmdb_migration_audit.createMany({ data: auditRows, skipDuplicates: true }).
  return { ciUpserted: 0, softwareUpserted: 0, conflicts: 0 };
}

async function main() {
  console.log(
    `Phase 8 backfill — ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE'} — WAVE 0 SKELETON`,
  );
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  console.log(`Processing ${tenants.length} tenant(s)\n`);

  let totalCiUpserted = 0;
  let totalSoftwareUpserted = 0;
  let totalConflicts = 0;

  for (const tenant of tenants) {
    const r = await migrateTenant(tenant.id, tenant.name);
    totalCiUpserted += r.ciUpserted;
    totalSoftwareUpserted += r.softwareUpserted;
    totalConflicts += r.conflicts;
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Tenants processed:             ${tenants.length}`);
  console.log(`  CmdbCiServer rows upserted:    ${totalCiUpserted}`);
  console.log(`  Software rows upserted:        ${totalSoftwareUpserted}`);
  console.log(`  CI-wins conflicts logged:      ${totalConflicts}`);
  console.log(`\nok Backfill skeleton complete${DRY_RUN ? ' (dry-run)' : ''}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().then(() => pool.end()));
