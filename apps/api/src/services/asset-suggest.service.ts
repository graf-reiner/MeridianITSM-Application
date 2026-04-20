import type { PrismaClient } from '@meridian/db';
import {
  MANUFACTURER_SEEDS,
  MODEL_SEEDS,
  OS_SEEDS,
  OS_VERSION_SEEDS,
  CPU_MODEL_SEEDS,
} from '../constants/asset-suggest-seeds.js';

export type SuggestField = 'manufacturer' | 'model' | 'os' | 'osVersion' | 'cpuModel';

export interface Suggestion {
  value: string;
  source: 'db' | 'seed';
  count?: number;
}

export interface SuggestArgs {
  field: SuggestField;
  q: string;
  parent?: string;
}

const VALID_FIELDS: readonly SuggestField[] = [
  'manufacturer',
  'model',
  'os',
  'osVersion',
  'cpuModel',
];

const MAX_RESULTS = 10;
const DB_ROW_LIMIT = 50;

/**
 * Returns autocomplete suggestions for the given Asset/CMDB field.
 *
 * Data sources per field:
 *   manufacturer — Asset.manufacturer + CmdbVendor.name
 *   model        — Asset.model + CmdbConfigurationItem.model
 *   os           — CmdbCiServer.operatingSystem
 *   osVersion    — CmdbCiServer.osVersion (optionally filtered by parent OS)
 *   cpuModel     — CmdbCiServer.cpuModel
 *
 * All queries are tenant-scoped. Seed values from constants/asset-suggest-seeds.ts
 * are merged in after DB values; DB wins on case-insensitive duplicates.
 */
export async function getAssetSuggestions(
  prisma: PrismaClient,
  tenantId: string,
  args: SuggestArgs,
): Promise<Suggestion[]> {
  if (!VALID_FIELDS.includes(args.field)) {
    throw new Error(`Invalid field: ${String(args.field)}`);
  }

  const qTrimmed = args.q.trim();
  const qPattern = `%${qTrimmed}%`;

  const dbRows = await queryDb(prisma, tenantId, args.field, qPattern, args.parent);
  const dbEntries: Suggestion[] = dbRows.map((r) => ({
    value: r.value,
    source: 'db',
    count: Number(r.count),
  }));

  const seedValues = collectSeeds(args.field, args.parent);
  const qLower = qTrimmed.toLowerCase();
  const filteredSeeds = seedValues.filter((v) => v.toLowerCase().includes(qLower));

  // Dedupe: DB wins on case-insensitive value match
  const dbLower = new Set(dbEntries.map((e) => e.value.toLowerCase()));
  const seedEntries: Suggestion[] = filteredSeeds
    .filter((v) => !dbLower.has(v.toLowerCase()))
    .map((v) => ({ value: v, source: 'seed' }));

  // Sort DB entries: prefix match on qLower first, then count desc
  dbEntries.sort((a, b) => {
    const aPrefix = qLower && a.value.toLowerCase().startsWith(qLower);
    const bPrefix = qLower && b.value.toLowerCase().startsWith(qLower);
    if (aPrefix && !bPrefix) return -1;
    if (!aPrefix && bPrefix) return 1;
    return (b.count ?? 0) - (a.count ?? 0);
  });

  // Sort seeds alpha
  seedEntries.sort((a, b) => a.value.localeCompare(b.value));

  return [...dbEntries, ...seedEntries].slice(0, MAX_RESULTS);
}

function collectSeeds(field: SuggestField, parent: string | undefined): string[] {
  switch (field) {
    case 'manufacturer':
      return [...MANUFACTURER_SEEDS];
    case 'model':
      if (!parent) return Object.values(MODEL_SEEDS).flat();
      return lookupSeedMapCaseInsensitive(MODEL_SEEDS, parent);
    case 'os':
      return [...OS_SEEDS];
    case 'osVersion':
      if (!parent) return Object.values(OS_VERSION_SEEDS).flat();
      return lookupSeedMapCaseInsensitive(OS_VERSION_SEEDS, parent);
    case 'cpuModel':
      return [...CPU_MODEL_SEEDS];
  }
}

function lookupSeedMapCaseInsensitive(
  map: Record<string, string[]>,
  key: string,
): string[] {
  const keyLower = key.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === keyLower) return v;
  }
  return [];
}

interface DbRow {
  value: string;
  count: number | bigint;
}

