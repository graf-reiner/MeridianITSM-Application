import { prisma } from '@meridian/db';

/**
 * Phase 7 (CREF-01..04): tenant-scoped FK resolvers shared by cmdb.service,
 * application.service, cmdb-import.service, and the cmdb-reconciliation worker.
 *
 * Multi-tenancy: every cache key MUST include `${tenantId}:` as the first
 * segment so Tenant A's resolved id can never be returned for Tenant B even
 * if both have a class with the same `classKey`.
 *
 * Caches are per-process. Call `clearResolverCaches()` between scheduled
 * worker runs to pick up tenant-level vocabulary changes. Note: the worker
 * (apps/worker) duplicates the same resolver logic inline per the project's
 * no-cross-app-imports convention. `clearResolverCaches()` is per-process —
 * the API process clears its copy via this module; the worker process clears
 * its own duplicated copy.
 */

// === Class resolver ===
const classIdCache = new Map<string, string>();

export async function resolveClassId(
  tenantId: string,
  classKey: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:${classKey}`;
  if (classIdCache.has(cacheKey)) return classIdCache.get(cacheKey)!;

  const cls = await prisma.cmdbCiClass.findFirst({
    where: { tenantId, classKey },
    select: { id: true },
  });

  if (cls) classIdCache.set(cacheKey, cls.id);
  return cls?.id ?? null;
}

// === Status resolvers (lifecycle + operational share a cache; key includes type) ===
const statusIdCache = new Map<string, string>();

export async function resolveLifecycleStatusId(
  tenantId: string,
  statusKey: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:lifecycle:${statusKey}`;
  if (statusIdCache.has(cacheKey)) return statusIdCache.get(cacheKey)!;

  const status = await prisma.cmdbStatus.findFirst({
    where: { tenantId, statusType: 'lifecycle', statusKey },
    select: { id: true },
  });

  if (status) statusIdCache.set(cacheKey, status.id);
  return status?.id ?? null;
}

export async function resolveOperationalStatusId(
  tenantId: string,
  statusKey: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:operational:${statusKey}`;
  if (statusIdCache.has(cacheKey)) return statusIdCache.get(cacheKey)!;

  const status = await prisma.cmdbStatus.findFirst({
    where: { tenantId, statusType: 'operational', statusKey },
    select: { id: true },
  });

  if (status) statusIdCache.set(cacheKey, status.id);
  return status?.id ?? null;
}

// === Environment resolver ===
const envIdCache = new Map<string, string>();

export async function resolveEnvironmentId(
  tenantId: string,
  envKey: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:${envKey}`;
  if (envIdCache.has(cacheKey)) return envIdCache.get(cacheKey)!;

  const env = await prisma.cmdbEnvironment.findFirst({
    where: { tenantId, envKey },
    select: { id: true },
  });

  if (env) envIdCache.set(cacheKey, env.id);
  return env?.id ?? null;
}

// === Relationship-type resolver (Phase 7 NEW) ===
const relTypeIdCache = new Map<string, string>();

export async function resolveRelationshipTypeId(
  tenantId: string,
  relationshipKey: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:${relationshipKey}`;
  if (relTypeIdCache.has(cacheKey)) return relTypeIdCache.get(cacheKey)!;

  const ref = await prisma.cmdbRelationshipTypeRef.findFirst({
    where: { tenantId, relationshipKey },
    select: { id: true },
  });

  if (ref) relTypeIdCache.set(cacheKey, ref.id);
  return ref?.id ?? null;
}

// === Cache reset (called by long-running workers between runs) ===
export function clearResolverCaches(): void {
  classIdCache.clear();
  statusIdCache.clear();
  envIdCache.clear();
  relTypeIdCache.clear();
}
