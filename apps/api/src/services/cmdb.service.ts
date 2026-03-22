import { prisma } from '@meridian/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateCIData {
  name: string;
  type?: string;
  status?: string;
  environment?: string;
  categoryId?: string;
  assetId?: string;
  agentId?: string;
  ownerId?: string;
  siteId?: string;
  attributesJson?: Record<string, unknown>;
}

export interface UpdateCIData {
  name?: string;
  type?: string;
  status?: string;
  environment?: string;
  categoryId?: string | null;
  assetId?: string | null;
  agentId?: string | null;
  ownerId?: string | null;
  siteId?: string | null;
  attributesJson?: Record<string, unknown> | null;
}

export interface CIListFilters {
  type?: string;
  status?: string;
  environment?: string;
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateRelationshipData {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  description?: string;
}

export interface CreateCategoryData {
  name: string;
  slug: string;
  icon?: string;
  color?: string;
  parentId?: string;
  description?: string;
}

export interface ImpactedCI {
  ciId: string;
  depth: number;
  relationshipType: string;
  direction: 'downstream' | 'upstream';
  name: string;
  type: string;
  status: string;
}

// ─── CI CRUD ──────────────────────────────────────────────────────────────────

/**
 * Create a CI with a sequential, tenant-scoped ciNumber.
 * Uses FOR UPDATE lock to prevent duplicate ciNumbers under concurrent load.
 */
export async function createCI(tenantId: string, data: CreateCIData, userId: string) {
  return prisma.$transaction(async (tx) => {
    // Get next ciNumber atomically with advisory lock
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_ci_seq'))`;
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
        name: data.name,
        type: (data.type ?? 'OTHER') as never,
        status: (data.status ?? 'ACTIVE') as never,
        environment: (data.environment ?? 'PRODUCTION') as never,
        categoryId: data.categoryId,
        assetId: data.assetId,
        agentId: data.agentId,
        ownerId: data.ownerId,
        siteId: data.siteId,
        attributesJson: (data.attributesJson ?? undefined) as never,
      },
    });

    // Log creation in CmdbChangeRecord
    await tx.cmdbChangeRecord.create({
      data: {
        tenantId,
        ciId: ci.id,
        changeType: 'CREATED',
        changedBy: 'USER',
        userId,
      },
    });

    return ci;
  });
}

/**
 * Get a CI by ID scoped to tenant, including relations, change history, and ticket links.
 */
export async function getCI(tenantId: string, ciId: string) {
  return prisma.cmdbConfigurationItem.findFirst({
    where: { id: ciId, tenantId },
    include: {
      category: true,
      sourceRels: {
        include: {
          target: { select: { id: true, name: true, type: true, status: true } },
        },
      },
      targetRels: {
        include: {
          source: { select: { id: true, name: true, type: true, status: true } },
        },
      },
      changeRecords: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      ticketLinks: {
        include: {
          ticket: { select: { id: true, title: true, ticketNumber: true } },
        },
      },
    },
  });
}

/**
 * List CIs with filtering and pagination.
 */
export async function listCIs(tenantId: string, filters: CIListFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where = {
    tenantId,
    ...(filters.type ? { type: filters.type as never } : {}),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.environment ? { environment: filters.environment as never } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.cmdbConfigurationItem.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.cmdbConfigurationItem.count({ where }),
  ]);

  return { data, total, page, pageSize };
}

/**
 * Update a CI and log per-field change records for every modified field.
 */
