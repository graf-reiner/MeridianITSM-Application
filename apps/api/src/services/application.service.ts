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
  // APM-only portfolio fields (don't belong in CMDB)
  supportNotes?: string;
  specialNotes?: string;
  osRequirements?: string;
  vendorContact?: string;
  licenseInfo?: string;
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
  // APM-only portfolio fields
  supportNotes?: string | null;
  specialNotes?: string | null;
  osRequirements?: string | null;
  vendorContact?: string | null;
  licenseInfo?: string | null;
  // Bridge: clearable from updateApp; setting/swapping uses dedicated linkCiToApplication
  primaryCiId?: string | null;
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
 *
 * APM ↔ CMDB bridge: in the same transaction we also create a primary
 * CmdbConfigurationItem (class = `application_instance`) and a
 * CmdbCiApplication extension row, then point Application.primaryCiId at
 * the new CI. This guarantees the bridge from day one — the Application
 * detail page can walk one hop into CMDB to render owners, servers,
 * databases, endpoints, etc.
 *
 * If the tenant is missing the `application_instance` CMDB seed (e.g.
 * older tenants pre-CMDB), the Application is created without a primary
 * CI and a warning is logged. The yellow banner on the detail page lets
 * the user create one later via createPrimaryCiForApplication.
 *
 * Logs ApplicationActivity entries: CREATED, and PRIMARY_CI_CREATED when
 * the bridge succeeds.
 */
export async function createApp(tenantId: string, data: CreateAppData, userId: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Create the Application as today
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
        supportNotes: data.supportNotes,
        specialNotes: data.specialNotes,
        osRequirements: data.osRequirements,
        vendorContact: data.vendorContact,
        licenseInfo: data.licenseInfo,
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

    // 2. Auto-create the primary CI (APM ↔ CMDB bridge)
    const ci = await createPrimaryCiInternal(tx, tenantId, app.id, app.name, userId);

    // Return the Application reflecting the bridge state. Refetch to pick
    // up primaryCiId set inside createPrimaryCiInternal.
    if (ci) {
      return tx.application.findUniqueOrThrow({ where: { id: app.id } });
    }
    return app;
  });
}

/**
 * Internal helper: creates the primary CI + extension row inside an
 * existing transaction and updates Application.primaryCiId. Returns the
 * created CI, or null if the tenant lacks the `application_instance`
 * CMDB seed (caller must handle the null branch).
 *
 * Tenant isolation: every row created here uses the passed `tenantId`
 * argument. The transaction caller must verify `tenantId === user.tenantId`.
 */
