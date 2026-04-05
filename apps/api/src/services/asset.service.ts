import type { PrismaClient } from '@meridian/db';

// ─── Status Transition Map ────────────────────────────────────────────────────

/**
 * ASSET_TRANSITIONS defines the allowed status lifecycle for assets.
 * Invalid transitions are rejected with a descriptive error.
 *
 * Lifecycle:
 *   IN_STOCK → DEPLOYED | IN_REPAIR | DISPOSED
 *   DEPLOYED → IN_REPAIR | RETIRED
 *   IN_REPAIR → DEPLOYED | RETIRED
 *   RETIRED → DISPOSED
 *   DISPOSED → [] (terminal)
 */
const ASSET_TRANSITIONS: Record<string, string[]> = {
  IN_STOCK: ['DEPLOYED', 'IN_REPAIR', 'DISPOSED'],
  DEPLOYED: ['IN_REPAIR', 'RETIRED'],
  IN_REPAIR: ['DEPLOYED', 'RETIRED'],
  RETIRED: ['DISPOSED'],
  DISPOSED: [],
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateAssetData {
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  status?: 'IN_STOCK' | 'DEPLOYED' | 'IN_REPAIR' | 'RETIRED' | 'DISPOSED';
  purchaseDate?: string | Date;
  purchaseCost?: number;
  warrantyExpiry?: string | Date;
  assignedToId?: string;
  siteId?: string;
  hostname?: string;
  operatingSystem?: string;
  osVersion?: string;
  cpuModel?: string;
  cpuCores?: number;
  ramGb?: number;
  disks?: unknown;
  networkInterfaces?: unknown;
  softwareInventory?: unknown;
  customFields?: unknown;
}

export interface UpdateAssetData {
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  status?: string;
  purchaseDate?: string | Date | null;
  purchaseCost?: number | null;
  warrantyExpiry?: string | Date | null;
  assignedToId?: string | null;
  siteId?: string | null;
  hostname?: string | null;
  operatingSystem?: string | null;
  osVersion?: string | null;
  cpuModel?: string | null;
  cpuCores?: number | null;
  ramGb?: number | null;
  disks?: unknown;
  networkInterfaces?: unknown;
  softwareInventory?: unknown;
  customFields?: unknown;
}

export interface AssetListFilters {
  status?: string;
  assignedToId?: string;
  siteId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// ─── Exported Service Functions ───────────────────────────────────────────────

/**
 * Create a new asset with a sequential, tenant-scoped assetTag.
 * Uses a FOR UPDATE lock to prevent duplicate assetTags under concurrent load.
 * Format: AST-00001
 */
export async function createAsset(
  prisma: PrismaClient,
  tenantId: string,
  data: CreateAssetData,
  _actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    // Get next asset number atomically with advisory lock
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_asset_seq'))`;
    const result = await tx.$queryRaw<[{ next: bigint }]>`
      SELECT COALESCE(MAX(CAST(SUBSTRING("assetTag" FROM 'AST-([0-9]+)') AS INTEGER)), 0) + 1 AS next
      FROM assets
      WHERE "tenantId" = ${tenantId}::uuid
    `;

    const nextNum = Number(result[0].next);
    // Format: AST-00001 (5-digit zero-padded)
    const assetTag = `AST-${String(nextNum).padStart(5, '0')}`;

    const asset = await tx.asset.create({
      data: {
        tenantId,
        assetTag,
        serialNumber: data.serialNumber,
        manufacturer: data.manufacturer,
        model: data.model,
        status: (data.status ?? 'IN_STOCK') as any,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate as string) : undefined,
        purchaseCost: data.purchaseCost,
        warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry as string) : undefined,
        assignedToId: data.assignedToId,
        siteId: data.siteId,
        hostname: data.hostname,
        operatingSystem: data.operatingSystem,
        osVersion: data.osVersion,
        cpuModel: data.cpuModel,
        cpuCores: data.cpuCores,
        ramGb: data.ramGb,
        disks: data.disks as any,
        networkInterfaces: data.networkInterfaces as any,
        softwareInventory: data.softwareInventory as any,
        customFields: data.customFields as any,
      },
      include: {
        site: { select: { id: true, name: true } },
      },
    });

    return asset;
  });
}

/**
 * Get a single asset by ID, scoped to the tenant.
 */
export async function getAsset(
  prisma: PrismaClient,
  tenantId: string,
  assetId: string,
) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, tenantId },
    include: {
      site: { select: { id: true, name: true } },
    },
  });
  return asset;
}