export async function updateCI(
  tenantId: string,
  ciId: string,
  data: UpdateCIData,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.cmdbConfigurationItem.findFirst({
      where: { id: ciId, tenantId },
    });

    if (!current) {
      return null;
    }

    // Track changed fields
    const changedFields: Array<{ fieldName: string; oldValue: string; newValue: string }> = [];

    const trackChange = (field: string, oldVal: unknown, newVal: unknown) => {
      const oldStr = oldVal == null ? '' : String(oldVal);
      const newStr = newVal == null ? '' : String(newVal);
      if (oldStr !== newStr) {
        changedFields.push({ fieldName: field, oldValue: oldStr, newValue: newStr });
      }
    };

    if (data.name !== undefined) trackChange('name', current.name, data.name);
    if (data.type !== undefined) trackChange('type', current.type, data.type);
    if (data.status !== undefined) trackChange('status', current.status, data.status);
    if (data.environment !== undefined) trackChange('environment', current.environment, data.environment);
    if (data.categoryId !== undefined) trackChange('categoryId', current.categoryId, data.categoryId);
    if (data.assetId !== undefined) trackChange('assetId', current.assetId, data.assetId);
    if (data.agentId !== undefined) trackChange('agentId', current.agentId, data.agentId);
    if (data.ownerId !== undefined) trackChange('ownerId', current.ownerId, data.ownerId);
    if (data.siteId !== undefined) trackChange('siteId', current.siteId, data.siteId);
    if (data.attributesJson !== undefined) {
      trackChange('attributesJson', JSON.stringify(current.attributesJson), JSON.stringify(data.attributesJson));
    }

    // Create CmdbChangeRecord for each changed field
    if (changedFields.length > 0) {
      await tx.cmdbChangeRecord.createMany({
        data: changedFields.map((f) => ({
          tenantId,
          ciId,
          changeType: 'UPDATED' as const,
          fieldName: f.fieldName,
          oldValue: f.oldValue,
          newValue: f.newValue,
          changedBy: 'USER' as const,
          userId,
        })),
      });
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.type !== undefined) updateData['type'] = data.type;
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.environment !== undefined) updateData['environment'] = data.environment;
    if (data.categoryId !== undefined) updateData['categoryId'] = data.categoryId;
    if (data.assetId !== undefined) updateData['assetId'] = data.assetId;
    if (data.agentId !== undefined) updateData['agentId'] = data.agentId;
    if (data.ownerId !== undefined) updateData['ownerId'] = data.ownerId;
    if (data.siteId !== undefined) updateData['siteId'] = data.siteId;
    if (data.attributesJson !== undefined) updateData['attributesJson'] = data.attributesJson;

    return tx.cmdbConfigurationItem.update({
      where: { id: ciId },
      data: updateData as never,
    });
  });
}

/**
 * Soft-delete a CI by setting status to DECOMMISSIONED, and log the change.
 */
export async function deleteCI(tenantId: string, ciId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const ci = await tx.cmdbConfigurationItem.findFirst({
      where: { id: ciId, tenantId },
    });

    if (!ci) {
      return null;
    }

    // Log deletion in CmdbChangeRecord
    await tx.cmdbChangeRecord.create({
      data: {
        tenantId,
        ciId,
        changeType: 'DELETED',
        changedBy: 'USER',
        userId,
      },
    });

    // Soft-delete by setting status to DECOMMISSIONED
    return tx.cmdbConfigurationItem.update({
      where: { id: ciId },
      data: { status: 'DECOMMISSIONED' as never },
    });
  });
}

// ─── Relationship Management ──────────────────────────────────────────────────

/**
 * Create a relationship between two CIs.
 * Validates both CIs exist in the tenant and prevents self-referencing.
 */
export async function createRelationship(tenantId: string, data: CreateRelationshipData) {
  if (data.sourceId === data.targetId) {
    throw new Error('A CI cannot have a relationship with itself');
  }

  // Validate both CIs exist and belong to the tenant
  const [source, target] = await Promise.all([
    prisma.cmdbConfigurationItem.findFirst({ where: { id: data.sourceId, tenantId } }),
    prisma.cmdbConfigurationItem.findFirst({ where: { id: data.targetId, tenantId } }),
  ]);

  if (!source) throw new Error('Source CI not found');
  if (!target) throw new Error('Target CI not found');

  return prisma.cmdbRelationship.create({
    data: {
      tenantId,
      sourceId: data.sourceId,
      targetId: data.targetId,
      relationshipType: data.relationshipType as never,
      description: data.description,
    },
  });
}

/**
 * Delete a relationship by ID scoped to tenant.
 */
