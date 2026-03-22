import { z } from 'zod';
import { prisma } from '@meridian/db';

// ─── Zod schema for a single CI import row ────────────────────────────────────

export const CiImportRowSchema = z.object({
  name: z.string().min(1, 'name is required'),
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
  categorySlug: z.string().optional(),
  description: z.string().optional(),
  ipAddress: z.string().optional(),
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
 *
 * @param tenantId - Tenant scope (all CIs created under this tenant)
 * @param rows    - Raw row data (validated by this function)
 * @param userId  - User who initiated the import (for audit trail)
 * @returns       - Import summary: imported count, skipped count, per-row errors
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
      validRows.push({ index: i + 1, data: result.data }); // 1-indexed for user display
    } else {
      errors.push({ row: i + 1, errors: result.error.issues });
    }
  }

  if (validRows.length === 0) {
    return { imported: 0, skipped: rows.length, errors };
  }

  // ─── Import valid rows in a single transaction ─────────────────────────────

  await prisma.$transaction(async (tx) => {
    // Build a category slug -> id lookup map for all referenced slugs
    const referencedSlugs = [
      ...new Set(validRows.map((r) => r.data.categorySlug).filter(Boolean)),
    ] as string[];

    const categoryMap = new Map<string, string>();
    if (referencedSlugs.length > 0) {
      const categories = await tx.cmdbCategory.findMany({
        where: { tenantId, slug: { in: referencedSlugs } },
        select: { id: true, slug: true },
      });
      for (const cat of categories) {
        categoryMap.set(cat.slug, cat.id);
      }
    }

    // Get starting ciNumber for the batch — single atomic lock covers the entire batch
    const result = await tx.$queryRaw<[{ next: bigint }]>`
      SELECT COALESCE(MAX("ciNumber"), 0) + 1 AS next
      FROM cmdb_configuration_items
      WHERE "tenantId" = ${tenantId}::uuid
      FOR UPDATE
    `;
    let nextCiNumber = Number(result[0].next);

    for (const { data } of validRows) {
      // Merge ipAddress and description into attributesJson if provided
      const attributesJson: Record<string, unknown> = { ...(data.attributesJson ?? {}) };
      if (data.ipAddress) attributesJson['ipAddress'] = data.ipAddress;
      if (data.description) attributesJson['description'] = data.description;

      const categoryId = data.categorySlug ? categoryMap.get(data.categorySlug) : undefined;

      const ci = await tx.cmdbConfigurationItem.create({
        data: {
          tenantId,
          ciNumber: nextCiNumber++,
          name: data.name,
          type: data.type as never,
          status: data.status as never,
          environment: data.environment as never,
          categoryId: categoryId ?? null,
          attributesJson:
            Object.keys(attributesJson).length > 0 ? (attributesJson as never) : undefined,
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
