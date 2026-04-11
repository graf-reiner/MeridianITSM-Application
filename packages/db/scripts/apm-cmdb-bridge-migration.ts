/**
 * APM ↔ CMDB Bridge Backfill
 *
 * One-shot data migration that creates a primary CmdbConfigurationItem
 * (class = `application_instance`) for every existing Application that
 * lacks one, and wires `Application.primaryCiId` to point at it.
 *
 * Reconciliation rules:
 *  1. If a CmdbCiApplication extension row already references this
 *     Application via `applicationId`, reuse that CI — no new row
 *     created. This handles tenants that were already manually linking
 *     applications to CIs before the bridge feature shipped.
 *  2. Otherwise, create a new CI + extension pair under the
 *     `application_instance` class. Default environment = `prod`.
 *
 * Per-tenant: pre-fetches the application_instance class id and the
 * production environment id once, allocates ciNumbers atomically with
 * the same advisory-lock pattern as cmdb.service.ts createCI.
 *
 * Tenant isolation: all queries scoped by `tenantId` from the outer
 * loop. New rows inherit the same tenantId.
 *
 * Run:        pnpm --filter @meridian/db tsx scripts/apm-cmdb-bridge-migration.ts
 * Dry-run:    DRY_RUN=1 pnpm --filter @meridian/db tsx scripts/apm-cmdb-bridge-migration.ts
 *
 * Idempotent — safe to re-run. Applications that already have
 * `primaryCiId` set are skipped.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

interface TenantSummary {
  tenantId: string;
  slug: string;
  reconciled: number;
  created: number;
  skippedNoSeed: number;
  skippedAlreadyLinked: number;
}

async function processTenant(tenantId: string, slug: string): Promise<TenantSummary> {
  const summary: TenantSummary = {
    tenantId,
    slug,
    reconciled: 0,
    created: 0,
    skippedNoSeed: 0,
    skippedAlreadyLinked: 0,
  };

  // Pre-fetch CMDB seed data once per tenant
  const ciClass = await prisma.cmdbCiClass.findFirst({
    where: { tenantId, classKey: 'application_instance' },
    select: { id: true },
  });
  if (!ciClass) {
    console.log(`[${slug}] missing 'application_instance' CMDB class — skipping all apps`);
    summary.skippedNoSeed = await prisma.application.count({
      where: { tenantId, primaryCiId: null },
    });
    return summary;
  }

  const prodEnv = await prisma.cmdbEnvironment.findFirst({
    where: { tenantId, envKey: 'prod' },
    select: { id: true },
  });

  const apps = await prisma.application.findMany({
    where: { tenantId, primaryCiId: null },
    select: { id: true, name: true },
  });

  if (apps.length === 0) {
    console.log(`[${slug}] no Applications need backfill`);
    return summary;
  }

  console.log(`[${slug}] backfilling ${apps.length} Application(s)`);

  for (const app of apps) {
    // Reconcile: any pre-existing CmdbCiApplication.applicationId back-ref?
    const existing = await prisma.cmdbCiApplication.findFirst({
      where: { tenantId, applicationId: app.id },
      select: { ciId: true },
    });

    if (existing) {
      if (DRY_RUN) {
        console.log(`[${slug}]   ${app.name} → DRY-RUN reconcile to existing CI ${existing.ciId}`);
      } else {
        await prisma.application.update({
          where: { id: app.id },
          data: { primaryCiId: existing.ciId },
        });
        console.log(`[${slug}]   ${app.name} → reconciled to existing CI ${existing.ciId}`);
      }
      summary.reconciled += 1;
      continue;
    }

    // Create a new CI + extension pair
    if (DRY_RUN) {
      console.log(`[${slug}]   ${app.name} → DRY-RUN create new CI`);
      summary.created += 1;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Allocate ciNumber under the same advisory lock pattern as createCI
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_ci_seq'))`;
        const result = await tx.$queryRaw<[{ next: bigint }]>`
          SELECT COALESCE(MAX("ciNumber"), 0) + 1 AS next
          FROM cmdb_configuration_items
          WHERE "tenantId" = ${tenantId}::uuid
        `;
        const ciNumber = Number(result[0].next);

        const ci = await tx.cmdbConfigurationItem.create({
          data: {
            tenantId,
            ciNumber,
            name: app.name,
            type: 'SOFTWARE',
            status: 'ACTIVE',
            environment: 'PRODUCTION',
            classId: ciClass.id,
            environmentId: prodEnv?.id ?? null,
            sourceSystem: 'apm-bridge-backfill',
            firstDiscoveredAt: new Date(),
          },
        });

        await tx.cmdbCiApplication.create({
          data: {
            ciId: ci.id,
            tenantId,
            applicationId: app.id,
          },
        });

        await tx.application.update({
          where: { id: app.id },
          data: { primaryCiId: ci.id },
        });

        await tx.applicationActivity.create({
          data: {
            tenantId,
            applicationId: app.id,
            activityType: 'PRIMARY_CI_CREATED',
            metadata: { ciId: ci.id, ciNumber, source: 'backfill' },
          },
        });

        console.log(`[${slug}]   ${app.name} → created CI ${ci.id} (CI-${ciNumber})`);
      });
      summary.created += 1;
    } catch (err) {
      console.error(`[${slug}]   ${app.name} → ERROR:`, err);
    }
  }

  return summary;
}

async function main() {
  console.log('────────────────────────────────────────────────────────');
  console.log(' APM ↔ CMDB Bridge Backfill');
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  console.log('────────────────────────────────────────────────────────');

  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, status: true },
  });

  console.log(`Found ${tenants.length} tenant(s)`);

  const summaries: TenantSummary[] = [];
  for (const tenant of tenants) {
    if (tenant.status !== 'ACTIVE') {
      console.log(`[${tenant.slug}] skipped (status=${tenant.status})`);
      continue;
    }
    const summary = await processTenant(tenant.id, tenant.slug);
    summaries.push(summary);
  }

  console.log('────────────────────────────────────────────────────────');
  console.log(' Summary');
  console.log('────────────────────────────────────────────────────────');
  let totalReconciled = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  for (const s of summaries) {
    if (s.reconciled === 0 && s.created === 0 && s.skippedNoSeed === 0) continue;
    console.log(
      `  ${s.slug.padEnd(20)} reconciled=${s.reconciled}, created=${s.created}, skipped(no-seed)=${s.skippedNoSeed}`,
    );
    totalReconciled += s.reconciled;
    totalCreated += s.created;
    totalSkipped += s.skippedNoSeed;
  }
  console.log('────────────────────────────────────────────────────────');
  console.log(
    `  TOTAL  reconciled=${totalReconciled}, created=${totalCreated}, skipped(no-seed)=${totalSkipped}`,
  );
  if (DRY_RUN) {
    console.log('  DRY-RUN — no changes written');
  }
  console.log('────────────────────────────────────────────────────────');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