export async function deleteRelationship(tenantId: string, relationshipId: string) {
  return prisma.cmdbRelationship.deleteMany({
    where: { id: relationshipId, tenantId },
  });
}

/**
 * Get all relationships for a CI (both as source and target).
 */
export async function getCIRelationships(tenantId: string, ciId: string) {
  const [sourceRels, targetRels] = await Promise.all([
    prisma.cmdbRelationship.findMany({
      where: { sourceId: ciId, tenantId },
      include: {
        target: { select: { id: true, name: true, type: true, status: true, ciNumber: true } },
      },
    }),
    prisma.cmdbRelationship.findMany({
      where: { targetId: ciId, tenantId },
      include: {
        source: { select: { id: true, name: true, type: true, status: true, ciNumber: true } },
      },
    }),
  ]);

  return { sourceRels, targetRels };
}

// ─── Impact Analysis ──────────────────────────────────────────────────────────

interface ImpactGraphRow {
  ciId: string;
  depth: number;
  relationshipType: string;
}

/**
 * Perform impact analysis for a CI using recursive PostgreSQL CTEs.
 * Traverses downstream (what this CI impacts) and upstream (what impacts this CI).
 * maxDepth is capped at 5 to prevent excessive traversal.
 */
export async function getImpactAnalysis(
  tenantId: string,
  rootCiId: string,
  maxDepth: number = 2,
) {
  const depth = Math.min(maxDepth, 5);

  const rootCi = await prisma.cmdbConfigurationItem.findFirst({
    where: { id: rootCiId, tenantId },
  });

  if (!rootCi) return null;

  // Downstream: what does this CI impact (traverses source -> target)
  const downstreamRows = await prisma.$queryRaw<ImpactGraphRow[]>`
    WITH RECURSIVE impact_graph AS (
      SELECT r."targetId" AS "ciId", 1 AS depth, r."relationshipType"::text, ARRAY[${rootCiId}::uuid, r."targetId"] AS path
      FROM cmdb_relationships r
      WHERE r."sourceId" = ${rootCiId}::uuid AND r."tenantId" = ${tenantId}::uuid
      UNION ALL
      SELECT r."targetId", ig.depth + 1, r."relationshipType"::text, ig.path || r."targetId"
      FROM cmdb_relationships r
      INNER JOIN impact_graph ig ON r."sourceId" = ig."ciId"
      WHERE r."tenantId" = ${tenantId}::uuid AND ig.depth < ${depth} AND NOT (r."targetId" = ANY(ig.path))
    )
    SELECT DISTINCT ON ("ciId") "ciId", depth, "relationshipType" FROM impact_graph ORDER BY "ciId", depth LIMIT 10000
  `;

  // Upstream: what impacts this CI (traverses target -> source, reverse direction)
  const upstreamRows = await prisma.$queryRaw<ImpactGraphRow[]>`
    WITH RECURSIVE impact_graph AS (
      SELECT r."sourceId" AS "ciId", 1 AS depth, r."relationshipType"::text, ARRAY[${rootCiId}::uuid, r."sourceId"] AS path
      FROM cmdb_relationships r
      WHERE r."targetId" = ${rootCiId}::uuid AND r."tenantId" = ${tenantId}::uuid
      UNION ALL
      SELECT r."sourceId", ig.depth + 1, r."relationshipType"::text, ig.path || r."sourceId"
      FROM cmdb_relationships r
      INNER JOIN impact_graph ig ON r."targetId" = ig."ciId"
      WHERE r."tenantId" = ${tenantId}::uuid AND ig.depth < ${depth} AND NOT (r."sourceId" = ANY(ig.path))
    )
    SELECT DISTINCT ON ("ciId") "ciId", depth, "relationshipType" FROM impact_graph ORDER BY "ciId", depth LIMIT 10000
  `;

  // Gather all unique CI IDs
  const downstreamIds = downstreamRows.map((r) => r.ciId);
  const upstreamIds = upstreamRows.map((r) => r.ciId);
  const allCiIds = [...new Set([...downstreamIds, ...upstreamIds])];

  // Fetch CI details for all impacted nodes
  const ciDetails =
    allCiIds.length > 0
      ? await prisma.cmdbConfigurationItem.findMany({
          where: { id: { in: allCiIds }, tenantId },
          select: { id: true, name: true, type: true, status: true, ciNumber: true },
        })
      : [];

  const ciMap = new Map(ciDetails.map((ci) => [ci.id, ci]));

  const impacted: ImpactedCI[] = [];

  for (const row of downstreamRows) {
    const ci = ciMap.get(row.ciId);
    if (ci) {
      impacted.push({
        ciId: row.ciId,
        depth: row.depth,
        relationshipType: row.relationshipType,
        direction: 'downstream',
        name: ci.name,
        type: ci.type,
        status: ci.status,
      });
    }
  }

  for (const row of upstreamRows) {
    const ci = ciMap.get(row.ciId);
    if (ci) {
      impacted.push({
        ciId: row.ciId,
        depth: row.depth,
        relationshipType: row.relationshipType,
        direction: 'upstream',
        name: ci.name,
        type: ci.type,
        status: ci.status,
      });
    }
  }

  return {
    rootCi,
    impacted,
    totalCount: impacted.length,
  };
}

