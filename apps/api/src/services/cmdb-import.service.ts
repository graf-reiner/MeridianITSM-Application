import { z } from 'zod';
import { prisma } from '@meridian/db';

// ─── Zod schema for a single CI import row ────────────────────────────────────

export const CiImportRowSchema = z.object({
  name: z.string().min(1, 'name is required'),
  // Legacy enum fields (still accepted)
  type: z
    .enum([
      'SERVER',
      'WORKSTATION',
      'NETWORK_DEVICE',
      'SOFTWARE',
      'SERVICE',
      'DATABASE',
      'VIRTUAL_MACHINE',
      'CONTAINER',
      'OTHER',
    ])
    .optional()
    .default('OTHER'),
  status: z
    .enum(['ACTIVE', 'INACTIVE', 'DECOMMISSIONED', 'PLANNED'])
    .optional()
    .default('ACTIVE'),
  environment: z
    .enum(['PRODUCTION', 'STAGING', 'DEV', 'DR'])
    .optional()
    .default('PRODUCTION'),
  // New reference table keys (resolve to IDs during import)
  classKey: z.string().optional(),
  lifecycleStatusKey: z.string().optional(),
  environmentKey: z.string().optional(),
  // Organization
  categorySlug: z.string().optional(),
  description: z.string().optional(),
  // Promoted fields
  hostname: z.string().optional(),
  fqdn: z.string().optional(),
  ipAddress: z.string().optional(),
  serialNumber: z.string().optional(),
  assetTag: z.string().optional(),
  externalId: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  version: z.string().optional(),
  criticality: z.string().optional(),
  // Flexible
  attributesJson: z.record(z.string(), z.unknown()).optional(),
});

type CiImportRow = z.output<typeof CiImportRowSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportCIsResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; errors: z.ZodIssue[] }>;
}

// ─── importCIs ────────────────────────────────────────────────────────────────

/**
 * Bulk import CI rows into the CMDB.
 *
 * - Each row is validated independently via CiImportRowSchema.safeParse().
 * - Valid rows are imported in a single transaction with sequential ciNumbers.
 * - Invalid rows are collected with per-row ZodIssue details and returned as errors.
 * - A CmdbChangeRecord with changedBy=IMPORT is created for each successfully imported CI.
 * - Supports both legacy enum fields and new reference table keys.
 */
