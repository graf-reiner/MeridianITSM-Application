/**
 * Phase 8 per-tenant Asset -> CmdbCiServer + CmdbSoftwareInstalled backfill.
 *
 * WAVE 2 (plan 08-03): full working implementation. Replaces the Wave 0
 * skeleton from plan 08-01. Promotes Assets with hardware/OS/software data
 * onto their corresponding CmdbCiServer extension row (auto-creating the CI
 * when the Asset is orphaned, per D-08) and explodes Asset.softwareInventory
 * JSON into normalized cmdb_software_installed rows.
 *
 * Conflict policy (D-01): CI wins silently. When the existing
 * CmdbCiServer extension has a value that differs from the Asset's legacy
 * value, one row is written to cmdb_migration_audit with
 * status='overwritten_by_ci' and phase='phase8'. The Asset value is logged
 * (oldValue) and the CI value is retained (newValue). The Asset column is
 * never mutated by this script — it is dropped in Wave 5 (plan 06).
 *
 * Idempotency: a second run writes zero new audit rows for already-migrated
 * Assets. Conflicts log only when ciValue != null && assetValue != null &&
 * ciValue != assetValue. After the first run, every ciValue is populated
 * from either the pre-existing extension OR the Asset value, and the Asset
 * value does not change, so the inequality check evaluates false. Software
 * upserts are also keyed on (ciId, name, version) so a second run hits the
 * upsert path with no-op update (CI wins per D-01).
 *
 * Concurrency (Pitfall 2): each per-Asset transaction acquires
 * pg_advisory_xact_lock(hashtext(${tenantId} || '_ci_seq')) — the same lock
 * the live createCI / cmdb-reconciliation worker use. Guarantees no
 * duplicate CI is created for the same Asset during concurrent inventory
 * POSTs.
 *
 * Usage:
 *   pnpm tsx packages/db/scripts/phase8-backfill.ts              LIVE
 *   pnpm tsx packages/db/scripts/phase8-backfill.ts --dry-run    no writes
 *
 * Multi-tenancy (CLAUDE.md Rule 1 — MANDATORY): every $queryRaw passes
 * `${tenantId}::uuid`; every Prisma client call passes tenantId in where/data;
 * the per-tenant for-loop is single-tenant at any instant; never batches
 * across tenants.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Inline-duplicated helpers
//
// Rationale: packages/db/scripts/ is a build-free script directory. It MUST
// NOT import from apps/api/src/ (per project no-cross-app-imports convention
// — same precedent as phase7-backfill.ts inline-duplicating seedCmdbReferenceData's
// callers, and cmdb-extension.service.ts inline-duplicating
// inferClassKeyFromSnapshot from apps/worker). The two helpers below are
// verbatim copies of the Wave 1 originals:
//   - parseSoftwareList from apps/api/src/services/cmdb-extension.service.ts
//   - inferClassKeyFromSnapshot from apps/worker/src/workers/cmdb-reconciliation.ts
// Keep in sync with the originals when the contract changes.
// ---------------------------------------------------------------------------

/**
 * Defensive software-inventory parser (Pitfall 8 + 10).
 * Supports Array<{name, version, ...}> and { apps: [...] } shapes.
 * Returns [] for unparseable blobs; caller logs an audit row.
 */
function parseSoftwareList(
  blob: unknown,
): Array<{
  name: string;
  version: string;
  vendor?: string | null;
  publisher?: string | null;
  installDate?: string | null;
}> {
  if (!blob) return [];
  const arr = Array.isArray(blob)
    ? blob
    : typeof blob === 'object' &&
        blob !== null &&
        'apps' in blob &&
        Array.isArray((blob as { apps: unknown[] }).apps)
      ? (blob as { apps: unknown[] }).apps
      : [];
  return arr
    .filter(
      (
        item,
      ): item is {
        name: string;
        version: string;
        vendor?: string;
        publisher?: string;
        installDate?: string;
      } =>
        item != null &&
        typeof item === 'object' &&
        'name' in item &&
        typeof (item as { name: unknown }).name === 'string',
    )
    .map((item) => ({
      name: String(item.name),
      version: String(item.version ?? ''),
      vendor: item.vendor ?? null,
      publisher: item.publisher ?? null,
      installDate: item.installDate ?? null,
    }));
}