async function createPrimaryCiInternal(
  tx: any,
  tenantId: string,
  applicationId: string,
  appName: string,
  userId: string,
) {
  // Look up CMDB reference data scoped by tenantId
  const ciClass = await tx.cmdbCiClass.findFirst({
    where: { tenantId, classKey: 'application_instance' },
    select: { id: true },
  });
  if (!ciClass) {
    console.warn(
      `[createApp] tenant ${tenantId} missing 'application_instance' CMDB class — Application ${applicationId} created without primary CI`,
    );
    return null;
  }

  const prodEnv = await tx.cmdbEnvironment.findFirst({
    where: { tenantId, envKey: 'prod' },
    select: { id: true },
  });

  // Phase 7 (CREF-02): every new CI must have lifecycleStatusId +
  // operationalStatusId for the upcoming NOT NULL constraint (Plan 06).
  // Uses tx-scoped lookups directly (already inside a transaction — the
  // per-process resolver cache is not needed here because this runs once
  // per primary-CI creation, not in a hot path).
  const inServiceStatus = await tx.cmdbStatus.findFirst({
    where: { tenantId, statusType: 'lifecycle', statusKey: 'in_service' },
    select: { id: true },
  });
  const unknownOpStatus = await tx.cmdbStatus.findFirst({
    where: { tenantId, statusType: 'operational', statusKey: 'unknown' },
    select: { id: true },
  });
  if (!inServiceStatus || !unknownOpStatus) {
    throw new Error(
      `Tenant ${tenantId} is missing seeded statuses (in_service / unknown). Run packages/db/scripts/seed-existing-tenants-cmdb-ref.ts.`,
    );
  }

  // Allocate next ciNumber under tenant-scoped advisory lock (same
  // pattern as cmdb.service.ts createCI)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_ci_seq'))`;
  const result = await tx.$queryRaw<[{ next: bigint }]>`
    SELECT COALESCE(MAX("ciNumber"), 0) + 1 AS next
    FROM cmdb_configuration_items
    WHERE "tenantId" = ${tenantId}::uuid
  `;
  const ciNumber = Number(result[0].next);

  // Create the CI (Phase 7: FK-only — legacy type/status/environment writes removed)
  const ci = await tx.cmdbConfigurationItem.create({
    data: {
      tenantId,
      ciNumber,
      name: appName,
      // Phase 7: legacy type/status/environment removed — use FK ids exclusively
      classId: ciClass.id,
      lifecycleStatusId: inServiceStatus.id,
      operationalStatusId: unknownOpStatus.id,
      environmentId: prodEnv?.id ?? null,
      sourceSystem: 'apm-bridge',
      firstDiscoveredAt: new Date(),
    },
  });

  // Create the Application extension row with the back-ref
  await tx.cmdbCiApplication.create({
    data: {
      ciId: ci.id,
      tenantId,
      applicationId,
    },
  });

  // Wire the bridge
  await tx.application.update({
    where: { id: applicationId },
    data: { primaryCiId: ci.id },
  });

  // Audit
  await tx.applicationActivity.create({
    data: {
      tenantId,
      applicationId,
      actorId: userId,
      activityType: 'PRIMARY_CI_CREATED',
      metadata: { ciId: ci.id, ciNumber, ciName: ci.name } as any,
    },
  });

  return ci;
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
            select: { id: true, name: true, type: true, status: true, criticality: true },
          },
        },
      },
      dependents: {
        include: {
          sourceApplication: {
            select: { id: true, name: true, type: true, status: true, criticality: true },
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
      'supportNotes',
      'specialNotes',
      'osRequirements',
      'vendorContact',
      'licenseInfo',
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
        ...(data.supportNotes !== undefined && { supportNotes: data.supportNotes }),
        ...(data.specialNotes !== undefined && { specialNotes: data.specialNotes }),
        ...(data.osRequirements !== undefined && { osRequirements: data.osRequirements }),
        ...(data.vendorContact !== undefined && { vendorContact: data.vendorContact }),
        ...(data.licenseInfo !== undefined && { licenseInfo: data.licenseInfo }),
        ...(data.primaryCiId !== undefined && { primaryCiId: data.primaryCiId }),
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

// ─── APM ↔ CMDB Bridge ────────────────────────────────────────────────────────

/**
 * Compute days until cert expiry. Negative when already expired.
 */
function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export type CertStatus = 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'NOTICE' | 'OK';

/**
 * Bucket a daysUntilExpiry value into the canonical 5-state status used
 * everywhere in the bridge UI + worker. Boundaries:
 *   <0  → EXPIRED
 *   <7  → CRITICAL
 *   <30 → WARNING
 *   <60 → NOTICE
 *   >=60 → OK
 */
export function certStatusFor(daysUntilExpiry: number | null): CertStatus | null {
  if (daysUntilExpiry === null) return null;
  if (daysUntilExpiry < 0) return 'EXPIRED';
  if (daysUntilExpiry < 7) return 'CRITICAL';
  if (daysUntilExpiry < 30) return 'WARNING';
  if (daysUntilExpiry < 60) return 'NOTICE';
  return 'OK';
}

export interface InfrastructureEndpoint {
  ciId: string;
  ciNumber: number;
  name: string;
  endpointType: string;
  protocol: string | null;
  port: number | null;
  url: string | null;
  dnsName: string | null;
  tlsRequired: boolean;
  certificateExpiryDate: string | null;
  certificateIssuer: string | null;
  daysUntilExpiry: number | null;
  status: CertStatus | null;
}

export interface InfrastructureNetworkPort {
  ciId: string;
  ciName: string;
  source: 'endpoint' | 'database' | 'network_device';
  protocol: string | null;
  port: number | null;
  address: string | null;
}

export interface ApmOwnerCard {
  id: string;
  displayName: string;
  email: string;
}

export interface ApplicationInfrastructure {
  primaryCi: {
    id: string;
    ciNumber: number;
    name: string;
    classKey: string | null;
    className: string | null;
    businessOwner: ApmOwnerCard | null;
    technicalOwner: ApmOwnerCard | null;
    supportGroup: { id: string; name: string } | null;
  } | null;
  cisByClass: Record<string, InfrastructureCi[]>;
  endpoints: InfrastructureEndpoint[];
  networkPorts: InfrastructureNetworkPort[];
  environments: Array<{
    environmentId: string | null;
    envKey: string | null;
    envName: string | null;
    ciId: string;
    ciName: string;
  }>;
}

export interface InfrastructureCi {
  ciId: string;
  ciNumber: number;
  name: string;
  classKey: string | null;
  className: string | null;
  environment: { id: string; envKey: string; envName: string } | null;
  hostname: string | null;
  ipAddress: string | null;
  status: string;
  // Class-specific extension data (only one will be populated per CI)
  server: {
    osType: string | null;
    osVersion: string | null;
    cpuCores: number | null;
    memoryGb: number | null;
    virtualizationPlatform: string | null;
    isVirtual: boolean;
  } | null;
  database: {
    engine: string;
    version: string | null;
    port: number | null;
    encryptionEnabled: boolean;
    containsSensitiveData: boolean;
  } | null;
  cloudResource: {
    provider: string;
    region: string | null;
    accountId: string | null;
    resourceType: string | null;
  } | null;
  networkDevice: {
    deviceType: string;
    managementIp: string | null;
    macAddress: string | null;
    rackLocation: string | null;
  } | null;
  endpoint: {
    url: string | null;
    protocol: string | null;
    port: number | null;
    certificateExpiryDate: string | null;
    daysUntilExpiry: number | null;
  } | null;
  // Direction of relationship from primary CI's perspective
  relationship: {
    type: string;
    direction: 'outgoing' | 'incoming';
  };
}

/**
 * Composite loader used by the Infrastructure / Support / Network /
 * Certificates tabs on the Application detail page. Walks one hop from
 * `Application.primaryCiId` through CmdbRelationship and groups the
 * related CIs by class.
 *
 * Tenant isolation: every prisma query filters by tenantId. The
 * relationship walk also filters by tenantId — this prevents cross-tenant
 * leakage even if a stray CI id were somehow injected.
 */
export async function getApplicationInfrastructure(
  tenantId: string,
  applicationId: string,
): Promise<ApplicationInfrastructure | null> {
  const app = await prisma.application.findFirst({
    where: { id: applicationId, tenantId },
    select: {
      id: true,
      primaryCiId: true,
    },
  });
  if (!app) return null;

  if (!app.primaryCiId) {
    return {
      primaryCi: null,
      cisByClass: {},
      endpoints: [],
      networkPorts: [],
      environments: [],
    };
  }

  // Load primary CI with owner relations.
  // Cast to any: @meridian/db exports prisma as the base PrismaClient type
  // so include narrowing isn't carried through; matches existing pattern
  // in this file (see getApp).
  const primaryCi: any = await prisma.cmdbConfigurationItem.findFirst({
    where: { id: app.primaryCiId, tenantId },
    include: {
      ciClass: { select: { classKey: true, className: true } },
      businessOwner: {
        select: { id: true, firstName: true, lastName: true, displayName: true, email: true },
      },
      technicalOwner: {
        select: { id: true, firstName: true, lastName: true, displayName: true, email: true },
      },
      supportGroup: { select: { id: true, name: true } },
    },
  });
  if (!primaryCi) {
    return {
      primaryCi: null,
      cisByClass: {},
      endpoints: [],
      networkPorts: [],
      environments: [],
    };
  }

  // Walk relationships in BOTH directions, scoped by tenantId
  const rels = await prisma.cmdbRelationship.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [{ sourceId: primaryCi.id }, { targetId: primaryCi.id }],
    },
    select: {
      sourceId: true,
      targetId: true,
      relationshipType: true,
    },
  });

  // Determine the related CI ids and the direction relative to primary
  const relatedCiIds = new Set<string>();
  const directionByCiId = new Map<string, { type: string; direction: 'outgoing' | 'incoming' }>();
  for (const rel of rels) {
    if (rel.sourceId === primaryCi.id) {
      relatedCiIds.add(rel.targetId);
      if (!directionByCiId.has(rel.targetId)) {
        directionByCiId.set(rel.targetId, { type: rel.relationshipType, direction: 'outgoing' });
      }
    } else {
      relatedCiIds.add(rel.sourceId);
      if (!directionByCiId.has(rel.sourceId)) {
        directionByCiId.set(rel.sourceId, { type: rel.relationshipType, direction: 'incoming' });
      }
    }
  }

  // Load related CIs with class + extensions, all tenant-scoped
  const relatedCis = relatedCiIds.size
    ? await prisma.cmdbConfigurationItem.findMany({
        where: {
          tenantId,
          id: { in: Array.from(relatedCiIds) },
          isDeleted: false,
        },
        include: {
          ciClass: { select: { classKey: true, className: true } },
          cmdbEnvironment: { select: { id: true, envKey: true, envName: true } },
          serverExt: true,
          databaseExt: true,
          cloudResourceExt: true,
          networkDeviceExt: true,
          endpointExt: true,
        },
      })
    : [];

  // Shape into InfrastructureCi
  const shapedCis: InfrastructureCi[] = relatedCis.map((ci) => {
    const dir = directionByCiId.get(ci.id)!;
    const endpointDays = daysUntil(ci.endpointExt?.certificateExpiryDate);
    return {
      ciId: ci.id,
      ciNumber: ci.ciNumber,
      name: ci.name,
      classKey: ci.ciClass?.classKey ?? null,
      className: ci.ciClass?.className ?? null,
      environment: ci.cmdbEnvironment
        ? {
            id: ci.cmdbEnvironment.id,
            envKey: ci.cmdbEnvironment.envKey,
            envName: ci.cmdbEnvironment.envName,
          }
        : null,
      hostname: ci.hostname,
      ipAddress: ci.ipAddress,
      status: ci.status as unknown as string,
      server: ci.serverExt
        ? {
            osType: ci.serverExt.operatingSystem ?? null,
            osVersion: ci.serverExt.osVersion ?? null,
            cpuCores: ci.serverExt.cpuCount ?? null,
            memoryGb: ci.serverExt.memoryGb ?? null,
            virtualizationPlatform: ci.serverExt.virtualizationPlatform ?? null,
            isVirtual: Boolean(ci.serverExt.virtualizationPlatform),
          }
        : null,
      database: ci.databaseExt
        ? {
            engine: ci.databaseExt.dbEngine,
            version: ci.databaseExt.dbVersion,
            port: ci.databaseExt.port,
            encryptionEnabled: ci.databaseExt.encryptionEnabled,
            containsSensitiveData: ci.databaseExt.containsSensitiveData,
          }
        : null,
      cloudResource: ci.cloudResourceExt
        ? {
            provider: ci.cloudResourceExt.cloudProvider,
            region: ci.cloudResourceExt.region,
            accountId: ci.cloudResourceExt.accountId,
            resourceType: ci.cloudResourceExt.resourceType,
          }
        : null,
      networkDevice: ci.networkDeviceExt
        ? {
            deviceType: ci.networkDeviceExt.deviceType,
            managementIp: ci.networkDeviceExt.managementIp,
            macAddress: ci.networkDeviceExt.macAddress,
            rackLocation: ci.networkDeviceExt.rackLocation,
          }
        : null,
      endpoint: ci.endpointExt
        ? {
            url: ci.endpointExt.url,
            protocol: ci.endpointExt.protocol,
            port: ci.endpointExt.port,
            certificateExpiryDate: ci.endpointExt.certificateExpiryDate
              ? ci.endpointExt.certificateExpiryDate.toISOString()
              : null,
            daysUntilExpiry: endpointDays,
          }
        : null,
      relationship: dir,
    };
  });

  // Group by classKey
  const cisByClass: Record<string, InfrastructureCi[]> = {};
  for (const ci of shapedCis) {
    const key = ci.classKey ?? 'unknown';
    (cisByClass[key] ||= []).push(ci);
  }

  // Flat endpoints list with cert info
  const endpoints: InfrastructureEndpoint[] = relatedCis
    .filter((ci) => ci.endpointExt)
    .map((ci) => {
      const days = daysUntil(ci.endpointExt!.certificateExpiryDate);
      return {
        ciId: ci.id,
        ciNumber: ci.ciNumber,
        name: ci.name,
        endpointType: ci.endpointExt!.endpointType,
        protocol: ci.endpointExt!.protocol,
        port: ci.endpointExt!.port,
        url: ci.endpointExt!.url,
        dnsName: ci.endpointExt!.dnsName,
        tlsRequired: ci.endpointExt!.tlsRequired,
        certificateExpiryDate: ci.endpointExt!.certificateExpiryDate
          ? ci.endpointExt!.certificateExpiryDate.toISOString()
          : null,
        certificateIssuer: ci.endpointExt!.certificateIssuer,
        daysUntilExpiry: days,
        status: certStatusFor(days),
      };
    });

  // Network ports — flat list across endpoint + database + network device
  const networkPorts: InfrastructureNetworkPort[] = [];
  for (const ci of relatedCis) {
    if (ci.endpointExt && ci.endpointExt.port) {
      networkPorts.push({
        ciId: ci.id,
        ciName: ci.name,
        source: 'endpoint',
        protocol: ci.endpointExt.protocol,
        port: ci.endpointExt.port,
        address: ci.endpointExt.dnsName ?? ci.endpointExt.url,
      });
    }
    if (ci.databaseExt && ci.databaseExt.port) {
      networkPorts.push({
        ciId: ci.id,
        ciName: ci.name,
        source: 'database',
        protocol: 'tcp',
        port: ci.databaseExt.port,
        address: ci.hostname,
      });
    }
    if (ci.networkDeviceExt && ci.networkDeviceExt.managementIp) {
      networkPorts.push({
        ciId: ci.id,
        ciName: ci.name,
        source: 'network_device',
        protocol: null,
        port: null,
        address: ci.networkDeviceExt.managementIp,
      });
    }
  }

  // Environments — every CmdbCiApplication record sharing this
  // applicationId represents another deployed instance (dev/test/prod)
  const envInstances = await prisma.cmdbCiApplication.findMany({
    where: { tenantId, applicationId },
    include: {
      ci: {
        select: {
          id: true,
          name: true,
          cmdbEnvironment: { select: { id: true, envKey: true, envName: true } },
        },
      },
    },
  });
  const environments = envInstances.map((row) => ({
    environmentId: row.ci.cmdbEnvironment?.id ?? null,
    envKey: row.ci.cmdbEnvironment?.envKey ?? null,
    envName: row.ci.cmdbEnvironment?.envName ?? null,
    ciId: row.ci.id,
    ciName: row.ci.name,
  }));

  return {
    primaryCi: {
      id: primaryCi.id,
      ciNumber: primaryCi.ciNumber,
      name: primaryCi.name,
      classKey: primaryCi.ciClass?.classKey ?? null,
      className: primaryCi.ciClass?.className ?? null,
      businessOwner: ownerCard(primaryCi.businessOwner),
      technicalOwner: ownerCard(primaryCi.technicalOwner),
      supportGroup: primaryCi.supportGroup
        ? { id: primaryCi.supportGroup.id, name: primaryCi.supportGroup.name }
        : null,
    },
    cisByClass,
    endpoints,
    networkPorts,
    environments,
  };
}