async function queryDb(
  prisma: PrismaClient,
  tenantId: string,
  field: SuggestField,
  qPattern: string,
  parent: string | undefined,
): Promise<DbRow[]> {
  switch (field) {
    case 'manufacturer':
      return prisma.$queryRaw<DbRow[]>`
        SELECT value, SUM(count)::int AS count FROM (
          SELECT manufacturer AS value, COUNT(*)::int AS count
          FROM assets
          WHERE "tenantId" = ${tenantId}::uuid
            AND manufacturer IS NOT NULL
            AND manufacturer ILIKE ${qPattern}
          GROUP BY manufacturer
          UNION ALL
          SELECT v.name AS value, COUNT(ci.id)::int AS count
          FROM cmdb_vendors v
          LEFT JOIN cmdb_configuration_items ci
            ON ci."manufacturerId" = v.id AND ci."tenantId" = v."tenantId"
          WHERE v."tenantId" = ${tenantId}::uuid
            AND v.name ILIKE ${qPattern}
          GROUP BY v.name
        ) combined
        GROUP BY value
        ORDER BY count DESC, value ASC
        LIMIT ${DB_ROW_LIMIT}
      `;

    case 'model':
      if (parent) {
        return prisma.$queryRaw<DbRow[]>`
          SELECT value, SUM(count)::int AS count FROM (
            SELECT model AS value, COUNT(*)::int AS count
            FROM assets
            WHERE "tenantId" = ${tenantId}::uuid
              AND model IS NOT NULL
              AND model ILIKE ${qPattern}
              AND LOWER(manufacturer) = LOWER(${parent})
            GROUP BY model
            UNION ALL
            SELECT ci.model AS value, COUNT(*)::int AS count
            FROM cmdb_configuration_items ci
            LEFT JOIN cmdb_vendors v ON v.id = ci."manufacturerId"
            WHERE ci."tenantId" = ${tenantId}::uuid
              AND ci.model IS NOT NULL
              AND ci.model ILIKE ${qPattern}
              AND LOWER(v.name) = LOWER(${parent})
            GROUP BY ci.model
          ) combined
          GROUP BY value
          ORDER BY count DESC, value ASC
          LIMIT ${DB_ROW_LIMIT}
        `;
      }
      return prisma.$queryRaw<DbRow[]>`
        SELECT value, SUM(count)::int AS count FROM (
          SELECT model AS value, COUNT(*)::int AS count
          FROM assets
          WHERE "tenantId" = ${tenantId}::uuid
            AND model IS NOT NULL
            AND model ILIKE ${qPattern}
          GROUP BY model
          UNION ALL
          SELECT model AS value, COUNT(*)::int AS count
          FROM cmdb_configuration_items
          WHERE "tenantId" = ${tenantId}::uuid
            AND model IS NOT NULL
            AND model ILIKE ${qPattern}
          GROUP BY model
        ) combined
        GROUP BY value
        ORDER BY count DESC, value ASC
        LIMIT ${DB_ROW_LIMIT}
      `;

    case 'os':
      return prisma.$queryRaw<DbRow[]>`
        SELECT "operatingSystem" AS value, COUNT(*)::int AS count
        FROM cmdb_ci_servers
        WHERE "tenantId" = ${tenantId}::uuid
          AND "operatingSystem" IS NOT NULL
          AND "operatingSystem" ILIKE ${qPattern}
        GROUP BY "operatingSystem"
        ORDER BY count DESC, value ASC
        LIMIT ${DB_ROW_LIMIT}
      `;

    case 'osVersion':
      if (parent) {
        return prisma.$queryRaw<DbRow[]>`
          SELECT "osVersion" AS value, COUNT(*)::int AS count
          FROM cmdb_ci_servers
          WHERE "tenantId" = ${tenantId}::uuid
            AND "osVersion" IS NOT NULL
            AND "osVersion" ILIKE ${qPattern}
            AND LOWER("operatingSystem") = LOWER(${parent})
          GROUP BY "osVersion"
          ORDER BY count DESC, value ASC
          LIMIT ${DB_ROW_LIMIT}
        `;
      }
      return prisma.$queryRaw<DbRow[]>`
        SELECT "osVersion" AS value, COUNT(*)::int AS count
        FROM cmdb_ci_servers
        WHERE "tenantId" = ${tenantId}::uuid
          AND "osVersion" IS NOT NULL
          AND "osVersion" ILIKE ${qPattern}
        GROUP BY "osVersion"
        ORDER BY count DESC, value ASC
        LIMIT ${DB_ROW_LIMIT}
      `;

    case 'cpuModel':
      return prisma.$queryRaw<DbRow[]>`
        SELECT "cpuModel" AS value, COUNT(*)::int AS count
        FROM cmdb_ci_servers
        WHERE "tenantId" = ${tenantId}::uuid
          AND "cpuModel" IS NOT NULL
          AND "cpuModel" ILIKE ${qPattern}
        GROUP BY "cpuModel"
        ORDER BY count DESC, value ASC
        LIMIT ${DB_ROW_LIMIT}
      `;
  }
}