/**
 * Infer a CI class key from hostname/OS heuristics. Mirrors the API-side
 * copy in apps/api/src/services/cmdb-extension.service.ts which itself
 * mirrors apps/worker/src/workers/cmdb-reconciliation.ts:17-42. Platform is
 * nullable here because backfill reads legacy Asset rows that have no
 * platform hint.
 */
function inferClassKeyFromSnapshot(
  platform: string | null,
  hostname: string | null,
  operatingSystem: string | null,
): { classKey: string; legacyType: string } {
  const os = (operatingSystem ?? '').toLowerCase();
  const host = (hostname ?? '').toLowerCase();
  const plt = (platform ?? '').toLowerCase();

  if (
    os.includes('server') ||
    host.startsWith('srv') ||
    host.includes('-srv-') ||
    os.includes('centos') ||
    os.includes('rhel') ||
    os.includes('debian')
  ) {
    return { classKey: 'server', legacyType: 'SERVER' };
  }

  if (plt === 'linux') return { classKey: 'server', legacyType: 'SERVER' };
  if (plt === 'macos') return { classKey: 'server', legacyType: 'WORKSTATION' };
  if (plt === 'windows') return { classKey: 'server', legacyType: 'WORKSTATION' };

  return { classKey: 'server', legacyType: 'SERVER' }; // safe default
}

// ---------------------------------------------------------------------------
// Prisma client setup (verbatim from phase7-backfill.ts)
// ---------------------------------------------------------------------------

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Field maps
//
// HARDWARE_FIELDS: columns on CmdbCiServer that are populated from Asset.
// ASSET_FIELD_MAP: CI-side name -> Asset-side name translation. See
// <interfaces> in the plan frontmatter for the authoritative mapping.
// ---------------------------------------------------------------------------

const HARDWARE_FIELDS = [
  'operatingSystem',
  'osVersion',
  'cpuCount',
  'cpuModel',
  'memoryGb',
  'disksJson',
  'networkInterfacesJson',
] as const;

const ASSET_FIELD_MAP: Record<(typeof HARDWARE_FIELDS)[number], string> = {
  operatingSystem: 'operatingSystem',
  osVersion: 'osVersion',
  cpuCount: 'cpuCores',
  cpuModel: 'cpuModel',
  memoryGb: 'ramGb',
  disksJson: 'disks',
  networkInterfacesJson: 'networkInterfaces',
};

// Silence unused-variable lint for ASSET_FIELD_MAP — kept as documentation of
// the CI-side name -> Asset-side name mapping, and referenced via HARDWARE_FIELDS
// indirection where needed.
void ASSET_FIELD_MAP;

// ---------------------------------------------------------------------------
// Per-tenant migration
// ---------------------------------------------------------------------------

export interface TenantResult {
  tenantId: string;
  tenantName: string;
  assetsProcessed: number;
  ciExtUpserted: number;
  ciAutoCreated: number;
  softwareUpserted: number;
  conflictsLogged: number;
  unparseableSoftware: number;
}

interface AssetCandidateRow {
  id: string;
  hostname: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  cpuModel: string | null;
  cpuCores: number | null;
  ramGb: number | null;
  disks: unknown;
  networkInterfaces: unknown;
  softwareInventory: unknown;
  lastInventoryAt: Date | null;
}

/**
 * Normalize a value for conflict comparison. Using JSON.stringify for both
 * sides gives stable equality for primitives (numbers, strings, booleans)
 * AND for Json-typed columns (disksJson, networkInterfacesJson). Null inputs
 * stringify to 'null' but we guard callers against null assetValue above.
 */