/**
 * Format a User row into a compact owner card. Uses displayName if set,
 * otherwise falls back to "firstName lastName".
 */
function ownerCard(
  user: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
    email: string;
  } | null,
): ApmOwnerCard | null {
  if (!user) return null;
  const name = user.displayName?.trim() || `${user.firstName} ${user.lastName}`.trim();
  return { id: user.id, displayName: name, email: user.email };
}

export interface SslCertificateRow {
  applicationId: string;
  applicationName: string;
  ciId: string;
  ciName: string;
  url: string | null;
  certificateExpiryDate: string;
  certificateIssuer: string | null;
  daysUntilExpiry: number;
  status: CertStatus;
}

/**
 * Tenant-wide SSL certificate dashboard. Walks every Application's
 * primary CI to find endpoint CIs with cert expiry data, returns a flat
 * list sorted by daysUntilExpiry ASC.
 *
 * Tenant isolation: outer query filters by tenantId; every relationship
 * walk inherits the tenant scope.
 */
export async function getApplicationSslCertificates(
  tenantId: string,
): Promise<SslCertificateRow[]> {
  const apps = await prisma.application.findMany({
    where: { tenantId, primaryCiId: { not: null } },
    select: { id: true, name: true, primaryCiId: true },
  });

  const rows: SslCertificateRow[] = [];

  for (const app of apps) {
    if (!app.primaryCiId) continue;
    // Walk relationships from this app's primary CI
    const rels = await prisma.cmdbRelationship.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [{ sourceId: app.primaryCiId }, { targetId: app.primaryCiId }],
      },
      select: { sourceId: true, targetId: true },
    });
    const relatedIds = new Set<string>();
    for (const r of rels) {
      relatedIds.add(r.sourceId === app.primaryCiId ? r.targetId : r.sourceId);
    }
    if (!relatedIds.size) continue;

    const endpoints = await prisma.cmdbCiEndpoint.findMany({
      where: {
        tenantId,
        ciId: { in: Array.from(relatedIds) },
        certificateExpiryDate: { not: null },
      },
      include: {
        ci: { select: { id: true, name: true, isDeleted: true } },
      },
    });

    for (const ep of endpoints) {
      if (ep.ci.isDeleted) continue;
      const days = daysUntil(ep.certificateExpiryDate)!;
      rows.push({
        applicationId: app.id,
        applicationName: app.name,
        ciId: ep.ci.id,
        ciName: ep.ci.name,
        url: ep.url,
        certificateExpiryDate: ep.certificateExpiryDate!.toISOString(),
        certificateIssuer: ep.certificateIssuer,
        daysUntilExpiry: days,
        status: certStatusFor(days)!,
      });
    }
  }

  rows.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  return rows;
}

