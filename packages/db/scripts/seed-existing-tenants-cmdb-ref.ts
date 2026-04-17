/**
 * One-shot script to seed CMDB reference data for any existing tenant that is
 * missing it. Closes the v1.0-launch gap: tenants created before Plan 07-02's
 * signup/provisioning hook landed do NOT have cmdb_ci_classes / cmdb_statuses /
 * cmdb_environments / cmdb_relationship_types rows, which means they cannot
 * create CIs once Plan 07-06 flips the FK columns to NOT NULL.
 *
 * Usage:
 *   pnpm tsx packages/db/scripts/seed-existing-tenants-cmdb-ref.ts
 *
 * Behavior: iterates every tenant, checks whether cmdbCiClass count is 0, and
 * if so calls seedCmdbReferenceData(tx, tenantId) inside a $transaction.
 * Idempotent: re-running is a no-op (every tenant's count > 0 on second run).
 *
 * NOTE: phase7-backfill.ts ALSO performs this seed-if-needed step per tenant.
 * This standalone script exists because (a) the operational story is clearer
 * — a tenant complaining "I can't create CIs" can be unblocked with a single
 * script run — and (b) it can run ahead of the full backfill to reduce the
 * blast radius of the NOT NULL migration.
 *
 * Multi-tenancy: per-tenant loop; every query `where: { tenantId }`-scoped.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { seedCmdbReferenceData } from '../src/seeds/cmdb-reference.js';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(
    'Seeding CMDB reference data for any tenants missing it (Phase 7 v1.0-launch gap)\n',
  );
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
  });

  let seededCount = 0;
  let alreadyCount = 0;

  for (const tenant of tenants) {
    const classCount = await prisma.cmdbCiClass.count({ where: { tenantId: tenant.id } });
    if (classCount > 0) {
      console.log(`  ok ${tenant.name} (${tenant.slug}): already seeded (${classCount} classes)`);
      alreadyCount += 1;
      continue;
    }
    console.log(`  + ${tenant.name} (${tenant.slug}): seeding 15+11+6+13 rows...`);
    await prisma.$transaction(async (tx) => {
      await seedCmdbReferenceData(tx, tenant.id);
    });
    seededCount += 1;
  }

  console.log(
    `\nDone. Seeded ${seededCount} tenants; ${alreadyCount} already had ref data.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().then(() => pool.end()));
