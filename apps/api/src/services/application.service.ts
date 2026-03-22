import { prisma } from '@meridian/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateAppData {
  name: string;
  type?: string;
  status?: string;
  criticality?: string;
  hostingModel?: string;
  techStack?: string[];
  authMethod?: string;
  dataClassification?: string;
  annualCost?: number;
  rpo?: number;
  rto?: number;
  lifecycleStage?: string;
  strategicRating?: number;
  description?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateAppData {
  name?: string;
  type?: string;
  status?: string;
  criticality?: string;
  hostingModel?: string;
  techStack?: string[];
  authMethod?: string;
  dataClassification?: string;
  annualCost?: number | null;
  rpo?: number | null;
  rto?: number | null;
  lifecycleStage?: string;
  strategicRating?: number | null;
  description?: string | null;
  customFields?: Record<string, unknown> | null;
}

export interface AppListFilters {
  type?: string;
  status?: string;
  criticality?: string;
  hostingModel?: string;
  lifecycleStage?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ─── Application CRUD ─────────────────────────────────────────────────────────

/**
 * Create a new application in the portfolio.
 * Logs an ApplicationActivity with activityType='CREATED'.
 */
export async function createApp(tenantId: string, data: CreateAppData, userId: string) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.application.create({
      data: {
        tenantId,
        name: data.name,
        type: (data.type as any) ?? 'OTHER',
        status: (data.status as any) ?? 'ACTIVE',
        criticality: (data.criticality as any) ?? 'MEDIUM',
        hostingModel: (data.hostingModel as any) ?? 'ON_PREMISE',
        techStack: data.techStack ?? [],
        authMethod: data.authMethod,
        dataClassification: data.dataClassification,
        annualCost: data.annualCost,
        rpo: data.rpo,
        rto: data.rto,
        lifecycleStage: (data.lifecycleStage as any) ?? 'PRODUCTION',
        strategicRating: data.strategicRating,
        description: data.description,
        customFields: data.customFields ? (data.customFields as any) : undefined,
      },
    });

    await tx.applicationActivity.create({
      data: {
        tenantId,
        applicationId: app.id,
        actorId: userId,
        activityType: 'CREATED',
        metadata: { name: app.name } as any,
      },
    });

    return app;
  });
}

/**
 * Get a single application with full relations: dependencies, dependents,
 * documents, applicationAssets, and recent activities.
 */
export async function getApp(tenantId: string, appId: string) {
  return prisma.application.findFirst({
    where: { id: appId, tenantId },
    include: {
      dependencies: {
        include: {
          targetApplication: {
            select: { id: true, name: true, type: true, status: true },
          },
        },
      },
      dependents: {
        include: {
          sourceApplication: {
            select: { id: true, name: true, type: true, status: true },
          },
        },
      },
      documents: true,
      applicationAssets: {
        include: {
          asset: {
            select: {
              id: true,
              assetTag: true,
              hostname: true,
              model: true,
              status: true,
            },
          },
        },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  });
}

/**
 * List applications with optional filters and pagination.
 */
export async function listApps(tenantId: string, filters: AppListFilters = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { tenantId };

  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;
  if (filters.criticality) where.criticality = filters.criticality;
  if (filters.hostingModel) where.hostingModel = filters.hostingModel;
  if (filters.lifecycleStage) where.lifecycleStage = filters.lifecycleStage;
  if (filters.search) {
    where.name = { contains: filters.search, mode: 'insensitive' };
  }

  const [data, total] = await prisma.$transaction([
    prisma.application.findMany({
      where: where as any,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.application.count({ where: where as any }),
  ]);

  return { data, total, page, pageSize };
}

/**
 * Update an application, logging per-field changes to ApplicationActivity.
 */
export async function updateApp(
  tenantId: string,
  appId: string,
  data: UpdateAppData,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.application.findFirst({
      where: { id: appId, tenantId },
    });

    if (!existing) {
      throw new Error('Application not found');
    }

    const trackedFields: (keyof UpdateAppData)[] = [
      'name',
      'type',
      'status',
      'criticality',
      'hostingModel',
      'lifecycleStage',
      'annualCost',
      'rpo',
      'rto',
      'strategicRating',
      'description',
      'authMethod',
      'dataClassification',
    ];

    const activityLogs: Array<{
      tenantId: string;
      applicationId: string;
      actorId: string;
      activityType: string;
      fieldName: string;
      oldValue: string | null;
      newValue: string | null;
    }> = [];

    for (const field of trackedFields) {
      if (field in data && data[field] !== undefined) {
        const oldVal = (existing as any)[field];
        const newVal = data[field];
        if (String(oldVal) !== String(newVal)) {
          activityLogs.push({
            tenantId,
            applicationId: appId,
            actorId: userId,
            activityType: 'FIELD_UPDATED',
            fieldName: field,
            oldValue: oldVal != null ? String(oldVal) : null,
            newValue: newVal != null ? String(newVal) : null,
          });
        }
      }
    }

    const updated = await tx.application.update({
      where: { id: appId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type as any }),
        ...(data.status !== undefined && { status: data.status as any }),
        ...(data.criticality !== undefined && { criticality: data.criticality as any }),
        ...(data.hostingModel !== undefined && { hostingModel: data.hostingModel as any }),
        ...(data.techStack !== undefined && { techStack: data.techStack }),
        ...(data.authMethod !== undefined && { authMethod: data.authMethod }),
        ...(data.dataClassification !== undefined && {
          dataClassification: data.dataClassification,
        }),
        ...(data.annualCost !== undefined && { annualCost: data.annualCost }),
        ...(data.rpo !== undefined && { rpo: data.rpo }),
        ...(data.rto !== undefined && { rto: data.rto }),
        ...(data.lifecycleStage !== undefined && { lifecycleStage: data.lifecycleStage as any }),
        ...(data.strategicRating !== undefined && { strategicRating: data.strategicRating }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.customFields !== undefined && { customFields: data.customFields as any }),
      },
    });

    if (activityLogs.length > 0) {
      await tx.applicationActivity.createMany({ data: activityLogs });
    }

    return updated;
  });
}

