import { prisma } from '@meridian/db';
import {
  resolveLifecycleStatusId,
  resolveRelationshipTypeId,
} from './cmdb-reference-resolver.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateCIData {
  name: string;
  displayName?: string;

  // New reference table FKs (Phase 7 — legacy type/status/environment removed)
  classId?: string;
  lifecycleStatusId?: string;
  operationalStatusId?: string;
  environmentId?: string;

  // Organization
  categoryId?: string;
  assetId?: string;
  agentId?: string;
  siteId?: string;

  // Network & Hardware
  hostname?: string;
  fqdn?: string;
  ipAddress?: string;
  serialNumber?: string;
  assetTag?: string;
  externalId?: string;

  // Product Info
  manufacturerId?: string;
  model?: string;
  version?: string;
  edition?: string;

  // Ownership
  ownerId?: string;
  businessOwnerId?: string;
  technicalOwnerId?: string;
  supportGroupId?: string;

  // Security Classification
  criticality?: string;
  confidentialityClass?: string;
  integrityClass?: string;
  availabilityClass?: string;

  // Governance
  installDate?: string;
  sourceSystem?: string;
  sourceRecordKey?: string;
  sourceOfTruth?: boolean;
  reconciliationRank?: number;

  // Flexible
  attributesJson?: Record<string, unknown>;

  // Extension data (optional, based on class)
  serverExt?: ServerExtData;
  applicationExt?: ApplicationExtData;
  databaseExt?: DatabaseExtData;
  networkDeviceExt?: NetworkDeviceExtData;
  cloudResourceExt?: CloudResourceExtData;
  endpointExt?: EndpointExtData;
  serviceExt?: ServiceExtData;
}

export interface UpdateCIData extends Partial<CreateCIData> {
  // Phase 7: legacy type/status/environment fields removed — use FK ids instead
  isDeleted?: boolean;
}

export interface CIListFilters {
  type?: string;
  status?: string;
  environment?: string;
  classId?: string;
  lifecycleStatusId?: string;
  environmentId?: string;
  categoryId?: string;
  criticality?: string;
  manufacturerId?: string;
  supportGroupId?: string;
  staleness?: 'fresh' | 'stale' | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateRelationshipData {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  relationshipTypeId?: string;
  description?: string;
  sourceSystem?: string;
  sourceRecordKey?: string;
  confidenceScore?: number;
  isDiscovered?: boolean;
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
  hostname?: string | null;
  criticality?: string | null;
  classId?: string | null;
}

// Extension data interfaces
export interface ServerExtData {
  serverType: string;
  operatingSystem?: string;
  osVersion?: string;
  cpuCount?: number;
  memoryGb?: number;
  storageGb?: number;
  domainName?: string;
  virtualizationPlatform?: string;
  hypervisorHostCiId?: string;
  backupRequired?: boolean;
  backupPolicy?: string;
  patchGroup?: string;
  antivirusStatus?: string;
}

export interface ApplicationExtData {
  applicationId?: string;
  applicationType?: string;
  installType?: string;
  businessFunction?: string;
  repoUrl?: string;
  documentationUrl?: string;
  primaryLanguage?: string;
  runtimePlatform?: string;
  authenticationMethod?: string;
  internetFacing?: boolean;
  complianceScope?: string;
}

export interface DatabaseExtData {
  dbEngine: string;
  dbVersion?: string;
  instanceName?: string;
  port?: number;
  collationName?: string;
  backupRequired?: boolean;
  backupFrequency?: string;
  encryptionEnabled?: boolean;
  containsSensitiveData?: boolean;
}

export interface NetworkDeviceExtData {
  deviceType: string;
  firmwareVersion?: string;
  managementIp?: string;
  macAddress?: string;
  rackLocation?: string;
  haRole?: string;
  supportContractRef?: string;
}

export interface CloudResourceExtData {
  cloudProvider: string;
  accountId?: string;
  subscriptionId?: string;
  cloudTenantId?: string;
  region?: string;
  resourceGroup?: string;
  resourceType?: string;
  nativeResourceId?: string;
  tagsJson?: Record<string, unknown>;
}

export interface EndpointExtData {
  endpointType: string;
  protocol?: string;
  port?: number;
  url?: string;
  dnsName?: string;
  certificateExpiryDate?: string;
  certificateIssuer?: string;
  tlsRequired?: boolean;
}

export interface ServiceExtData {
  serviceType: string;
  serviceTier?: string;
  slaName?: string;
  availabilityTarget?: number;
  rtoMinutes?: number;
  rpoMinutes?: number;
  customerScope?: string;
  serviceUrl?: string;
}

// ─── CI CRUD ──────────────────────────────────────────────────────────────────

/**
 * Create a CI with a sequential, tenant-scoped ciNumber.
 * Uses advisory lock to prevent duplicate ciNumbers under concurrent load.
 */
export async function createCI(tenantId: string, data: CreateCIData, userId: string) {
  // Phase 7 (CREF-01): classId is required at the service layer
  // (defense-in-depth before DB NOT NULL lands in Plan 06).
  if (!data.classId) {
    throw new Error(
      'classId is required. Call GET /api/v1/cmdb/classes to fetch the seeded class list.',
    );
  }

  return prisma.$transaction(async (tx) => {
    // Get next ciNumber atomically with advisory lock
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
        name: data.name,
        displayName: data.displayName,
        // Phase 7: legacy type/status/environment enum writes removed — FK-only
        // New reference table FKs
        classId: data.classId,
        lifecycleStatusId: data.lifecycleStatusId,
        operationalStatusId: data.operationalStatusId,
        environmentId: data.environmentId,
        // Organization
        categoryId: data.categoryId,
        assetId: data.assetId,
        agentId: data.agentId,
        siteId: data.siteId,
        // Network & Hardware
        hostname: data.hostname,
        fqdn: data.fqdn,
        ipAddress: data.ipAddress,
        serialNumber: data.serialNumber,
        assetTag: data.assetTag,
        externalId: data.externalId,
        // Product Info
        manufacturerId: data.manufacturerId,
        model: data.model,
        version: data.version,
        edition: data.edition,
        // Ownership
        ownerId: data.ownerId,
        businessOwnerId: data.businessOwnerId,
        technicalOwnerId: data.technicalOwnerId,
        supportGroupId: data.supportGroupId,
        // Security Classification
        criticality: data.criticality,
        confidentialityClass: data.confidentialityClass,
        integrityClass: data.integrityClass,
        availabilityClass: data.availabilityClass,
        // Governance
        installDate: data.installDate ? new Date(data.installDate) : undefined,
        firstDiscoveredAt: new Date(),
        sourceSystem: data.sourceSystem ?? 'manual',
        sourceRecordKey: data.sourceRecordKey,
        sourceOfTruth: data.sourceOfTruth ?? false,
        reconciliationRank: data.reconciliationRank ?? 100,
        // Flexible
        attributesJson: (data.attributesJson ?? undefined) as never,
      },
    });

