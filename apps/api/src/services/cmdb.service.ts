import { prisma } from '@meridian/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateCIData {
  name: string;
  displayName?: string;

  // Legacy enum fields (still accepted during migration)
  type?: string;
  status?: string;
  environment?: string;

  // New reference table FKs
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

export interface UpdateCIData extends Partial<Omit<CreateCIData, 'type' | 'status' | 'environment'>> {
  type?: string;
  status?: string;
  environment?: string;
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
        displayName: data.displayName,
        // Legacy enum fields
        type: (data.type ?? 'OTHER') as never,
        status: (data.status ?? 'ACTIVE') as never,
        environment: (data.environment ?? 'PRODUCTION') as never,
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
    trackAndSet('type', data.type);
    trackAndSet('status', data.status);
    trackAndSet('environment', data.environment);
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

    // Soft-delete using isDeleted flag and also set legacy status
    return tx.cmdbConfigurationItem.update({
      where: { id: ciId },
      data: {
        isDeleted: true,
        status: 'DECOMMISSIONED' as never,
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

  return prisma.cmdbRelationship.create({
    data: {
      tenantId,
      sourceId: data.sourceId,
      targetId: data.targetId,
      relationshipType: data.relationshipType as never,
      relationshipTypeId: data.relationshipTypeId,
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