/**
 * Manually point Application.primaryCiId at an existing CI. Used when
 * an admin wants to swap the bridge target (e.g. moved from one CMDB CI
 * to another). Verifies BOTH the Application AND the target CI belong to
 * the calling tenant before updating.
 */
export async function linkCiToApplication(
  tenantId: string,
  applicationId: string,
  ciId: string,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.application.findFirst({
      where: { id: applicationId, tenantId },
      select: { id: true, primaryCiId: true },
    });
    if (!app) throw new Error('Application not found');

    const ci = await tx.cmdbConfigurationItem.findFirst({
      where: { id: ciId, tenantId },
      select: { id: true, name: true },
    });
    if (!ci) throw new Error('CI not found in this tenant');

    // Sync the back-ref on the extension row if one exists
    const ext = await tx.cmdbCiApplication.findUnique({ where: { ciId: ci.id } });
    if (ext) {
      await tx.cmdbCiApplication.update({
        where: { ciId: ci.id },
        data: { applicationId },
      });
    }

    const updated = await tx.application.update({
      where: { id: applicationId },
      data: { primaryCiId: ci.id },
    });

    await tx.applicationActivity.create({
      data: {
        tenantId,
        applicationId,
        actorId: userId,
        activityType: 'PRIMARY_CI_LINKED',
        fieldName: 'primaryCiId',
        oldValue: app.primaryCiId,
        newValue: ci.id,
        metadata: { ciId: ci.id, ciName: ci.name } as any,
      },
    });

    return updated;
  });
}

/**
 * Create a primary CI for an existing Application that lacks one.
 * Used by the yellow "Create Primary CI" banner on the detail page.
 * Same logic as the bridge step inside createApp, but standalone for
 * existing rows (e.g. created before the bridge feature shipped, or
 * created in a tenant that was missing the CMDB seed at create time).
 */
export async function createPrimaryCiForApplication(
  tenantId: string,
  applicationId: string,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.application.findFirst({
      where: { id: applicationId, tenantId },
      select: { id: true, name: true, primaryCiId: true },
    });
    if (!app) throw new Error('Application not found');
    if (app.primaryCiId) {
      throw new Error('Application already has a primary CI');
    }

    const ci = await createPrimaryCiInternal(tx, tenantId, app.id, app.name, userId);
    if (!ci) {
      throw new Error(
        "Tenant is missing the 'application_instance' CMDB seed — cannot create primary CI",
      );
    }
    return ci;
  });
}
