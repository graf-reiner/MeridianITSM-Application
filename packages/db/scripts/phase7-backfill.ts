/**
 * Phase 7 per-tenant FK backfill.
 *
 * Promotes every existing CmdbConfigurationItem to complete FK state
 * (classId, lifecycleStatusId, operationalStatusId, environmentId) and every
 * CmdbRelationship to a complete FK state (relationshipTypeId). Idempotent:
 * re-running on an already-migrated DB produces zero writes because every
 * UPDATE is gated on the FK being null.
 *
 * Usage:
 *   pnpm tsx packages/db/scripts/phase7-backfill.ts              LIVE
 *   pnpm tsx packages/db/scripts/phase7-backfill.ts --dry-run    no writes
 *
 * Multi-tenancy: every operation runs per-tenant inside the for-loop.
 * Every Prisma query includes `tenantId` in the WHERE clause. Never batches
 * across tenants.
 *
 * Pre-flight duplicate detection (RESEARCH.md Pitfall 4): if a tenant has both
 * HOSTS and VIRTUALIZES relationships on the same (sourceId, targetId) pair,
 * both collapse to the `hosted_on` key and would collide on the new unique
 * index. The detector reports and ABORTS the per-tenant backfill so the
 * operator can resolve before re-running.
 *
 * A1 (RESEARCH.md): operationalStatusId defaults to 'unknown' for every
 * existing CI. Reconciliation worker sets 'online' on next heartbeat.
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

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Mapping Tables ──────────────────────────────────────────────────────────
// Values aligned with the seeded reference vocabulary in
// packages/db/src/seeds/cmdb-reference.ts (15 CI classes, 6 envs, 13 rel types)
// and with packages/db/scripts/cmdb-migration.ts (legacy migration precedent).

export const TYPE_TO_CLASS: Record<string, string> = {
  SERVER: 'server',
  WORKSTATION: 'server',          // matches cmdb-migration.ts:24; 'endpoint' is NOT a seeded classKey
  NETWORK_DEVICE: 'network_device',
  SOFTWARE: 'application',
  SERVICE: 'technical_service',   // matches cmdb-migration.ts:27; 'application_service' is NOT a seeded classKey
  DATABASE: 'database',
  VIRTUAL_MACHINE: 'virtual_machine',
  CONTAINER: 'application_instance',
  OTHER: 'generic',
};

export const STATUS_TO_LIFECYCLE: Record<string, string> = {
  ACTIVE: 'in_service',
  INACTIVE: 'in_service',
  DECOMMISSIONED: 'retired',
  PLANNED: 'planned',
};

// Phase 7 NEW (RESEARCH.md A1): legacy CmdbCiStatus carries no operational
// signal. Default ALL existing CIs to 'unknown'; reconciliation worker will
// set 'online' on next heartbeat.
export const STATUS_TO_OPERATIONAL: Record<string, string> = {
  ACTIVE: 'unknown',
  INACTIVE: 'unknown',
  DECOMMISSIONED: 'unknown',
  PLANNED: 'unknown',
};

export const ENV_TO_KEY: Record<string, string> = {
  PRODUCTION: 'prod',
  STAGING: 'test',        // seeded envKey is 'test' (not 'staging'); matches cmdb-migration.ts:43
  DEV: 'dev',
  DR: 'dr',
};

export const REL_TYPE_TO_KEY: Record<string, string> = {
  DEPENDS_ON: 'depends_on',
  HOSTS: 'hosted_on',
  VIRTUALIZES: 'hosted_on',    // intentionally collapses with HOSTS — duplicate-detect catches collisions
  CONNECTS_TO: 'connected_to',
  MEMBER_OF: 'member_of',
  REPLICATES_TO: 'replicated_to',
  BACKED_UP_BY: 'backed_up_by',
  USES: 'uses',
  SUPPORTS: 'supports',
  MANAGED_BY: 'managed_by',
  OWNED_BY: 'owned_by',
  CONTAINS: 'contains',
  INSTALLED_ON: 'installed_on',
};

// ─── Lookup-map builder ──────────────────────────────────────────────────────

async function buildLookupMaps(tenantId: string) {
  const [classes, statuses, envs, relTypes] = await Promise.all([
    prisma.cmdbCiClass.findMany({
      where: { tenantId },
      select: { id: true, classKey: true },
    }),
    prisma.cmdbStatus.findMany({
      where: { tenantId },
      select: { id: true, statusType: true, statusKey: true },
    }),
    prisma.cmdbEnvironment.findMany({
      where: { tenantId },
      select: { id: true, envKey: true },
    }),
    prisma.cmdbRelationshipTypeRef.findMany({
      where: { tenantId },
      select: { id: true, relationshipKey: true },
    }),
  ]);

  return {
    classMap: new Map<string, string>(classes.map((c) => [c.classKey, c.id] as [string, string])),
    lifecycleStatusMap: new Map<string, string>(
      statuses
        .filter((s) => s.statusType === 'lifecycle')
        .map((s) => [s.statusKey, s.id] as [string, string]),
    ),
    operationalStatusMap: new Map<string, string>(
      statuses
        .filter((s) => s.statusType === 'operational')
        .map((s) => [s.statusKey, s.id] as [string, string]),
    ),
    envMap: new Map<string, string>(envs.map((e) => [e.envKey, e.id] as [string, string])),
    relTypeMap: new Map<string, string>(
      relTypes.map((r) => [r.relationshipKey, r.id] as [string, string]),
    ),
  };
}

// ─── Pitfall 4: Pre-flight relationship duplicate detection ──────────────────
// Scans per-tenant relationships that still have a null relationshipTypeId.
// Groups by (sourceId, targetId, mappedKey). Any group with more than one row
// will collide on the new (sourceId, targetId, relationshipTypeId) unique
// index that Plan 07-06 installs, so we abort the backfill for that tenant
// and report the offending pairs.

type RelDupe = {
  sourceId: string;
  targetId: string;
  mappedKey: string;
  legacyTypes: string[];
};

async function detectRelationshipDuplicates(tenantId: string): Promise<RelDupe[]> {
  // Raw SQL: Prisma client generated from the new schema considers
  // `relationshipTypeId` non-nullable, so typed `findMany` with
  // `relationshipTypeId: null` is rejected client-side. Backfill must read
  // legacy null rows pre-migration; raw SQL bypasses the typed validation.
  const rels = await prisma.$queryRaw<
    Array<{ sourceId: string; targetId: string; relationshipType: string | null }>
  >`
    SELECT "sourceId", "targetId", "relationshipType"
    FROM "cmdb_relationships"
    WHERE "tenantId" = ${tenantId}
      AND "relationshipTypeId" IS NULL
  `;

  const seen = new Map<string, { mappedKey: string; legacyTypes: string[] }>();
  const dupes: RelDupe[] = [];

  for (const rel of rels) {
    if (rel.relationshipType == null) continue;
    const mappedKey = REL_TYPE_TO_KEY[rel.relationshipType] ?? 'depends_on';
    const compoundKey = `${rel.sourceId}::${rel.targetId}::${mappedKey}`;
    const prior = seen.get(compoundKey);
    if (prior) {
      prior.legacyTypes.push(rel.relationshipType);
      // Only push to dupes once per compoundKey (on first collision)
      if (prior.legacyTypes.length === 2) {
        dupes.push({
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          mappedKey,
          legacyTypes: prior.legacyTypes,
        });
      }
    } else {
      seen.set(compoundKey, { mappedKey, legacyTypes: [rel.relationshipType] });
    }
  }

  return dupes;
}

// ─── Per-tenant migration ────────────────────────────────────────────────────

type TenantResult = { ciUpdated: number; relUpdated: number; dupeCount: number; seeded: boolean };

async function migrateTenant(tenantId: string, tenantName: string): Promise<TenantResult> {
  console.log(`\n=== Tenant: ${tenantName} (${tenantId}) ===`);

  // Step 1: Ensure reference data exists. If a tenant has zero CI classes,
  //         seed inside a transaction via the reusable helper.
  const classCount = await prisma.cmdbCiClass.count({ where: { tenantId } });
  let seeded = false;
  if (classCount === 0) {
    console.log(`  ! No reference data found for tenant — seeding now (15+11+6+13 rows)`);
    if (!DRY_RUN) {
      await prisma.$transaction(async (tx) => {
        await seedCmdbReferenceData(tx, tenantId);
      });
      seeded = true;
    } else {
      console.log(`  (dry-run: would call seedCmdbReferenceData)`);
    }
  } else {
    console.log(`  ok Reference data already present (${classCount} CI classes)`);
  }

  // Step 2: Build lookup maps (post-seed).
  const maps = await buildLookupMaps(tenantId);

  // Step 3: Pre-flight duplicate detection (Pitfall 4).
  const dupes = await detectRelationshipDuplicates(tenantId);
  if (dupes.length > 0) {
    console.error(
      `  x Found ${dupes.length} relationship duplicates that would collide post-FK migration:`,
    );
    for (const d of dupes) {
      console.error(
        `     ${d.sourceId} -> ${d.targetId} (mappedKey: ${d.mappedKey}, legacyTypes: ${d.legacyTypes.join(', ')})`,
      );
    }
    console.error(
      `  x ABORTING tenant ${tenantName} — operator must resolve duplicates before re-run`,
    );
    return { ciUpdated: 0, relUpdated: 0, dupeCount: dupes.length, seeded };
  }

  // Step 4: Backfill CIs. Idempotent guard via OR: [{ classId: null }, ...].
  // Raw SQL: same chicken-and-egg as detectRelationshipDuplicates above —
  // the regenerated Prisma client treats classId/lifecycleStatusId/etc. as
  // non-null (per new schema) and rejects null filters and null reads.
  const ciCandidates = await prisma.$queryRaw<
    Array<{
      id: string;
      type: string | null;
      status: string | null;
      environment: string | null;
      classId: string | null;
      lifecycleStatusId: string | null;
      operationalStatusId: string | null;
      environmentId: string | null;
    }>
  >`
    SELECT id, type, status, environment,
           "classId", "lifecycleStatusId", "operationalStatusId", "environmentId"
    FROM "cmdb_configuration_items"
    WHERE "tenantId" = ${tenantId}
      AND ("classId" IS NULL
           OR "lifecycleStatusId" IS NULL
           OR "operationalStatusId" IS NULL
           OR "environmentId" IS NULL)
  `;

  let ciUpdated = 0;
  for (const ci of ciCandidates) {
    const data: Record<string, string> = {};

    if (!ci.classId && ci.type) {
      const classKey = TYPE_TO_CLASS[ci.type] ?? 'generic';
      const id = maps.classMap.get(classKey);
      if (id) data.classId = id;
    }
    if (!ci.lifecycleStatusId && ci.status) {
      const lcKey = STATUS_TO_LIFECYCLE[ci.status] ?? 'in_service';
      const id = maps.lifecycleStatusMap.get(lcKey);
      if (id) data.lifecycleStatusId = id;
    }
    if (!ci.operationalStatusId) {
      // A1: default ALL legacy CIs to 'unknown' operational; reconciliation
      //     worker sets 'online' on next heartbeat.
      const opKey = ci.status ? (STATUS_TO_OPERATIONAL[ci.status] ?? 'unknown') : 'unknown';
      const id = maps.operationalStatusMap.get(opKey);
      if (id) data.operationalStatusId = id;
    }
    if (!ci.environmentId && ci.environment) {
      const envKey = ENV_TO_KEY[ci.environment] ?? 'prod';
      const id = maps.envMap.get(envKey);
      if (id) data.environmentId = id;
    }

    if (Object.keys(data).length > 0) {
      if (!DRY_RUN) {
        await prisma.cmdbConfigurationItem.update({
          where: { id: ci.id },
          data,
        });
      }
      ciUpdated += 1;
    }
  }
  console.log(`  ok CIs backfilled: ${ciUpdated} (of ${ciCandidates.length} candidates)`);
  if (DRY_RUN) console.log(`     (dry-run: no writes)`);

  // Step 5: Backfill relationships. Raw SQL for the same reason as above —
  // typed Prisma rejects null filter on now-non-null relationshipTypeId.
  const relCandidates = await prisma.$queryRaw<
    Array<{ id: string; relationshipType: string | null }>
  >`
    SELECT id, "relationshipType"
    FROM "cmdb_relationships"
    WHERE "tenantId" = ${tenantId}
      AND "relationshipTypeId" IS NULL
  `;

  let relUpdated = 0;
  for (const rel of relCandidates) {
    if (rel.relationshipType == null) continue;
    const mappedKey = REL_TYPE_TO_KEY[rel.relationshipType] ?? 'depends_on';
    const id = maps.relTypeMap.get(mappedKey);
    if (id) {
      if (!DRY_RUN) {
        await prisma.cmdbRelationship.update({
          where: { id: rel.id },
          data: { relationshipTypeId: id },
        });
      }
      relUpdated += 1;
    }
  }
  console.log(
    `  ok Relationships backfilled: ${relUpdated} (of ${relCandidates.length} candidates)`,
  );
  if (DRY_RUN) console.log(`     (dry-run: no writes)`);

  return { ciUpdated, relUpdated, dupeCount: 0, seeded };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Phase 7 backfill — ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`Processing ${tenants.length} tenant(s)\n`);

  let totalCiUpdated = 0;
  let totalRelUpdated = 0;
  let totalDupes = 0;
  let totalSeeded = 0;

  for (const tenant of tenants) {
    const r = await migrateTenant(tenant.id, tenant.name);
    totalCiUpdated += r.ciUpdated;
    totalRelUpdated += r.relUpdated;
    totalDupes += r.dupeCount;
    if (r.seeded) totalSeeded += 1;
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Tenants processed:         ${tenants.length}`);
  console.log(`  Tenants seeded (ref data): ${totalSeeded}`);
  console.log(`  CIs backfilled:            ${totalCiUpdated}`);
  console.log(`  Relationships backfilled:  ${totalRelUpdated}`);
  console.log(`  Duplicate pairs blocking:  ${totalDupes}`);

  if (totalDupes > 0) {
    console.error(
      `\nx One or more tenants had relationship duplicates — operator action required before NOT NULL migration.`,
    );
    process.exit(2);
  }
  console.log(`\nok Backfill complete${DRY_RUN ? ' (dry-run)' : ''}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().then(() => pool.end()));