    // Create extension records based on class
    await createExtensionRecords(tx, tenantId, ci.id, data);

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
 * Create extension table records based on the CI data provided.
 */
async function createExtensionRecords(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  tenantId: string,
  ciId: string,
  data: CreateCIData,
) {
  if (data.serverExt) {
    await tx.cmdbCiServer.create({
      data: {
        ciId,
        tenantId,
        serverType: data.serverExt.serverType,
        operatingSystem: data.serverExt.operatingSystem,
        osVersion: data.serverExt.osVersion,
        cpuCount: data.serverExt.cpuCount,
        memoryGb: data.serverExt.memoryGb,
        storageGb: data.serverExt.storageGb,
        domainName: data.serverExt.domainName,
        virtualizationPlatform: data.serverExt.virtualizationPlatform,
        hypervisorHostCiId: data.serverExt.hypervisorHostCiId,
        backupRequired: data.serverExt.backupRequired ?? false,
        backupPolicy: data.serverExt.backupPolicy,
        patchGroup: data.serverExt.patchGroup,
        antivirusStatus: data.serverExt.antivirusStatus,
      },
    });
  }

  if (data.applicationExt) {
    await tx.cmdbCiApplication.create({
      data: {
        ciId,
        tenantId,
        applicationId: data.applicationExt.applicationId,
        applicationType: data.applicationExt.applicationType,
        installType: data.applicationExt.installType,
        businessFunction: data.applicationExt.businessFunction,
        repoUrl: data.applicationExt.repoUrl,
        documentationUrl: data.applicationExt.documentationUrl,
        primaryLanguage: data.applicationExt.primaryLanguage,
        runtimePlatform: data.applicationExt.runtimePlatform,
        authenticationMethod: data.applicationExt.authenticationMethod,
        internetFacing: data.applicationExt.internetFacing ?? false,
        complianceScope: data.applicationExt.complianceScope,
      },
    });
  }

  if (data.databaseExt) {
    await tx.cmdbCiDatabase.create({
      data: {
        ciId,
        tenantId,
        dbEngine: data.databaseExt.dbEngine,
        dbVersion: data.databaseExt.dbVersion,
        instanceName: data.databaseExt.instanceName,
        port: data.databaseExt.port,
        collationName: data.databaseExt.collationName,
        backupRequired: data.databaseExt.backupRequired ?? true,
        backupFrequency: data.databaseExt.backupFrequency,
        encryptionEnabled: data.databaseExt.encryptionEnabled ?? false,
        containsSensitiveData: data.databaseExt.containsSensitiveData ?? false,
      },
    });
  }

  if (data.networkDeviceExt) {
    await tx.cmdbCiNetworkDevice.create({
      data: {
        ciId,
        tenantId,
        deviceType: data.networkDeviceExt.deviceType,
        firmwareVersion: data.networkDeviceExt.firmwareVersion,
        managementIp: data.networkDeviceExt.managementIp,
        macAddress: data.networkDeviceExt.macAddress,
        rackLocation: data.networkDeviceExt.rackLocation,
        haRole: data.networkDeviceExt.haRole,
        supportContractRef: data.networkDeviceExt.supportContractRef,
      },
    });
  }

  if (data.cloudResourceExt) {
    await tx.cmdbCiCloudResource.create({
      data: {
        ciId,
        tenantId,
        cloudProvider: data.cloudResourceExt.cloudProvider,
        accountId: data.cloudResourceExt.accountId,
        subscriptionId: data.cloudResourceExt.subscriptionId,
        cloudTenantId: data.cloudResourceExt.cloudTenantId,
        region: data.cloudResourceExt.region,
        resourceGroup: data.cloudResourceExt.resourceGroup,
        resourceType: data.cloudResourceExt.resourceType,
        nativeResourceId: data.cloudResourceExt.nativeResourceId,
        tagsJson: (data.cloudResourceExt.tagsJson ?? undefined) as never,
      },
    });
  }

  if (data.endpointExt) {
    await tx.cmdbCiEndpoint.create({
      data: {
        ciId,
        tenantId,
        endpointType: data.endpointExt.endpointType,
        protocol: data.endpointExt.protocol,
        port: data.endpointExt.port,
        url: data.endpointExt.url,
        dnsName: data.endpointExt.dnsName,
        certificateExpiryDate: data.endpointExt.certificateExpiryDate
          ? new Date(data.endpointExt.certificateExpiryDate)
          : undefined,
        certificateIssuer: data.endpointExt.certificateIssuer,
        tlsRequired: data.endpointExt.tlsRequired ?? false,
      },
    });
  }

  if (data.serviceExt) {
    await tx.cmdbService.create({
      data: {
        ciId,
        tenantId,
        serviceType: data.serviceExt.serviceType,
        serviceTier: data.serviceExt.serviceTier,
        slaName: data.serviceExt.slaName,
        availabilityTarget: data.serviceExt.availabilityTarget,
        rtoMinutes: data.serviceExt.rtoMinutes,
        rpoMinutes: data.serviceExt.rpoMinutes,
        customerScope: data.serviceExt.customerScope,
        serviceUrl: data.serviceExt.serviceUrl,
      },
    });
  }
}

/**
 * Get a CI by ID scoped to tenant, including all relations and extension data.
 */
export async function getCI(tenantId: string, ciId: string) {
  return prisma.cmdbConfigurationItem.findFirst({
    where: { id: ciId, tenantId },
    include: {
      category: true,
      ciClass: true,
      lifecycleStatus: true,
      operationalStatus: true,
      cmdbEnvironment: true,
      manufacturer: true,
      asset: { select: { id: true, assetTag: true, serialNumber: true, manufacturer: true, model: true, status: true, purchaseCost: true, warrantyExpiry: true } },
      supportGroup: { select: { id: true, name: true, email: true } },
      businessOwner: { select: { id: true, firstName: true, lastName: true, email: true, displayName: true } },
      technicalOwner: { select: { id: true, firstName: true, lastName: true, email: true, displayName: true } },
      // Extension tables
      serverExt: true,
      applicationExt: { include: { application: { select: { id: true, name: true, type: true, status: true } } } },
      databaseExt: true,
      networkDeviceExt: true,
      cloudResourceExt: true,
      endpointExt: true,
      serviceExt: true,
      // Relationships
      sourceRels: {
        where: { isActive: true },
        include: {
          target: { select: { id: true, name: true, type: true, status: true, hostname: true, criticality: true, classId: true, ciNumber: true } },
          relationshipTypeRef: true,
        },
      },
      targetRels: {
        where: { isActive: true },
        include: {
          source: { select: { id: true, name: true, type: true, status: true, hostname: true, criticality: true, classId: true, ciNumber: true } },
          relationshipTypeRef: true,
        },
      },
      // Audit
      changeRecords: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      // Legacy ticket links (during migration)
      ticketLinks: {
        include: {
          ticket: { select: { id: true, title: true, ticketNumber: true, type: true, status: true } },
        },
      },
      // New ITSM links
      cmdbChangeLinks: {
        include: {
          change: { select: { id: true, changeNumber: true, title: true, type: true, status: true } },
        },
      },
      cmdbIncidentLinks: {
        include: {
          ticket: { select: { id: true, ticketNumber: true, title: true, type: true, priority: true, status: true } },
        },
      },
      cmdbProblemLinks: {
        include: {
          ticket: { select: { id: true, ticketNumber: true, title: true, type: true, priority: true, status: true } },
        },
      },
      // Governance
      attestations: {
        orderBy: { attestedAt: 'desc' },
        take: 10,
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
  const where: Record<string, unknown> = {
    tenantId,
    isDeleted: false,
  };

  // Legacy enum filters
  if (filters.type) where['type'] = filters.type;
  if (filters.status) where['status'] = filters.status;
  if (filters.environment) where['environment'] = filters.environment;

  // New reference table filters
  if (filters.classId) where['classId'] = filters.classId;
  if (filters.lifecycleStatusId) where['lifecycleStatusId'] = filters.lifecycleStatusId;
  if (filters.environmentId) where['environmentId'] = filters.environmentId;
  if (filters.criticality) where['criticality'] = filters.criticality;
  if (filters.manufacturerId) where['manufacturerId'] = filters.manufacturerId;
  if (filters.supportGroupId) where['supportGroupId'] = filters.supportGroupId;
  if (filters.categoryId) where['categoryId'] = filters.categoryId;

  // Staleness filter
  if (filters.staleness === 'stale') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    where['OR'] = [
      { lastVerifiedAt: null, lastSeenAt: null },
      { lastVerifiedAt: { lt: thirtyDaysAgo }, lastSeenAt: { lt: thirtyDaysAgo } },
      { lastVerifiedAt: null, lastSeenAt: { lt: thirtyDaysAgo } },
      { lastVerifiedAt: { lt: thirtyDaysAgo }, lastSeenAt: null },
    ];
  } else if (filters.staleness === 'fresh') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    where['OR'] = [
      { lastVerifiedAt: { gte: thirtyDaysAgo } },
      { lastSeenAt: { gte: thirtyDaysAgo } },
    ];
  }

  // Search
  if (filters.search) {
    const searchConditions = [
      { name: { contains: filters.search, mode: 'insensitive' as const } },
      { hostname: { contains: filters.search, mode: 'insensitive' as const } },
      { fqdn: { contains: filters.search, mode: 'insensitive' as const } },
      { ipAddress: { contains: filters.search, mode: 'insensitive' as const } },
      { displayName: { contains: filters.search, mode: 'insensitive' as const } },
    ];

    // If there's already an OR from staleness filter, we need AND
    if (where['OR']) {
      where['AND'] = [{ OR: where['OR'] }, { OR: searchConditions }];
      delete where['OR'];
    } else {
      where['OR'] = searchConditions;
    }
  }

  const [data, total] = await Promise.all([
    prisma.cmdbConfigurationItem.findMany({
      where: where as never,
      include: {
        category: { select: { id: true, name: true } },
        ciClass: { select: { id: true, classKey: true, className: true, icon: true } },
        lifecycleStatus: { select: { id: true, statusKey: true, statusName: true } },
        operationalStatus: { select: { id: true, statusKey: true, statusName: true } },
        cmdbEnvironment: { select: { id: true, envKey: true, envName: true } },
        manufacturer: { select: { id: true, name: true } },
        supportGroup: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.cmdbConfigurationItem.count({ where: where as never }),
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

    // Build update data object
    const updateData: Record<string, unknown> = {};

    const trackAndSet = (field: string, value: unknown) => {
      if (value !== undefined) {
        trackChange(field, (current as Record<string, unknown>)[field], value);
        updateData[field] = value;
      }
    };

    // All updatable fields
    trackAndSet('name', data.name);
    trackAndSet('displayName', data.displayName);
    // Phase 7: legacy type/status/environment trackAndSet calls removed — FK-only
    trackAndSet('classId', data.classId);
    trackAndSet('lifecycleStatusId', data.lifecycleStatusId);
    trackAndSet('operationalStatusId', data.operationalStatusId);
    trackAndSet('environmentId', data.environmentId);
    trackAndSet('categoryId', data.categoryId);
    trackAndSet('assetId', data.assetId);
    trackAndSet('agentId', data.agentId);
    trackAndSet('siteId', data.siteId);
    trackAndSet('hostname', data.hostname);
    trackAndSet('fqdn', data.fqdn);
    trackAndSet('ipAddress', data.ipAddress);
    trackAndSet('serialNumber', data.serialNumber);
    trackAndSet('assetTag', data.assetTag);
    trackAndSet('externalId', data.externalId);
    trackAndSet('manufacturerId', data.manufacturerId);
    trackAndSet('model', data.model);
    trackAndSet('version', data.version);
    trackAndSet('edition', data.edition);
    trackAndSet('ownerId', data.ownerId);
    trackAndSet('businessOwnerId', data.businessOwnerId);
    trackAndSet('technicalOwnerId', data.technicalOwnerId);
    trackAndSet('supportGroupId', data.supportGroupId);
    trackAndSet('criticality', data.criticality);
    trackAndSet('confidentialityClass', data.confidentialityClass);
    trackAndSet('integrityClass', data.integrityClass);
    trackAndSet('availabilityClass', data.availabilityClass);
    trackAndSet('sourceSystem', data.sourceSystem);
    trackAndSet('sourceRecordKey', data.sourceRecordKey);
    trackAndSet('sourceOfTruth', data.sourceOfTruth);
    trackAndSet('reconciliationRank', data.reconciliationRank);
    trackAndSet('isDeleted', data.isDeleted);

    if (data.installDate !== undefined) {
      trackChange('installDate', current.installDate, data.installDate);
      updateData['installDate'] = data.installDate ? new Date(data.installDate) : null;
    }

    if (data.attributesJson !== undefined) {
      trackChange('attributesJson', JSON.stringify(current.attributesJson), JSON.stringify(data.attributesJson));
      updateData['attributesJson'] = data.attributesJson;
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

    // Update extension records if provided
    if (data.serverExt) {
      await tx.cmdbCiServer.upsert({
        where: { ciId },
        create: { ciId, tenantId, ...data.serverExt },
        update: data.serverExt,
      });
    }
    if (data.applicationExt) {
      await tx.cmdbCiApplication.upsert({
        where: { ciId },
        create: { ciId, tenantId, ...data.applicationExt, internetFacing: data.applicationExt.internetFacing ?? false },
        update: data.applicationExt,
      });
    }
    if (data.databaseExt) {
      await tx.cmdbCiDatabase.upsert({
        where: { ciId },
        create: { ciId, tenantId, ...data.databaseExt, backupRequired: data.databaseExt.backupRequired ?? true, encryptionEnabled: data.databaseExt.encryptionEnabled ?? false, containsSensitiveData: data.databaseExt.containsSensitiveData ?? false },
        update: data.databaseExt,
      });
    }
    if (data.networkDeviceExt) {
      await tx.cmdbCiNetworkDevice.upsert({
        where: { ciId },
        create: { ciId, tenantId, ...data.networkDeviceExt },
        update: data.networkDeviceExt,
      });
    }
    if (data.cloudResourceExt) {
      await tx.cmdbCiCloudResource.upsert({
        where: { ciId },
        create: { ciId, tenantId, ...data.cloudResourceExt, tagsJson: (data.cloudResourceExt.tagsJson ?? undefined) as never },
        update: { ...data.cloudResourceExt, tagsJson: (data.cloudResourceExt.tagsJson ?? undefined) as never },
      });
    }
    if (data.endpointExt) {
      const certDate = data.endpointExt.certificateExpiryDate
        ? new Date(data.endpointExt.certificateExpiryDate)
        : undefined;
      await tx.cmdbCiEndpoint.upsert({
        where: { ciId },
        create: { ciId, tenantId, ...data.endpointExt, certificateExpiryDate: certDate, tlsRequired: data.endpointExt.tlsRequired ?? false },
        update: { ...data.endpointExt, certificateExpiryDate: certDate },
      });
    }
    if (data.serviceExt) {
      await tx.cmdbService.upsert({
        where: { ciId },
        create: { ciId, tenantId, ...data.serviceExt },
        update: data.serviceExt,
      });
    }

    if (Object.keys(updateData).length === 0 && !data.serverExt && !data.applicationExt && !data.databaseExt && !data.networkDeviceExt && !data.cloudResourceExt && !data.endpointExt && !data.serviceExt) {
      return current;
    }

    return tx.cmdbConfigurationItem.update({
      where: { id: ciId },
      data: updateData as never,
    });
  });
}

/**
 * Soft-delete a CI by setting isDeleted to true, and log the change.
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

    // Phase 7: Soft-delete using isDeleted flag + lifecycleStatusId='retired'
    // (replaces legacy status='DECOMMISSIONED' enum write).
    const retiredLifecycleId =
      (await resolveLifecycleStatusId(tenantId, 'retired')) ??
      (() => {
        throw new Error(
          `Tenant ${tenantId} is missing seeded lifecycle status 'retired' — run packages/db/scripts/seed-existing-tenants-cmdb-ref.ts`,
        );
      })();

    return tx.cmdbConfigurationItem.update({
      where: { id: ciId },
      data: {
        isDeleted: true,
        lifecycleStatusId: retiredLifecycleId,
      },
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
    prisma.cmdbConfigurationItem.findFirst({ where: { id: data.sourceId, tenantId, isDeleted: false } }),
    prisma.cmdbConfigurationItem.findFirst({ where: { id: data.targetId, tenantId, isDeleted: false } }),
  ]);

  if (!source) throw new Error('Source CI not found');
  if (!target) throw new Error('Target CI not found');

  // Phase 7 (CREF-04): resolve relationshipType key → FK when caller passes
  // only the legacy string form; throw when neither FK nor a resolvable key
  // is provided (defense-in-depth before the DB NOT NULL in Plan 06).
  let relationshipTypeId = data.relationshipTypeId;
  if (!relationshipTypeId && data.relationshipType) {
    relationshipTypeId =
      (await resolveRelationshipTypeId(
        tenantId,
        String(data.relationshipType).toLowerCase(),
      )) ?? undefined;
  }
  if (!relationshipTypeId) {
    throw new Error(
      'relationshipTypeId is required. Call GET /api/v1/cmdb/relationship-types to fetch the seeded list.',
    );
  }

  return prisma.cmdbRelationship.create({
    data: {
      tenantId,
      sourceId: data.sourceId,
      targetId: data.targetId,
      // Phase 7: legacy relationshipType enum write removed — FK-only
      relationshipTypeId,
      description: data.description,
      sourceSystem: data.sourceSystem,
      sourceRecordKey: data.sourceRecordKey,
      confidenceScore: data.confidenceScore,
      isDiscovered: data.isDiscovered ?? false,
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
      where: { sourceId: ciId, tenantId, isActive: true },
      include: {
        target: { select: { id: true, name: true, type: true, status: true, ciNumber: true, hostname: true, criticality: true, classId: true } },
        relationshipTypeRef: true,
      },
    }),
    prisma.cmdbRelationship.findMany({
      where: { targetId: ciId, tenantId, isActive: true },
      include: {
        source: { select: { id: true, name: true, type: true, status: true, ciNumber: true, hostname: true, criticality: true, classId: true } },
        relationshipTypeRef: true,
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
      WHERE r."sourceId" = ${rootCiId}::uuid AND r."tenantId" = ${tenantId}::uuid AND r."isActive" = true
      UNION ALL
      SELECT r."targetId", ig.depth + 1, r."relationshipType"::text, ig.path || r."targetId"
      FROM cmdb_relationships r
      INNER JOIN impact_graph ig ON r."sourceId" = ig."ciId"
      WHERE r."tenantId" = ${tenantId}::uuid AND r."isActive" = true AND ig.depth < ${depth} AND NOT (r."targetId" = ANY(ig.path))
    )
    SELECT DISTINCT ON ("ciId") "ciId", depth, "relationshipType" FROM impact_graph ORDER BY "ciId", depth LIMIT 10000
  `;

  // Upstream: what impacts this CI (traverses target -> source, reverse direction)
  const upstreamRows = await prisma.$queryRaw<ImpactGraphRow[]>`
    WITH RECURSIVE impact_graph AS (
      SELECT r."sourceId" AS "ciId", 1 AS depth, r."relationshipType"::text, ARRAY[${rootCiId}::uuid, r."sourceId"] AS path
      FROM cmdb_relationships r
      WHERE r."targetId" = ${rootCiId}::uuid AND r."tenantId" = ${tenantId}::uuid AND r."isActive" = true
      UNION ALL
      SELECT r."sourceId", ig.depth + 1, r."relationshipType"::text, ig.path || r."sourceId"
      FROM cmdb_relationships r
      INNER JOIN impact_graph ig ON r."targetId" = ig."ciId"
      WHERE r."tenantId" = ${tenantId}::uuid AND r."isActive" = true AND ig.depth < ${depth} AND NOT (r."sourceId" = ANY(ig.path))
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
          select: { id: true, name: true, type: true, status: true, ciNumber: true, hostname: true, criticality: true, classId: true },
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
        hostname: ci.hostname,
        criticality: ci.criticality,
        classId: ci.classId,
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
        hostname: ci.hostname,
        criticality: ci.criticality,
        classId: ci.classId,
      });
    }
  }

  return {
    rootCi,
    impacted,
    totalCount: impacted.length,
  };
}

// ─── Affected Applications (Blast Radius) ────────────────────────────────────

export interface AffectedApplication {
  applicationId: string;
  applicationName: string;
  criticality: string;
  status: string;
  viaPath: string;
  viaCiId: string | null;
  viaCiName: string | null;
  viaRelType: string | null;
  isDirect: boolean;
}

/**
 * Compute which Applications would be impacted if a CI became unavailable.
 *
 * 1. Direct: Applications whose primaryCiId points to this CI.
 * 2. 1-hop: CIs that DEPEND_ON / RUN_ON / etc. this CI, and those CIs are
 *    linked to Applications via primaryCiId.
 *
 * Returns deduplicated, sorted by direct-first then criticality.
 */
export async function getAffectedApplications(
  tenantId: string,
  ciId: string,
): Promise<AffectedApplication[]> {
  const CRIT_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

  // 1. Direct: apps whose primaryCiId = this CI
  const directApps = await prisma.application.findMany({
    where: { tenantId, primaryCiId: ciId },
    select: { id: true, name: true, criticality: true, status: true },
  });

  const seen = new Map<string, AffectedApplication>();
  for (const app of directApps) {
    seen.set(app.id, {
      applicationId: app.id,
      applicationName: app.name,
      criticality: app.criticality,
      status: app.status,
      viaPath: 'Direct link — this CI is the primary infrastructure record for this Application',
      viaCiId: null,
      viaCiName: null,
      viaRelType: null,
      isDirect: true,
    });
  }

  // 2. 1-hop incoming: CIs that depend on this CI
  const incomingRels = await prisma.cmdbRelationship.findMany({
    where: { targetId: ciId, tenantId, isActive: true },
    include: {
      source: { select: { id: true, name: true } },
      relationshipTypeRef: { select: { forwardLabel: true } },
    },
  });

  if (incomingRels.length > 0) {
    const sourceCiIds = incomingRels.map((r) => r.source.id);

    // Batch query: apps whose primaryCiId is one of the source CIs
    const hopApps = await prisma.application.findMany({
      where: { tenantId, primaryCiId: { in: sourceCiIds } },
      select: { id: true, name: true, criticality: true, status: true, primaryCiId: true },
    });

    // Map primaryCiId → relationship info for label building
    const relByCiId = new Map(incomingRels.map((r) => [r.source.id, r]));

    for (const app of hopApps) {
      if (seen.has(app.id)) continue; // direct link already captured
      const rel = relByCiId.get(app.primaryCiId!);
      if (!rel) continue;
      const relLabel = rel.relationshipTypeRef?.forwardLabel ?? rel.relationshipType;
      seen.set(app.id, {
        applicationId: app.id,
        applicationName: app.name,
        criticality: app.criticality,
        status: app.status,
        viaPath: `CI "${rel.source.name}" ${relLabel} this CI`,
        viaCiId: rel.source.id,
        viaCiName: rel.source.name,
        viaRelType: rel.relationshipType,
        isDirect: false,
      });
    }
  }

  return [...seen.values()].sort((a, b) => {
    if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1;
    return (CRIT_ORDER[a.criticality] ?? 9) - (CRIT_ORDER[b.criticality] ?? 9);
  });
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

// ─── CI Timeline ──────────────────────────────────────────────────────────────

export type CITimelineEntry =
  | {
      type: 'inventory_diff';
      id: string;
      collectedAt: Date;
      changedBy: 'AGENT';
      agentId: string;
      agentHostname: string | null;
      diff: unknown;
    }
  | {
      type: 'field_change';
      id: string;
      createdAt: Date;
      changeType: 'CREATED' | 'UPDATED' | 'DELETED';
      changedBy: 'USER' | 'AGENT' | 'IMPORT';
      agentId?: string;
      agentHostname?: string | null;
      userId?: string;
      userName?: string | null;
      fields: Array<{ fieldName: string | null; oldValue: string | null; newValue: string | null }>;
    };

export type CITimelineResult = {
  data: CITimelineEntry[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Unified timeline for a CI, merging CmdbChangeRecord field-change events
 * (grouped by actor within a 5-minute window) and InventoryDiff events.
 *
 * NOTE: Change record grouping is capped at 1000 rows fetched from the DB.
 * CIs with more than 1000 change records will have their oldest records
 * excluded from the grouped result set.
 */
export async function getCITimeline(
  tenantId: string,
  ciId: string,
  page: number = 1,
  pageSize: number = 25,
): Promise<CITimelineResult> {
  const CHANGE_RECORD_LIMIT = 1000;
  const GROUPING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  // Fetch raw change records (capped) and all inventory diffs in parallel
  const [rawChangeRecords, inventoryDiffs] = await Promise.all([
    prisma.cmdbChangeRecord.findMany({
      where: { ciId, tenantId },
      orderBy: { createdAt: 'asc' },
      take: CHANGE_RECORD_LIMIT,
    }),
    prisma.inventoryDiff.findMany({
      where: { ciId, tenantId },
      orderBy: { collectedAt: 'desc' },
    }),
  ]);

  // ── Group consecutive change records by actor within a 5-minute window ──────

  type RawChangeRecord = (typeof rawChangeRecords)[number];

  const groupedFieldChanges: Extract<CITimelineEntry, { type: 'field_change' }>[] = [];

  if (rawChangeRecords.length > 0) {
    // Determine the actor key for a record (prefer agentId, fall back to userId)
    const actorKey = (r: RawChangeRecord): string =>
      r.agentId ? `agent:${r.agentId}` : r.userId ? `user:${r.userId}` : 'unknown';

    let groupStart = 0;

    const flushGroup = (endExclusive: number) => {
      const slice = rawChangeRecords.slice(groupStart, endExclusive);
      if (slice.length === 0) return;

      const latestRecord = slice[slice.length - 1]!;
      const firstRecord = slice[0]!;

      // changeType priority: CREATED > DELETED > UPDATED
      let changeType: 'CREATED' | 'UPDATED' | 'DELETED' = 'UPDATED';
      for (const r of slice) {
        if (r.changeType === 'CREATED') {
          changeType = 'CREATED';
          break;
        }
        if (r.changeType === 'DELETED') changeType = 'DELETED';
      }

      // Determine changedBy from the first record
      const changedBy: 'USER' | 'AGENT' | 'IMPORT' =
        firstRecord.changedBy === 'USER'
          ? 'USER'
          : firstRecord.changedBy === 'AGENT'
            ? 'AGENT'
            : 'IMPORT';

      groupedFieldChanges.push({
        type: 'field_change',
        id: firstRecord.id,
        createdAt: latestRecord.createdAt,
        changeType,
        changedBy,
        agentId: firstRecord.agentId ?? undefined,
        userId: firstRecord.userId ?? undefined,
        fields: slice.map((r) => ({
          fieldName: r.fieldName,
          oldValue: r.oldValue,
          newValue: r.newValue,
        })),
      });
    };

    for (let i = 1; i < rawChangeRecords.length; i++) {
      const prev = rawChangeRecords[i - 1]!;
      const curr = rawChangeRecords[i]!;

      const sameActor = actorKey(curr) === actorKey(prev);
      const withinWindow =
        curr.createdAt.getTime() - prev.createdAt.getTime() <= GROUPING_WINDOW_MS;

      if (!sameActor || !withinWindow) {
        flushGroup(i);
        groupStart = i;
      }
    }
    // Flush the final group
    flushGroup(rawChangeRecords.length);
  }

  // ── Build inventory_diff entries ─────────────────────────────────────────────

  const diffEntries: Extract<CITimelineEntry, { type: 'inventory_diff' }>[] = inventoryDiffs.map(
    (d) => ({
      type: 'inventory_diff' as const,
      id: d.id,
      collectedAt: d.collectedAt,
      changedBy: 'AGENT' as const,
      agentId: d.agentId,
      agentHostname: null, // resolved below
      diff: d.diffJson,
    }),
  );

  // ── Merge and sort all events by timestamp descending ────────────────────────

  type AnyEntry = CITimelineEntry;

  const allEvents: AnyEntry[] = [
    ...groupedFieldChanges,
    ...diffEntries,
  ].sort((a, b) => {
    const tsA = a.type === 'field_change' ? a.createdAt.getTime() : a.collectedAt.getTime();
    const tsB = b.type === 'field_change' ? b.createdAt.getTime() : b.collectedAt.getTime();
    return tsB - tsA;
  });

  const total = allEvents.length;

  // ── Paginate ─────────────────────────────────────────────────────────────────

  const skip = (page - 1) * pageSize;
  const pageSlice = allEvents.slice(skip, skip + pageSize);

  // ── Batch-resolve actor names only for the current page ──────────────────────

  const pageUserIds = new Set<string>();
  const pageAgentIds = new Set<string>();

  for (const event of pageSlice) {
    if (event.type === 'field_change') {
      if (event.userId) pageUserIds.add(event.userId);
      if (event.agentId) pageAgentIds.add(event.agentId);
    } else {
      pageAgentIds.add(event.agentId);
    }
  }

  const [users, agents] = await Promise.all([
    pageUserIds.size > 0
      ? prisma.user.findMany({
          where: { id: { in: [...pageUserIds] }, tenantId },
          select: { id: true, displayName: true, firstName: true, lastName: true, email: true },
        })
      : Promise.resolve([]),
    pageAgentIds.size > 0
      ? prisma.agent.findMany({
          where: { id: { in: [...pageAgentIds] }, tenantId },
          select: { id: true, hostname: true },
        })
      : Promise.resolve([]),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  // Resolve names on each page event
  const resolvedPage: AnyEntry[] = pageSlice.map((event) => {
    if (event.type === 'field_change') {
      const userRecord = event.userId ? userMap.get(event.userId) : undefined;
      const agentRecord = event.agentId ? agentMap.get(event.agentId) : undefined;

      let userName: string | null = null;
      if (userRecord) {
        userName =
          userRecord.displayName ??
          (`${userRecord.firstName} ${userRecord.lastName}`.trim() || userRecord.email);
      }

      return {
        ...event,
        userName,
        agentHostname: agentRecord?.hostname ?? null,
      };
    } else {
      const agentRecord = agentMap.get(event.agentId);
      return {
        ...event,
        agentHostname: agentRecord?.hostname ?? null,
      };
    }
  });

  return { data: resolvedPage, total, page, pageSize };
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