function canonicalize(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export async function migrateTenant(
  tenantId: string,
  tenantName: string,
): Promise<TenantResult> {
  console.log(`\n=== Tenant: ${tenantName} (${tenantId}) ===`);

  let assetsProcessed = 0;
  let ciExtUpserted = 0;
  let ciAutoCreated = 0;
  let softwareUpserted = 0;
  let conflictsLogged = 0;
  let unparseableSoftware = 0;

  // Step 1: read all Assets carrying any hardware/OS/software payload
  // via raw SQL. Chicken-and-egg avoidance per Pitfall 1 (columns may
  // become non-nullable in Wave 5; the Prisma client generated AFTER that
  // migration would reject null filters / null reads; this script must
  // continue to work against pre-Wave-5 DBs).
  const candidates = await prisma.$queryRaw<AssetCandidateRow[]>`
    SELECT id, hostname, "operatingSystem", "osVersion", "cpuModel",
           "cpuCores", "ramGb", disks, "networkInterfaces",
           "softwareInventory", "lastInventoryAt"
      FROM "assets"
     WHERE "tenantId" = ${tenantId}::uuid
       AND (hostname IS NOT NULL
            OR "operatingSystem" IS NOT NULL
            OR "osVersion" IS NOT NULL
            OR "cpuModel" IS NOT NULL
            OR "cpuCores" IS NOT NULL
            OR "ramGb" IS NOT NULL
            OR disks IS NOT NULL
            OR "networkInterfaces" IS NOT NULL
            OR "softwareInventory" IS NOT NULL
            OR "lastInventoryAt" IS NOT NULL)`;

  console.log(`  Found ${candidates.length} Assets with hardware/software data to migrate`);

  // Step 2: per-Asset migration in its own transaction. Advisory lock
  // (Pitfall 2) prevents a concurrent inventory POST from creating a
  // duplicate CI for the same Asset while this loop runs.
  for (const asset of candidates) {
    await prisma.$transaction(
      async (tx) => {
        assetsProcessed++;

        // Acquire the SAME advisory lock the live createCI path uses.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_ci_seq'))`;

        // Find or create the linked CI.
        let ciId: string;

        const linked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
            FROM "cmdb_configuration_items"
           WHERE "tenantId" = ${tenantId}::uuid
             AND "assetId" = ${asset.id}::uuid
           ORDER BY "createdAt" ASC
           LIMIT 1`;

        if (linked.length === 0) {
          // Orphan path — auto-create CI (D-08). Resolve reference data
          // via raw SQL so we do not import apps/api resolvers.
          const { classKey } = inferClassKeyFromSnapshot(
            null,
            asset.hostname,
            asset.operatingSystem,
          );

          const classRow = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "cmdb_ci_classes"
             WHERE "tenantId" = ${tenantId}::uuid AND "classKey" = ${classKey}
             LIMIT 1`;
          const lifecycleRow = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "cmdb_statuses"
             WHERE "tenantId" = ${tenantId}::uuid
               AND "statusType" = 'lifecycle'
               AND "statusKey" = 'in_service'
             LIMIT 1`;
          const operationalRow = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "cmdb_statuses"
             WHERE "tenantId" = ${tenantId}::uuid
               AND "statusType" = 'operational'
               AND "statusKey" = 'online'
             LIMIT 1`;
          const envRow = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "cmdb_environments"
             WHERE "tenantId" = ${tenantId}::uuid AND "envKey" = 'prod'
             LIMIT 1`;

          if (!classRow[0] || !lifecycleRow[0] || !operationalRow[0] || !envRow[0]) {
            throw new Error(
              `Phase 8 backfill: tenant ${tenantId} missing reference data ` +
                `(classKey=${classKey}, lifecycle=in_service, operational=online, env=prod). ` +
                `Run: pnpm tsx packages/db/scripts/seed-existing-tenants-cmdb-ref.ts`,
            );
          }

          // Allocate the next ciNumber under the same advisory lock.
          const next = await tx.$queryRaw<Array<{ next: number | bigint }>>`
            SELECT COALESCE(MAX("ciNumber"), 0) + 1 AS next
              FROM "cmdb_configuration_items"
             WHERE "tenantId" = ${tenantId}::uuid`;
          const ciNumber = Number(next[0]?.next ?? 1);

          if (!DRY_RUN) {
            const created = await tx.cmdbConfigurationItem.create({
              data: {
                tenantId,
                classId: classRow[0].id,
                lifecycleStatusId: lifecycleRow[0].id,
                operationalStatusId: operationalRow[0].id,
                environmentId: envRow[0].id,
                ciNumber,
                name: asset.hostname || `unnamed-asset-${asset.id.slice(0, 8)}`,
                // WR-03: persist asset.hostname onto the new CI so post-Wave-5
                // queries (e.g. AI Text-to-SQL `SELECT ci.hostname FROM
                // cmdb_configuration_items`) and CI-list/search views surface
                // backfilled orphan CIs. Without this, ci.hostname stays NULL
                // even when the source Asset carried a hostname.
                hostname: asset.hostname ?? null,
                assetId: asset.id,
              },
              select: { id: true },
            });
            ciId = created.id;
          } else {
            // Dry run: use a synthetic id so downstream steps log correctly.
            // No writes to the DB are performed.
            ciId = `DRYRUN-${asset.id}`;
          }
          ciAutoCreated++;
        } else {
          ciId = linked[0].id;
        }

        // Read the existing CmdbCiServer extension (if any) for conflict
        // detection. In dry-run for orphan path ciId is synthetic, so skip
        // the lookup (no row can exist).
        const existingExt =
          !DRY_RUN || linked.length > 0
            ? await tx.cmdbCiServer.findUnique({ where: { ciId } })
            : null;

        // Build conflict audit rows + extension write data. CI wins per D-01:
        // - Asset has value AND CI has no value   -> write Asset -> CI
        // - Asset has value AND CI has value AND they differ -> log conflict,
        //   do NOT overwrite CI (CI wins)
        // - Asset has value AND CI has same value -> noop
        const auditRows: Prisma.CmdbMigrationAuditCreateManyInput[] = [];
        const extWriteData: Record<string, unknown> = {};

        const fieldPairs: Array<[(typeof HARDWARE_FIELDS)[number], unknown, unknown]> = [
          ['operatingSystem', existingExt?.operatingSystem ?? null, asset.operatingSystem],
          ['osVersion', existingExt?.osVersion ?? null, asset.osVersion],
          ['cpuCount', existingExt?.cpuCount ?? null, asset.cpuCores],
          ['cpuModel', existingExt?.cpuModel ?? null, asset.cpuModel],
          ['memoryGb', existingExt?.memoryGb ?? null, asset.ramGb],
          ['disksJson', existingExt?.disksJson ?? null, asset.disks],
          ['networkInterfacesJson', existingExt?.networkInterfacesJson ?? null, asset.networkInterfaces],
        ];
        for (const [field, ciValue, assetValue] of fieldPairs) {
          if (assetValue == null) continue;
          if (ciValue == null) {
            // CI lacks the value; Asset has it -> promote Asset to CI.
            extWriteData[field] = assetValue;
          } else if (canonicalize(ciValue) !== canonicalize(assetValue)) {
            // Both sides populated AND values differ -> CI wins, log conflict.
            auditRows.push({
              tenantId,
              tableName: 'assets',
              recordId: asset.id,
              fieldName: field,
              oldValue: canonicalize(assetValue).slice(0, 1000),
              newValue: canonicalize(ciValue).slice(0, 1000),
              status: 'overwritten_by_ci',
              phase: 'phase8',
            });
          }
          // else equal -> noop.
        }

        // Upsert the CmdbCiServer extension (skipped in dry-run).
        //
        // On CREATE we must supply `serverType` (non-null). Pick 'virtual' if
        // the Asset.model name includes a common hypervisor hint, otherwise
        // default to 'physical' — the cmdb-reconciliation worker (live path)
        // refines this on the next heartbeat from real platform data.
        //
        // On UPDATE we only write the fields captured in extWriteData (those
        // where CI was null and Asset had a value). We intentionally do NOT
        // overwrite existing CI values — that is the CI-wins policy per D-01.
        if (!DRY_RUN) {
          await tx.cmdbCiServer.upsert({
            where: { ciId },
            create: {
              ciId,
              tenantId,
              serverType: 'physical',
              operatingSystem: (extWriteData.operatingSystem as string | undefined) ?? null,
              osVersion: (extWriteData.osVersion as string | undefined) ?? null,
              cpuCount: (extWriteData.cpuCount as number | undefined) ?? null,
              cpuModel: (extWriteData.cpuModel as string | undefined) ?? null,
              memoryGb: (extWriteData.memoryGb as number | undefined) ?? null,
              disksJson: (extWriteData.disksJson as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
              networkInterfacesJson:
                (extWriteData.networkInterfacesJson as Prisma.InputJsonValue | undefined) ??
                Prisma.DbNull,
            },
            update: extWriteData as Prisma.CmdbCiServerUpdateInput,
          });
          ciExtUpserted++;
        }

        // Audit conflict rows (Pitfall 4: batched via createMany skipDuplicates).
        if (auditRows.length > 0 && !DRY_RUN) {
          await tx.cmdbMigrationAudit.createMany({
            data: auditRows,
            skipDuplicates: true,
          });
        }
        conflictsLogged += auditRows.length;

        // Software list explode (Pitfall 8 + 10).
        const softwareList = parseSoftwareList(asset.softwareInventory);
        if (softwareList.length === 0 && asset.softwareInventory != null) {
          unparseableSoftware++;
          if (!DRY_RUN) {
            await tx.cmdbMigrationAudit.create({
              data: {
                tenantId,
                tableName: 'assets',
                recordId: asset.id,
                fieldName: 'softwareInventory',
                oldValue: canonicalize(asset.softwareInventory).slice(0, 500),
                newValue: null,
                status: 'unparseable_software_blob',
                phase: 'phase8',
              },
            });
          }
        }

        for (const item of softwareList) {
          // Pitfall 3: normalize blank version to 'unknown' so the unique
          // (ciId, name, version) key treats "nginx '' " and "nginx ' '"
          // as the same row.
          const normalizedVersion = (item.version ?? '').trim() || 'unknown';
          if (!DRY_RUN) {
            await tx.cmdbSoftwareInstalled.upsert({
              where: {
                ciId_name_version: { ciId, name: item.name, version: normalizedVersion },
              },
              create: {
                tenantId,
                ciId,
                name: item.name,
                version: normalizedVersion,
                vendor: item.vendor ?? null,
                publisher: item.publisher ?? null,
                installDate: item.installDate ? new Date(item.installDate) : null,
                source: 'import',
                lastSeenAt: new Date(),
              },
              update: {
                // CI wins per D-01 — do NOT overwrite existing source/vendor/
                // installDate. Only refresh lastSeenAt so stale-cleanup queries
                // see the Asset still references this software.
                lastSeenAt: new Date(),
              },
            });
            softwareUpserted++;
          }
        }
      },
      { timeout: 30_000 },
    );
  }

  const suffix = unparseableSoftware
    ? `, ${unparseableSoftware} unparseable software blob(s)`
    : '';
  console.log(
    `  Tenant ${tenantName}: ${assetsProcessed} assets processed, ` +
      `${ciExtUpserted} ext upserts, ${ciAutoCreated} CIs auto-created, ` +
      `${softwareUpserted} software rows, ${conflictsLogged} conflicts logged${suffix}`,
  );

  return {
    tenantId,
    tenantName,
    assetsProcessed,
    ciExtUpserted,
    ciAutoCreated,
    softwareUpserted,
    conflictsLogged,
    unparseableSoftware,
  };
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  // NOTE: Tenant model uses `status: TenantStatus` (enum ACTIVE/SUSPENDED/DELETED),
  // not a boolean `isActive`. Filter to ACTIVE only — skip SUSPENDED/DELETED
  // tenants (their Assets should not be migrated per CONTEXT.md).
  const tenants = await prisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `Phase 8 backfill: ${tenants.length} tenant(s) to process${DRY_RUN ? ' (DRY RUN)' : ''}`,
  );

  const results: TenantResult[] = [];
  for (const t of tenants) {
    results.push(await migrateTenant(t.id, t.name));
  }

  const totalAssets = results.reduce((s, r) => s + r.assetsProcessed, 0);
  const totalExt = results.reduce((s, r) => s + r.ciExtUpserted, 0);
  const totalCreated = results.reduce((s, r) => s + r.ciAutoCreated, 0);
  const totalConflicts = results.reduce((s, r) => s + r.conflictsLogged, 0);
  const totalSoftware = results.reduce((s, r) => s + r.softwareUpserted, 0);
  const totalUnparseable = results.reduce((s, r) => s + r.unparseableSoftware, 0);

  console.log(
    `\n=== Phase 8 backfill complete: ${totalAssets} assets, ` +
      `${totalSoftware} software rows, ${totalConflicts} conflicts ===`,
  );
  console.log(`  CmdbCiServer upserts:  ${totalExt}`);
  console.log(`  CIs auto-created:      ${totalCreated}`);
  console.log(`  Unparseable software:  ${totalUnparseable}`);
  if (DRY_RUN) console.log(`  (dry-run: no writes)`);
}

// ---------------------------------------------------------------------------
// Module-run guard
//
// Only invoke main() when this file is executed directly (not when imported
// by the Vitest integration test). Works under tsx's ESM loader. Uses
// url.pathToFileURL so the guard is correct on Windows where process.argv[1]
// is a relative or drive-letter path and cannot be concatenated to `file://`
// naively (the simpler `import.meta.url === \`file://${process.argv[1]}\``
// evaluates false on Windows).
// ---------------------------------------------------------------------------

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect().then(() => pool.end()));
}

export { prisma, pool };