/**
 * Delete an application and all related records (cascade).
 * Deletes dependencies (both directions), documents, asset links, and activities first.
 */
export async function deleteApp(tenantId: string, appId: string) {
  return prisma.$transaction(async (tx) => {
    // Verify ownership
    const app = await tx.application.findFirst({ where: { id: appId, tenantId } });
    if (!app) throw new Error('Application not found');

    // Delete related records before the application itself
    await tx.applicationDependency.deleteMany({
      where: {
        tenantId,
        OR: [{ sourceApplicationId: appId }, { targetApplicationId: appId }],
      },
    });

    await tx.applicationDocument.deleteMany({ where: { tenantId, applicationId: appId } });
    await tx.applicationAsset.deleteMany({ where: { tenantId, applicationId: appId } });
    await tx.applicationActivity.deleteMany({ where: { tenantId, applicationId: appId } });

    return tx.application.delete({ where: { id: appId } });
  });
}

// ─── Dependency Mapping ───────────────────────────────────────────────────────

/**
 * Add a dependency between two applications.
 * Self-dependency is not allowed (sourceAppId must differ from targetAppId).
 * The unique constraint on [sourceApplicationId, targetApplicationId] prevents duplicate edges.
 */
export async function addDependency(
  tenantId: string,
  sourceAppId: string,
  targetAppId: string,
  dependencyType: string,
  description?: string,
) {
  if (sourceAppId === targetAppId) {
    throw new Error('Self-dependency is not allowed: sourceAppId must differ from targetAppId');
  }

  return prisma.applicationDependency.create({
    data: {
      tenantId,
      sourceApplicationId: sourceAppId,
      targetApplicationId: targetAppId,
      dependencyType: dependencyType as any,
      description,
    },
  });
}

/**
 * Remove a dependency by its id (scoped to tenant).
 */
export async function removeDependency(tenantId: string, dependencyId: string) {
  const dep = await prisma.applicationDependency.findFirst({
    where: { id: dependencyId, tenantId },
  });
  if (!dep) throw new Error('Dependency not found');

  return prisma.applicationDependency.delete({ where: { id: dependencyId } });
}

// ─── Document Management ──────────────────────────────────────────────────────

/**
 * Add a document (link) to an application.
 * Supports 11 document types: ARCHITECTURE, API_SPEC, RUNBOOK, SLA_DOC, SECURITY,
 * COMPLIANCE, USER_GUIDE, ADMIN_GUIDE, RELEASE_NOTES, DEPLOYMENT, OTHER.
 */