/**
 * List assets for a tenant with optional filters and pagination.
 */
export async function listAssets(
  prisma: PrismaClient,
  tenantId: string,
  filters: AssetListFilters = {},
) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { tenantId };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.assignedToId) {
    where.assignedToId = filters.assignedToId;
  }

  if (filters.siteId) {
    where.siteId = filters.siteId;
  }

  if (filters.search) {
    where.OR = [
      { assetTag: { contains: filters.search, mode: 'insensitive' } },
      { serialNumber: { contains: filters.search, mode: 'insensitive' } },
      { hostname: { contains: filters.search, mode: 'insensitive' } },
      { manufacturer: { contains: filters.search, mode: 'insensitive' } },
      { model: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.asset.findMany({
      where: where as any,
      include: {
        site: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.asset.count({ where: where as any }),
  ]);

  return { data, total, page, pageSize };
}

/**
 * Update an asset. Validates status transitions if status is being changed.
 */
export async function updateAsset(
  prisma: PrismaClient,
  tenantId: string,
  assetId: string,
  data: UpdateAssetData,
  _actorId: string,
) {
  const existing = await prisma.asset.findFirst({
    where: { id: assetId, tenantId },
  });

  if (!existing) {
    return null;
  }

  // Validate status transition if status is being changed
  if (data.status && data.status !== existing.status) {
    const allowed = ASSET_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(data.status)) {
      throw new Error(`Invalid status transition from ${existing.status} to ${data.status}`);
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.serialNumber !== undefined) updateData.serialNumber = data.serialNumber;
  if (data.manufacturer !== undefined) updateData.manufacturer = data.manufacturer;
  if (data.model !== undefined) updateData.model = data.model;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.purchaseDate !== undefined) {
    updateData.purchaseDate = data.purchaseDate ? new Date(data.purchaseDate as string) : null;
  }
  if (data.purchaseCost !== undefined) updateData.purchaseCost = data.purchaseCost;
  if (data.warrantyExpiry !== undefined) {
    updateData.warrantyExpiry = data.warrantyExpiry ? new Date(data.warrantyExpiry as string) : null;
  }
  if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId;
  if (data.siteId !== undefined) updateData.siteId = data.siteId;
  if (data.hostname !== undefined) updateData.hostname = data.hostname;
  if (data.operatingSystem !== undefined) updateData.operatingSystem = data.operatingSystem;
  if (data.osVersion !== undefined) updateData.osVersion = data.osVersion;
  if (data.cpuModel !== undefined) updateData.cpuModel = data.cpuModel;
  if (data.cpuCores !== undefined) updateData.cpuCores = data.cpuCores;
  if (data.ramGb !== undefined) updateData.ramGb = data.ramGb;
  if (data.disks !== undefined) updateData.disks = data.disks as any;
  if (data.networkInterfaces !== undefined) updateData.networkInterfaces = data.networkInterfaces as any;
  if (data.softwareInventory !== undefined) updateData.softwareInventory = data.softwareInventory as any;
  if (data.customFields !== undefined) updateData.customFields = data.customFields as any;

  const updated = await prisma.asset.update({
    where: { id: assetId },
    data: updateData as any,
    include: {
      site: { select: { id: true, name: true } },
    },
  });

  return updated;
}

/**
 * Delete an asset.
 * Sets status to DISPOSED (soft-delete) if the asset has linked references;
 * performs a hard delete otherwise.
 */
export async function deleteAsset(
  prisma: PrismaClient,
  tenantId: string,
  assetId: string,
) {
  const existing = await prisma.asset.findFirst({
    where: { id: assetId, tenantId },
    include: {
      _count: {
        select: {
          changeAssets: true,
          applicationAssets: true,
          cmdbConfigItems: true,
          contractAssets: true,
        },
      },
    },
  });

  if (!existing) {
    return null;
  }

  const hasReferences =
    existing._count.changeAssets > 0 ||
    existing._count.applicationAssets > 0 ||
    existing._count.cmdbConfigItems > 0 ||
    existing._count.contractAssets > 0;

  if (hasReferences) {
    // Soft delete — mark as DISPOSED
    return prisma.asset.update({
      where: { id: assetId },
      data: { status: 'DISPOSED' },
    });
  }

  // Hard delete — no references
  await prisma.asset.delete({ where: { id: assetId } });
  return { id: assetId, deleted: true };
}