export async function importCIs(
  tenantId: string,
  rows: unknown[],
  userId: string,
): Promise<ImportCIsResult> {
  const validRows: Array<{ index: number; data: CiImportRow }> = [];
  const errors: Array<{ row: number; errors: z.ZodIssue[] }> = [];

  // ─── Validate each row independently ──────────────────────────────────────

  for (let i = 0; i < rows.length; i++) {
    const result = CiImportRowSchema.safeParse(rows[i]);
    if (result.success) {
      validRows.push({ index: i + 1, data: result.data });
    } else {
      errors.push({ row: i + 1, errors: result.error.issues });
    }
  }

  if (validRows.length === 0) {
    return { imported: 0, skipped: rows.length, errors };
  }

  // ─── Import valid rows in a single transaction ─────────────────────────────

  await prisma.$transaction(async (tx) => {
    // Build lookup maps for reference table keys
    const referencedSlugs = [
      ...new Set(validRows.map((r) => r.data.categorySlug).filter(Boolean)),
    ] as string[];
    const referencedClassKeys = [
      ...new Set(validRows.map((r) => r.data.classKey).filter(Boolean)),
    ] as string[];
    const referencedStatusKeys = [
      ...new Set(validRows.map((r) => r.data.lifecycleStatusKey).filter(Boolean)),
    ] as string[];
    const referencedEnvKeys = [
      ...new Set(validRows.map((r) => r.data.environmentKey).filter(Boolean)),
    ] as string[];
    const referencedManufacturers = [
      ...new Set(validRows.map((r) => r.data.manufacturer).filter(Boolean)),
    ] as string[];

    const categoryMap = new Map<string, string>();
    if (referencedSlugs.length > 0) {
      const categories = await tx.cmdbCategory.findMany({
        where: { tenantId, slug: { in: referencedSlugs } },
        select: { id: true, slug: true },
      });
      for (const cat of categories) categoryMap.set(cat.slug, cat.id);
    }

    const classMap = new Map<string, string>();
    if (referencedClassKeys.length > 0) {
      const classes = await tx.cmdbCiClass.findMany({
        where: { tenantId, classKey: { in: referencedClassKeys } },
        select: { id: true, classKey: true },
      });
      for (const cls of classes) classMap.set(cls.classKey, cls.id);
    }

    const statusMap = new Map<string, string>();
    if (referencedStatusKeys.length > 0) {
      const statuses = await tx.cmdbStatus.findMany({
        where: { tenantId, statusType: 'lifecycle', statusKey: { in: referencedStatusKeys } },
        select: { id: true, statusKey: true },
      });
      for (const s of statuses) statusMap.set(s.statusKey, s.id);
    }

    const envMap = new Map<string, string>();
    if (referencedEnvKeys.length > 0) {
      const envs = await tx.cmdbEnvironment.findMany({
        where: { tenantId, envKey: { in: referencedEnvKeys } },
        select: { id: true, envKey: true },
      });
      for (const e of envs) envMap.set(e.envKey, e.id);
    }

    const vendorMap = new Map<string, string>();
    if (referencedManufacturers.length > 0) {
      const vendors = await tx.cmdbVendor.findMany({
        where: { tenantId, name: { in: referencedManufacturers } },
        select: { id: true, name: true },
      });
      for (const v of vendors) vendorMap.set(v.name, v.id);
    }

    // Get starting ciNumber
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_ci_seq'))`;
    const result = await tx.$queryRaw<[{ next: bigint }]>`
      SELECT COALESCE(MAX("ciNumber"), 0) + 1 AS next
      FROM cmdb_configuration_items
      WHERE "tenantId" = ${tenantId}::uuid
    `;
    let nextCiNumber = Number(result[0].next);

    for (const { data } of validRows) {
      const categoryId = data.categorySlug ? categoryMap.get(data.categorySlug) : undefined;
      const classId = data.classKey ? classMap.get(data.classKey) : undefined;
      const lifecycleStatusId = data.lifecycleStatusKey ? statusMap.get(data.lifecycleStatusKey) : undefined;
      const environmentId = data.environmentKey ? envMap.get(data.environmentKey) : undefined;
      const manufacturerId = data.manufacturer ? vendorMap.get(data.manufacturer) : undefined;

      const ci = await tx.cmdbConfigurationItem.create({
        data: {
          tenantId,
          ciNumber: nextCiNumber++,
          name: data.name,
          // Legacy enums
          type: data.type as never,
          status: data.status as never,
          environment: data.environment as never,
          // New references
          classId: classId ?? null,
          lifecycleStatusId: lifecycleStatusId ?? null,
          environmentId: environmentId ?? null,
          // Organization
          categoryId: categoryId ?? null,
          // Promoted fields
          hostname: data.hostname,
          fqdn: data.fqdn,
          ipAddress: data.ipAddress,
          serialNumber: data.serialNumber,
          assetTag: data.assetTag,
          externalId: data.externalId,
          manufacturerId: manufacturerId ?? null,
          model: data.model,
          version: data.version,
          criticality: data.criticality,
          // Governance
          sourceSystem: 'csv-import',
          firstDiscoveredAt: new Date(),
          // Flexible (only for truly custom attributes)
          attributesJson:
            data.attributesJson && Object.keys(data.attributesJson).length > 0
              ? (data.attributesJson as never)
              : undefined,
        },
      });

      await tx.cmdbChangeRecord.create({
        data: {
          tenantId,
          ciId: ci.id,
          changeType: 'CREATED',
          changedBy: 'IMPORT',
          userId,
        },
      });
    }
  });

  return {
    imported: validRows.length,
    skipped: errors.length,
    errors,
  };
}
