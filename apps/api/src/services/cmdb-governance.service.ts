import { prisma } from '@meridian/db';

// ─── Attestation ─────────────────────────────────────────────────────────────

export async function createAttestation(
  tenantId: string,
  ciId: string,
  attestedById: string,
  data: { attestationStatus: string; comments?: string },
) {
  const attestation = await prisma.cmdbAttestation.create({
    data: {
      tenantId,
      ciId,
      attestedById,
      attestationStatus: data.attestationStatus,
      comments: data.comments ?? null,
    },
  });

  if (data.attestationStatus === 'verified') {
    await prisma.cmdbConfigurationItem.update({
      where: { id: ciId, tenantId },
      data: { lastVerifiedAt: new Date() },
    });
  }

  return attestation;
}

export async function listAttestations(
  tenantId: string,
  ciId: string,
  page = 1,
  pageSize = 20,
) {
  const skip = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    prisma.cmdbAttestation.findMany({
      where: { tenantId, ciId },
      orderBy: { attestedAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.cmdbAttestation.count({
      where: { tenantId, ciId },
    }),
  ]);

  return { items, total, page, pageSize };
}

// ─── Duplicate Detection ─────────────────────────────────────────────────────

export async function detectDuplicates(tenantId: string, ciId: string) {
  // Fetch the source CI
  const ci = await prisma.cmdbConfigurationItem.findFirst({
    where: { id: ciId, tenantId, isDeleted: false },
    select: {
      id: true,
      hostname: true,
      serialNumber: true,
      fqdn: true,
      assetTag: true,
      externalId: true,
    },
  });

  if (!ci) {
    throw new Error(`CI not found: ${ciId}`);
  }

  // Build OR conditions for fields that have values
  const orConditions: Record<string, string>[] = [];
  if (ci.hostname) orConditions.push({ hostname: ci.hostname });
  if (ci.serialNumber) orConditions.push({ serialNumber: ci.serialNumber });
  if (ci.fqdn) orConditions.push({ fqdn: ci.fqdn });
  if (ci.assetTag) orConditions.push({ assetTag: ci.assetTag });
  if (ci.externalId) orConditions.push({ externalId: ci.externalId });

  if (orConditions.length === 0) {
    return [];
  }

  // Find potential matches (excluding self, same tenant, non-deleted)
  const candidates = await prisma.cmdbConfigurationItem.findMany({
    where: {
      tenantId,
      isDeleted: false,
      id: { not: ciId },
      OR: orConditions,
    },
    select: {
      id: true,
      hostname: true,
      serialNumber: true,
      fqdn: true,
      assetTag: true,
      externalId: true,
    },
  });

  const created: Awaited<ReturnType<typeof prisma.cmdbDuplicateCandidate.create>>[] = [];

  for (const candidate of candidates) {
    // Count matching fields
    let matchCount = 0;
    const reasons: string[] = [];

    if (ci.hostname && candidate.hostname === ci.hostname) {
      matchCount++;
      reasons.push('hostname');
    }
    if (ci.serialNumber && candidate.serialNumber === ci.serialNumber) {
      matchCount++;
      reasons.push('serialNumber');
    }
    if (ci.fqdn && candidate.fqdn === ci.fqdn) {
      matchCount++;
      reasons.push('fqdn');
    }
    if (ci.assetTag && candidate.assetTag === ci.assetTag) {
      matchCount++;
      reasons.push('assetTag');
    }
    if (ci.externalId && candidate.externalId === ci.externalId) {
      matchCount++;
      reasons.push('externalId');
    }

    if (matchCount === 0) continue;

    // Calculate score
    let matchScore: number;
    if (matchCount >= 3) matchScore = 95;
    else if (matchCount === 2) matchScore = 80;
    else matchScore = 60;

    // Normalize ordering so ciId1 < ciId2 to avoid direction-dependent duplicates
    const [id1, id2] = ciId < candidate.id ? [ciId, candidate.id] : [candidate.id, ciId];

    // Check if candidate pair already exists (either ordering)
    const existing = await prisma.cmdbDuplicateCandidate.findFirst({
      where: {
        tenantId,
        OR: [
          { ciId1: id1, ciId2: id2 },
          { ciId1: id2, ciId2: id1 },
        ],
      },
    });

    if (existing) continue;

    const record = await prisma.cmdbDuplicateCandidate.create({
      data: {
        tenantId,
        ciId1: id1,
        ciId2: id2,
        matchScore,
        detectionReason: reasons.join(', '),
        reviewStatus: 'pending',
      },
    });

    created.push(record);
  }

  return created;
}

export async function listDuplicateCandidates(
  tenantId: string,
  filters?: { reviewStatus?: string },
  page = 1,
  pageSize = 20,
) {
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { tenantId };
  if (filters?.reviewStatus) {
    where.reviewStatus = filters.reviewStatus;
  }

  const [items, total] = await Promise.all([
    prisma.cmdbDuplicateCandidate.findMany({
      where,
      include: {
        ci1: { select: { name: true, ciNumber: true, hostname: true, classId: true } },
        ci2: { select: { name: true, ciNumber: true, hostname: true, classId: true } },
      },
      orderBy: [{ matchScore: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
    }),
    prisma.cmdbDuplicateCandidate.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function reviewDuplicateCandidate(
  tenantId: string,
  id: string,
  data: { reviewStatus: string; reviewedById: string },
) {
  const validStatuses = ['confirmed_duplicate', 'not_duplicate', 'merged'];
  if (!validStatuses.includes(data.reviewStatus)) {
    throw new Error(
      `Invalid reviewStatus: ${data.reviewStatus}. Must be one of: ${validStatuses.join(', ')}`,
    );
  }

  return prisma.cmdbDuplicateCandidate.update({
    where: { id, tenantId },
    data: {
      reviewStatus: data.reviewStatus,
      reviewedById: data.reviewedById,
      reviewedAt: new Date(),
    },
  });
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function getStaleReport(tenantId: string, page = 1, pageSize = 50) {
  const skip = (page - 1) * pageSize;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // First, find production environment IDs for this tenant
  const prodEnvs = await prisma.cmdbEnvironment.findMany({
    where: { tenantId, envKey: 'prod' },
    select: { id: true },
  });
  const prodEnvIds = prodEnvs.map((e) => e.id);

  // Fetch all non-deleted CIs with environment info
  const allCIs = await prisma.cmdbConfigurationItem.findMany({
    where: { tenantId, isDeleted: false },
    select: {
      id: true,
      name: true,
      ciNumber: true,
      classId: true,
      environmentId: true,
      environment: true,
      lastVerifiedAt: true,
      lastSeenAt: true,
      ciClass: { select: { classKey: true, className: true } },
      cmdbEnvironment: { select: { envKey: true, envName: true } },
    },
  });

  // Filter stale CIs
  const staleCIs = allCIs.filter((ci) => {
    const isProduction =
      (ci.environmentId && prodEnvIds.includes(ci.environmentId)) ||
      ci.environment === 'PRODUCTION';

    const threshold = isProduction ? thirtyDaysAgo : ninetyDaysAgo;

    const verifiedStale = !ci.lastVerifiedAt || ci.lastVerifiedAt < threshold;
    const seenStale = !ci.lastSeenAt || ci.lastSeenAt < threshold;

    return verifiedStale && seenStale;
  });

  const total = staleCIs.length;
  const items = staleCIs.slice(skip, skip + pageSize).map((ci) => ({
    id: ci.id,
    name: ci.name,
    ciNumber: ci.ciNumber,
    classKey: ci.ciClass?.classKey ?? null,
    className: ci.ciClass?.className ?? null,
    envKey: ci.cmdbEnvironment?.envKey ?? null,
    envName: ci.cmdbEnvironment?.envName ?? null,
    lastVerifiedAt: ci.lastVerifiedAt,
    lastSeenAt: ci.lastSeenAt,
  }));

  return { items, total, page, pageSize };
}

export async function getOrphanedReport(tenantId: string, page = 1, pageSize = 50) {
  const skip = (page - 1) * pageSize;

  const where = {
    tenantId,
    isDeleted: false,
    sourceRels: { none: {} },
    targetRels: { none: {} },
  };

  const [items, total] = await Promise.all([
    prisma.cmdbConfigurationItem.findMany({
      where,
      select: {
        id: true,
        name: true,
        ciNumber: true,
        classId: true,
        ciClass: { select: { classKey: true, className: true } },
        cmdbEnvironment: { select: { envKey: true, envName: true } },
        lastVerifiedAt: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.cmdbConfigurationItem.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getHealthReport(tenantId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const baseWhere = { tenantId, isDeleted: false };

  // Run all independent counts in parallel
  const [
    totalCIs,
    byClassRaw,
    byEnvRaw,
    orphanedCIs,
    pendingDuplicates,
    missingOwner,
    missingSupportGroup,
    attestedLast30Days,
    attestedWithin90Days,
    allCIsForStale,
  ] = await Promise.all([
    // totalCIs
    prisma.cmdbConfigurationItem.count({ where: baseWhere }),

    // byClass - group by classId
    prisma.cmdbConfigurationItem.groupBy({
      by: ['classId'],
      where: baseWhere,
      _count: { id: true },
    }),

    // byEnvironment - group by environmentId
    prisma.cmdbConfigurationItem.groupBy({
      by: ['environmentId'],
      where: baseWhere,
      _count: { id: true },
    }),

    // orphanedCIs
    prisma.cmdbConfigurationItem.count({
      where: {
        ...baseWhere,
        sourceRels: { none: {} },
        targetRels: { none: {} },
      },
    }),

    // pendingDuplicates
    prisma.cmdbDuplicateCandidate.count({
      where: { tenantId, reviewStatus: 'pending' },
    }),

    // missingOwner (no business AND no technical owner)
    prisma.cmdbConfigurationItem.count({
      where: {
        ...baseWhere,
        businessOwnerId: null,
        technicalOwnerId: null,
      },
    }),

    // missingSupportGroup
    prisma.cmdbConfigurationItem.count({
      where: { ...baseWhere, supportGroupId: null },
    }),

    // attestedLast30Days (CIs verified in the last 30 days)
    prisma.cmdbConfigurationItem.count({
      where: {
        ...baseWhere,
        lastVerifiedAt: { gte: thirtyDaysAgo },
      },
    }),

    // attestedWithin90Days (for coverage calculation)
    prisma.cmdbConfigurationItem.count({
      where: {
        ...baseWhere,
        lastVerifiedAt: { gte: ninetyDaysAgo },
      },
    }),

    // All CIs for stale calculation (need environment check)
    prisma.cmdbConfigurationItem.findMany({
      where: baseWhere,
      select: {
        environmentId: true,
        environment: true,
        lastVerifiedAt: true,
        lastSeenAt: true,
      },
    }),
  ]);

  // Resolve class names
  const classIds = byClassRaw
    .map((r) => r.classId)
    .filter((id): id is string => id !== null);
  const classes =
    classIds.length > 0
      ? await prisma.cmdbCiClass.findMany({
          where: { id: { in: classIds }, tenantId },
          select: { id: true, classKey: true, className: true },
        })
      : [];
  const classMap = new Map(classes.map((c) => [c.id, c]));

  const byClass = byClassRaw.map((r) => {
    const cls = r.classId ? classMap.get(r.classId) : null;
    return {
      classKey: cls?.classKey ?? 'unclassified',
      className: cls?.className ?? 'Unclassified',
      count: r._count.id,
    };
  });

  // Resolve environment names
  const envIds = byEnvRaw
    .map((r) => r.environmentId)
    .filter((id): id is string => id !== null);
  const envs =
    envIds.length > 0
      ? await prisma.cmdbEnvironment.findMany({
          where: { id: { in: envIds }, tenantId },
          select: { id: true, envKey: true, envName: true },
        })
      : [];
  const envMap = new Map(envs.map((e) => [e.id, e]));

  const byEnvironment = byEnvRaw.map((r) => {
    const env = r.environmentId ? envMap.get(r.environmentId) : null;
    return {
      envKey: env?.envKey ?? 'unknown',
      envName: env?.envName ?? 'Unknown',
      count: r._count.id,
    };
  });

  // Calculate stale CIs
  const prodEnvs = await prisma.cmdbEnvironment.findMany({
    where: { tenantId, envKey: 'prod' },
    select: { id: true },
  });
  const prodEnvIds = new Set(prodEnvs.map((e) => e.id));

  const staleCIs = allCIsForStale.filter((ci) => {
    const isProduction =
      (ci.environmentId && prodEnvIds.has(ci.environmentId)) ||
      ci.environment === 'PRODUCTION';
    const threshold = isProduction ? thirtyDaysAgo : ninetyDaysAgo;
    const verifiedStale = !ci.lastVerifiedAt || ci.lastVerifiedAt < threshold;
    const seenStale = !ci.lastSeenAt || ci.lastSeenAt < threshold;
    return verifiedStale && seenStale;
  }).length;

  const attestationCoverage =
    totalCIs > 0 ? Math.round((attestedWithin90Days / totalCIs) * 10000) / 100 : 0;

  return {
    totalCIs,
    byClass,
    byEnvironment,
    staleCIs,
    orphanedCIs,
    pendingDuplicates,
    missingOwner,
    missingSupportGroup,
    attestedLast30Days,
    attestationCoverage,
  };
}

export async function getMissingDataReport(tenantId: string, page = 1, pageSize = 50) {
  const skip = (page - 1) * pageSize;

  const where = {
    tenantId,
    isDeleted: false,
    OR: [
      { businessOwnerId: null, technicalOwnerId: null },
      { supportGroupId: null },
      { classId: null },
      { lifecycleStatusId: null },
    ],
  };

  const [rawItems, total] = await Promise.all([
    prisma.cmdbConfigurationItem.findMany({
      where,
      select: {
        id: true,
        name: true,
        ciNumber: true,
        classId: true,
        lifecycleStatusId: true,
        businessOwnerId: true,
        technicalOwnerId: true,
        supportGroupId: true,
        ciClass: { select: { classKey: true, className: true } },
        cmdbEnvironment: { select: { envKey: true, envName: true } },
      },
      orderBy: { ciNumber: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.cmdbConfigurationItem.count({ where }),
  ]);

  const items = rawItems.map((ci) => {
    const missingFields: string[] = [];
    if (!ci.businessOwnerId && !ci.technicalOwnerId) missingFields.push('owner');
    if (!ci.supportGroupId) missingFields.push('supportGroup');
    if (!ci.classId) missingFields.push('class');
    if (!ci.lifecycleStatusId) missingFields.push('lifecycleStatus');

    return {
      id: ci.id,
      name: ci.name,
      ciNumber: ci.ciNumber,
      classKey: ci.ciClass?.classKey ?? null,
      className: ci.ciClass?.className ?? null,
      envKey: ci.cmdbEnvironment?.envKey ?? null,
      envName: ci.cmdbEnvironment?.envName ?? null,
      missingFields,
    };
  });

  return { items, total, page, pageSize };
}