export async function addDocument(
  tenantId: string,
  appId: string,
  data: {
    title: string;
    documentType: string;
    url: string;
    description?: string;
  },
) {
  return prisma.applicationDocument.create({
    data: {
      tenantId,
      applicationId: appId,
      title: data.title,
      documentType: data.documentType as any,
      url: data.url,
      description: data.description,
    },
  });
}

/**
 * Remove a document by its id (scoped to tenant).
 */
export async function removeDocument(tenantId: string, documentId: string) {
  const doc = await prisma.applicationDocument.findFirst({
    where: { id: documentId, tenantId },
  });
  if (!doc) throw new Error('Document not found');

  return prisma.applicationDocument.delete({ where: { id: documentId } });
}

// ─── Asset Relationships ──────────────────────────────────────────────────────

/**
 * Link an asset to an application with a relationship type.
 * Supports 3 relationship types: RUNS_ON, HOSTED_BY, USES.
 * The unique constraint on [applicationId, assetId] prevents duplicate links.
 */
export async function linkAsset(
  tenantId: string,
  appId: string,
  assetId: string,
  relationshipType: string,
  isPrimary?: boolean,
) {
  return prisma.applicationAsset.create({
    data: {
      tenantId,
      applicationId: appId,
      assetId,
      relationshipType: relationshipType as any,
      isPrimary: isPrimary ?? false,
    },
  });
}

/**
 * Remove an application-asset link by its id (scoped to tenant).
 */
export async function unlinkAsset(tenantId: string, appAssetId: string) {
  const link = await prisma.applicationAsset.findFirst({
    where: { id: appAssetId, tenantId },
  });
  if (!link) throw new Error('Application-asset link not found');

  return prisma.applicationAsset.delete({ where: { id: appAssetId } });
}

// ─── Portfolio Statistics ─────────────────────────────────────────────────────

/**
 * Return summary statistics for the application portfolio.
 * Includes totals by status, by criticality, deprecated count, and total annual cost
 * of active applications.
 */
export async function getPortfolioStats(tenantId: string) {
  const [apps, costResult] = await Promise.all([
    prisma.application.findMany({
      where: { tenantId },
      select: { status: true, criticality: true, annualCost: true },
    }),
    prisma.application.aggregate({
      where: { tenantId, status: 'ACTIVE', annualCost: { not: null } },
      _sum: { annualCost: true },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  const byCriticality: Record<string, number> = {};
  let deprecatedCount = 0;

  for (const app of apps) {
    byStatus[app.status] = (byStatus[app.status] ?? 0) + 1;
    byCriticality[app.criticality] = (byCriticality[app.criticality] ?? 0) + 1;
    if (app.status === 'DECOMMISSIONED') {
      deprecatedCount += 1;
    }
  }

  return {
    total: apps.length,
    byStatus,
    byCriticality,
    deprecatedCount,
    totalAnnualCost: costResult._sum.annualCost ?? 0,
  };
}

// ─── Dependency Graph ─────────────────────────────────────────────────────────

export interface AppNode {
  id: string;
  name: string;
  type: string;
  status: string;
  criticality: string;
}

export interface AppEdge {
  id: string;
  sourceId: string;
  targetId: string;
  dependencyType: string;
}

/**
 * Return the full dependency graph as nodes + edges for ReactFlow rendering.
 * Nodes: all applications (id, name, type, status, criticality).
 * Edges: all ApplicationDependency records (sourceId, targetId, dependencyType).
 */
export async function getDependencyGraph(tenantId: string): Promise<{
  nodes: AppNode[];
  edges: AppEdge[];
}> {
  const [apps, deps] = await Promise.all([
    prisma.application.findMany({
      where: { tenantId },
      select: { id: true, name: true, type: true, status: true, criticality: true },
    }),
    prisma.applicationDependency.findMany({
      where: { tenantId },
      select: {
        id: true,
        sourceApplicationId: true,
        targetApplicationId: true,
        dependencyType: true,
      },
    }),
  ]);

  const nodes: AppNode[] = apps.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    status: a.status,
    criticality: a.criticality,
  }));

  const edges: AppEdge[] = deps.map((d) => ({
    id: d.id,
    sourceId: d.sourceApplicationId,
    targetId: d.targetApplicationId,
    dependencyType: d.dependencyType,
  }));

  return { nodes, edges };
}
