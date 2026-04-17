/**
 * Phase 7 Verification Script — per-tenant null-FK report + unique-index introspection
 *
 * Exits 0 when all tenants have no null FKs on cmdb_configuration_items and
 * cmdb_relationships. Exits 1 on any null FK. Unique-index rewrite (Wave 5)
 * is reported as PENDING (not a hard fail) so this script can be wired into
 * wave-merge gates starting at Wave 0.
 *
 * Run: pnpm tsx packages/db/scripts/phase7-verify.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('phase7-verify: per-tenant null-FK report\n');

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let totalNullCount = 0;
  let pendingIndexRewrite = false;

  for (const tenant of tenants) {
    const result = await prisma.$queryRaw<Array<{
      null_class: bigint;
      null_lifecycle: bigint;
      null_op: bigint;
      null_env: bigint;
      null_rel: bigint;
    }>>`
      SELECT
        (SELECT COUNT(*) FROM cmdb_configuration_items
          WHERE "tenantId" = ${tenant.id}::uuid AND "classId" IS NULL) AS null_class,
        (SELECT COUNT(*) FROM cmdb_configuration_items
          WHERE "tenantId" = ${tenant.id}::uuid AND "lifecycleStatusId" IS NULL) AS null_lifecycle,
        (SELECT COUNT(*) FROM cmdb_configuration_items
          WHERE "tenantId" = ${tenant.id}::uuid AND "operationalStatusId" IS NULL) AS null_op,
        (SELECT COUNT(*) FROM cmdb_configuration_items
          WHERE "tenantId" = ${tenant.id}::uuid AND "environmentId" IS NULL) AS null_env,
        (SELECT COUNT(*) FROM cmdb_relationships
          WHERE "tenantId" = ${tenant.id}::uuid AND "relationshipTypeId" IS NULL) AS null_rel
    `;
    const r = result[0];
    const total =
      Number(r.null_class) +
      Number(r.null_lifecycle) +
      Number(r.null_op) +
      Number(r.null_env) +
      Number(r.null_rel);

    if (total > 0) {
      console.error(`  x ${tenant.name} (${tenant.id}): ${total} null FKs`);
      console.error(
        `     classId=${r.null_class}, lifecycleStatusId=${r.null_lifecycle}, ` +
          `operationalStatusId=${r.null_op}, environmentId=${r.null_env}, ` +
          `relationshipTypeId=${r.null_rel}`,
      );
    } else {
      console.log(`  ok ${tenant.name}: compliant`);
    }
    totalNullCount += total;
  }

  // Verify unique-index rewrite (Wave 5 deliverable)
  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
     WHERE tablename = 'cmdb_relationships'
       AND indexname LIKE '%relationshipType%'
  `;
  const hasNewIndex = indexes.some((i) => i.indexname.includes('relationshipTypeId'));
  if (!hasNewIndex) {
    console.warn(
      `  ! cmdb_relationships unique index not yet rewritten to use relationshipTypeId (Wave 5 deliverable)`,
    );
    pendingIndexRewrite = true;
  } else {
    console.log(`  ok cmdb_relationships unique index uses relationshipTypeId`);
  }

  if (totalNullCount > 0) {
    console.error(`\nx Verification FAILED: ${totalNullCount} null-FK rows`);
    process.exit(1);
  }
  if (pendingIndexRewrite) {
    console.log(`\n(Index rewrite still pending — that's expected before Wave 5)`);
  }
  console.log(`\nok Verification passed (${tenants.length} tenants)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().then(() => pool.end()));
