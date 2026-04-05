import { prisma } from '@meridian/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateCiClassData {
  classKey: string;
  className: string;
  parentClassId?: string;
  description?: string;
  icon?: string;
}

export interface UpdateCiClassData {
  classKey?: string;
  className?: string;
  parentClassId?: string | null;
  description?: string | null;
  icon?: string | null;
}

export interface CreateStatusData {
  statusType: string;
  statusKey: string;
  statusName: string;
  sortOrder?: number;
}

export interface UpdateStatusData {
  statusType?: string;
  statusKey?: string;
  statusName?: string;
  sortOrder?: number;
}

export interface CreateEnvironmentData {
  envKey: string;
  envName: string;
  sortOrder?: number;
}

export interface UpdateEnvironmentData {
  envKey?: string;
  envName?: string;
  sortOrder?: number;
}

export interface CreateRelationshipTypeData {
  relationshipKey: string;
  relationshipName: string;
  forwardLabel: string;
  reverseLabel: string;
  isDirectional?: boolean;
  description?: string;
}

export interface UpdateRelationshipTypeData {
  relationshipKey?: string;
  relationshipName?: string;
  forwardLabel?: string;
  reverseLabel?: string;
  isDirectional?: boolean;
  description?: string | null;
}

export interface CreateVendorData {
  name: string;
  vendorType?: string;
  supportUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface UpdateVendorData {
  name?: string;
  vendorType?: string | null;
  supportUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

// ─── CmdbCiClass ─────────────────────────────────────────────────────────────

export async function listCiClasses(tenantId: string) {
  return prisma.cmdbCiClass.findMany({
    where: { tenantId },
    orderBy: { className: 'asc' },
    include: { childClasses: true },
  });
}

export async function createCiClass(tenantId: string, data: CreateCiClassData) {
  // Check uniqueness (tenantId + classKey is a unique constraint)
  const existing = await prisma.cmdbCiClass.findUnique({
    where: { tenantId_classKey: { tenantId, classKey: data.classKey } },
  });

  if (existing) {
    throw new Error(`CI class with key "${data.classKey}" already exists for this tenant`);
  }

  return prisma.cmdbCiClass.create({
    data: {
      tenantId,
      classKey: data.classKey,
      className: data.className,
      parentClassId: data.parentClassId,
      description: data.description,
      icon: data.icon,
    },
  });
}

export async function updateCiClass(tenantId: string, id: string, data: UpdateCiClassData) {
  return prisma.cmdbCiClass.update({
    where: { id, tenantId },
    data,
  });
}

export async function deleteCiClass(tenantId: string, id: string) {
  const count = await prisma.cmdbConfigurationItem.count({
    where: { tenantId, classId: id },
  });

  if (count > 0) {
    throw new Error(`Cannot delete: ${count} configuration item${count === 1 ? '' : 's'} reference this class`);
  }

  return prisma.cmdbCiClass.delete({
    where: { id, tenantId },
  });
}

// ─── CmdbStatus ──────────────────────────────────────────────────────────────

export async function listStatuses(tenantId: string, statusType?: string) {
  return prisma.cmdbStatus.findMany({
    where: {
      tenantId,
      ...(statusType ? { statusType } : {}),
    },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createStatus(tenantId: string, data: CreateStatusData) {
  return prisma.cmdbStatus.create({
    data: {
      tenantId,
      statusType: data.statusType,
      statusKey: data.statusKey,
      statusName: data.statusName,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function updateStatus(tenantId: string, id: string, data: UpdateStatusData) {
  return prisma.cmdbStatus.update({
    where: { id, tenantId },
    data,
  });
}

export async function deleteStatus(tenantId: string, id: string) {
  // Check both lifecycle and operational status references
  const [lifecycleCount, operationalCount] = await Promise.all([
    prisma.cmdbConfigurationItem.count({
      where: { tenantId, lifecycleStatusId: id },
    }),
    prisma.cmdbConfigurationItem.count({
      where: { tenantId, operationalStatusId: id },
    }),
  ]);

  const total = lifecycleCount + operationalCount;
  if (total > 0) {
    throw new Error(`Cannot delete: ${total} configuration item${total === 1 ? '' : 's'} reference this status`);
  }

  return prisma.cmdbStatus.delete({
    where: { id, tenantId },
  });
}

// ─── CmdbEnvironment ─────────────────────────────────────────────────────────

export async function listEnvironments(tenantId: string) {
  return prisma.cmdbEnvironment.findMany({
    where: { tenantId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createEnvironment(tenantId: string, data: CreateEnvironmentData) {
  return prisma.cmdbEnvironment.create({
    data: {
      tenantId,
      envKey: data.envKey,
      envName: data.envName,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function updateEnvironment(tenantId: string, id: string, data: UpdateEnvironmentData) {
  return prisma.cmdbEnvironment.update({
    where: { id, tenantId },
    data,
  });
}

export async function deleteEnvironment(tenantId: string, id: string) {
  const count = await prisma.cmdbConfigurationItem.count({
    where: { tenantId, environmentId: id },
  });

  if (count > 0) {
    throw new Error(`Cannot delete: ${count} configuration item${count === 1 ? '' : 's'} reference this environment`);
  }

  return prisma.cmdbEnvironment.delete({
    where: { id, tenantId },
  });
}

// ─── CmdbRelationshipTypeRef ─────────────────────────────────────────────────

export async function listRelationshipTypes(tenantId: string) {
  return prisma.cmdbRelationshipTypeRef.findMany({
    where: { tenantId },
    orderBy: { relationshipName: 'asc' },
  });
}

export async function createRelationshipType(tenantId: string, data: CreateRelationshipTypeData) {
  return prisma.cmdbRelationshipTypeRef.create({
    data: {
      tenantId,
      relationshipKey: data.relationshipKey,
      relationshipName: data.relationshipName,
      forwardLabel: data.forwardLabel,
      reverseLabel: data.reverseLabel,
      isDirectional: data.isDirectional ?? true,
      description: data.description,
    },
  });
}

export async function updateRelationshipType(tenantId: string, id: string, data: UpdateRelationshipTypeData) {
  return prisma.cmdbRelationshipTypeRef.update({
    where: { id, tenantId },
    data,
  });
}

export async function deleteRelationshipType(tenantId: string, id: string) {
  const count = await prisma.cmdbRelationship.count({
    where: { tenantId, relationshipTypeId: id },
  });

  if (count > 0) {
    throw new Error(`Cannot delete: ${count} relationship${count === 1 ? '' : 's'} reference this type`);
  }

  return prisma.cmdbRelationshipTypeRef.delete({
    where: { id, tenantId },
  });
}

// ─── CmdbVendor ──────────────────────────────────────────────────────────────

export async function listVendors(tenantId: string) {
  return prisma.cmdbVendor.findMany({
    where: { tenantId, isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function createVendor(tenantId: string, data: CreateVendorData) {
  return prisma.cmdbVendor.create({
    data: {
      tenantId,
      name: data.name,
      vendorType: data.vendorType,
      supportUrl: data.supportUrl,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
    },
  });
}

export async function updateVendor(tenantId: string, id: string, data: UpdateVendorData) {
  return prisma.cmdbVendor.update({
    where: { id, tenantId },
    data,
  });
}

export async function deleteVendor(tenantId: string, id: string) {
  const count = await prisma.cmdbConfigurationItem.count({
    where: { tenantId, manufacturerId: id },
  });

  if (count > 0) {
    throw new Error(`Cannot delete: ${count} configuration item${count === 1 ? '' : 's'} reference this vendor`);
  }

  return prisma.cmdbVendor.delete({
    where: { id, tenantId },
  });
}