// ─── Change History ───────────────────────────────────────────────────────────

/**
 * List change history for a CI with pagination.
 */
export async function listCIChangeHistory(
  tenantId: string,
  ciId: string,
  page: number = 1,
  pageSize: number = 50,
) {
  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    prisma.cmdbChangeRecord.findMany({
      where: { ciId, tenantId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.cmdbChangeRecord.count({ where: { ciId, tenantId } }),
  ]);

  return { data, total, page, pageSize };
}

// ─── Categories ───────────────────────────────────────────────────────────────

/**
 * Create a CMDB category with optional parent and cycle detection.
 */
export async function createCategory(tenantId: string, data: CreateCategoryData) {
  if (data.parentId) {
    const parent = await prisma.cmdbCategory.findFirst({
      where: { id: data.parentId, tenantId },
    });
    if (!parent) throw new Error('Parent category not found');
  }

  const category = await prisma.cmdbCategory.create({
    data: {
      tenantId,
      name: data.name,
      slug: data.slug,
      icon: data.icon,
      color: data.color,
      parentId: data.parentId,
      description: data.description,
    },
  });

  // Cycle detection after creation: verify the new category doesn't create a cycle
  if (data.parentId) {
    const cycleCheck = await prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE ancestors AS (
        SELECT id, "parentId" FROM cmdb_categories WHERE id = ${data.parentId}::uuid AND "tenantId" = ${tenantId}::uuid
        UNION ALL
        SELECT c.id, c."parentId" FROM cmdb_categories c JOIN ancestors a ON c.id = a."parentId"
        WHERE c."tenantId" = ${tenantId}::uuid
      )
      SELECT id FROM ancestors WHERE id = ${category.id}::uuid
    `;

    if (cycleCheck.length > 0) {
      // Rollback by deleting the just-created category
      await prisma.cmdbCategory.delete({ where: { id: category.id } });
      throw new Error('Category hierarchy cycle detected');
    }
  }

  return category;
}

/**
 * List all categories for a tenant with children for tree building.
 */
export async function listCategories(tenantId: string) {
  return prisma.cmdbCategory.findMany({
    where: { tenantId },
    include: {
      children: true,
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Update a CMDB category.
 */
export async function updateCategory(
  tenantId: string,
  categoryId: string,
  data: Partial<CreateCategoryData>,
) {
  const existing = await prisma.cmdbCategory.findFirst({
    where: { id: categoryId, tenantId },
  });
  if (!existing) return null;

  return prisma.cmdbCategory.update({
    where: { id: categoryId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
    },
  });
}

/**
 * Delete a CMDB category.
 */
export async function deleteCategory(tenantId: string, categoryId: string) {
  const existing = await prisma.cmdbCategory.findFirst({
    where: { id: categoryId, tenantId },
  });
  if (!existing) return null;

  return prisma.cmdbCategory.delete({ where: { id: categoryId } });
}
