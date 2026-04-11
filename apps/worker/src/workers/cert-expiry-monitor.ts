import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

// ─── APM ↔ CMDB Bridge — Cert Expiry Monitor ─────────────────────────────────
//
// Daily worker that walks every Application's primary CI to find linked
// CmdbCiEndpoint rows with a certificateExpiryDate, computes
// daysUntilExpiry, and fires a notification when a threshold is crossed
// for the first time.
//
// Thresholds (most-severe-first): expired (<0), 7, 14, 30, 60. Each
// threshold fires exactly once per (tenant, ciId) pair — tracked via a
// per-tenant Redis dedup key. Re-uploading a renewed certificate
// naturally raises daysUntilExpiry, which lets the new sequence begin.
//
// Notification dispatch: this worker creates Notification rows directly
// for the relevant audience (business owner, technical owner, support
// group members of the primary CI), matching the sla-monitor pattern.
// The CERT_EXPIRY_WARNING trigger and CERT_VARIABLES catalog are wired
// up so a future iteration can route through dispatchNotificationEvent
// once it's importable from the worker package.
//
// Tenant isolation: per-tenant outer loop. Every prisma query filters by
// tenantId. Redis dedup key includes tenantId.

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

type Threshold = '60' | '30' | '14' | '7' | 'expired';

// Severity rank — lower = more severe. Used to decide whether a newly
// computed threshold crosses the previously-fired one.
const SEVERITY: Record<Threshold, number> = {
  expired: 0,
  '7': 1,
  '14': 2,
  '30': 3,
  '60': 4,
};

const TTL_DAYS = 90;

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function thresholdFor(daysUntilExpiry: number): Threshold | null {
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry < 7) return '7';
  if (daysUntilExpiry < 14) return '14';
  if (daysUntilExpiry < 30) return '30';
  if (daysUntilExpiry < 60) return '60';
  return null;
}

async function shouldFire(
  tenantId: string,
  ciId: string,
  threshold: Threshold,
): Promise<boolean> {
  const key = `cert-alert:${tenantId}:${ciId}`;
  const last = (await redis.get(key)) as Threshold | null;
  // Fire if no prior, or if computed threshold is more severe than last fired
  if (!last) return true;
  const lastSev = SEVERITY[last];
  const newSev = SEVERITY[threshold];
  if (lastSev === undefined) return true; // garbage value, fire
  return newSev < lastSev;
}

async function recordFired(
  tenantId: string,
  ciId: string,
  threshold: Threshold,
): Promise<void> {
  const key = `cert-alert:${tenantId}:${ciId}`;
  await redis.set(key, threshold, 'EX', TTL_DAYS * 86400);
}

interface CertEvent {
  tenantId: string;
  applicationId: string;
  applicationName: string;
  ciId: string;
  ciName: string;
  url: string | null;
  certificateExpiryDate: Date;
  certificateIssuer: string | null;
  daysUntilExpiry: number;
  threshold: Threshold;
  // Audience (resolved from primary CI)
  businessOwnerId: string | null;
  technicalOwnerId: string | null;
  supportGroupId: string | null;
}

async function processTenant(tenantId: string): Promise<number> {
  let firedCount = 0;

  // Apps with a primary CI bridge
  const apps = await prisma.application.findMany({
    where: { tenantId, primaryCiId: { not: null } },
    select: { id: true, name: true, primaryCiId: true },
  });
  if (apps.length === 0) return 0;

  for (const app of apps) {
    if (!app.primaryCiId) continue;

    // Load owners from primary CI
    const primaryCi = await prisma.cmdbConfigurationItem.findFirst({
      where: { id: app.primaryCiId, tenantId },
      select: {
        id: true,
        businessOwnerId: true,
        technicalOwnerId: true,
        supportGroupId: true,
      },
    });
    if (!primaryCi) continue;

    // Walk one hop to find related CI ids
    const rels = await prisma.cmdbRelationship.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [{ sourceId: primaryCi.id }, { targetId: primaryCi.id }],
      },
      select: { sourceId: true, targetId: true },
    });
    const relatedIds = new Set<string>();
    for (const r of rels) {
      relatedIds.add(r.sourceId === primaryCi.id ? r.targetId : r.sourceId);
    }
    if (relatedIds.size === 0) continue;

    // Find endpoint CIs with cert expiry
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
      if (!ep.certificateExpiryDate) continue;

      const days = daysUntil(ep.certificateExpiryDate);
      const threshold = thresholdFor(days);
      if (!threshold) continue; // > 60 days — nothing to alert

      const fire = await shouldFire(tenantId, ep.ci.id, threshold);
      if (!fire) continue;

      const event: CertEvent = {
        tenantId,
        applicationId: app.id,
        applicationName: app.name,
        ciId: ep.ci.id,
        ciName: ep.ci.name,
        url: ep.url,
        certificateExpiryDate: ep.certificateExpiryDate,
        certificateIssuer: ep.certificateIssuer,
        daysUntilExpiry: days,
        threshold,
        businessOwnerId: primaryCi.businessOwnerId,
        technicalOwnerId: primaryCi.technicalOwnerId,
        supportGroupId: primaryCi.supportGroupId,
      };

      const dispatched = await dispatchCertEvent(event);
      if (dispatched) {
        // Only mark threshold as fired if at least one recipient was
        // notified. Otherwise admins can configure owners later and
        // still get the alert on the next scan.
        await recordFired(tenantId, ep.ci.id, threshold);
        firedCount += 1;
      }
    }
  }

  return firedCount;
}

/**
 * Resolve the recipient user ids for a cert event:
 *   - business owner of the primary CI
 *   - technical owner of the primary CI
 *   - every member of the support group (if set)
 *
 * Returns a deduplicated list. Empty list means no one is configured to
 * receive the alert (admin should set ownership on the primary CI).
 */
async function resolveRecipients(event: CertEvent): Promise<string[]> {
  const ids = new Set<string>();
  if (event.businessOwnerId) ids.add(event.businessOwnerId);
  if (event.technicalOwnerId) ids.add(event.technicalOwnerId);

  if (event.supportGroupId) {
    const members = await prisma.userGroupMember.findMany({
      where: {
        tenantId: event.tenantId,
        userGroupId: event.supportGroupId,
      },
      select: { userId: true },
    });
    for (const m of members) ids.add(m.userId);
  }

  return Array.from(ids);
}

function buildTitle(event: CertEvent): string {
  if (event.threshold === 'expired') {
    return `Certificate EXPIRED: ${event.ciName}`;
  }
  return `Certificate expiring in ${event.daysUntilExpiry}d: ${event.ciName}`;
}

function buildBody(event: CertEvent): string {
  const expiryStr = event.certificateExpiryDate.toISOString().slice(0, 10);
  const lines = [
    `Application: ${event.applicationName}`,
    `Endpoint: ${event.ciName}${event.url ? ` (${event.url})` : ''}`,
    `Expiry date: ${expiryStr}`,
    event.certificateIssuer ? `Issuer: ${event.certificateIssuer}` : null,
    event.threshold === 'expired'
      ? `Status: EXPIRED ${Math.abs(event.daysUntilExpiry)} day(s) ago`
      : `Days remaining: ${event.daysUntilExpiry}`,
  ].filter(Boolean);
  return lines.join('\n');
}

async function dispatchCertEvent(event: CertEvent): Promise<boolean> {
  const recipients = await resolveRecipients(event);
  if (recipients.length === 0) {
    console.warn(
      `[cert-expiry-monitor] No recipients for cert alert on CI ${event.ciId} (tenant ${event.tenantId}) — set business/technical owner or support group on the primary CI`,
    );
    return false;
  }

  const title = buildTitle(event);
  const body = buildBody(event);

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      tenantId: event.tenantId,
      userId,
      type: 'CERT_EXPIRY_WARNING',
      title,
      body,
      resourceId: event.applicationId,
      resource: 'application',
    })),
  });

  console.log(
    `[cert-expiry-monitor] Fired ${event.threshold} alert for ${event.ciName} → ${recipients.length} recipient(s)`,
  );
  return true;
}

export const certExpiryMonitorWorker = new Worker(
  QUEUE_NAMES.CERT_EXPIRY_MONITOR,
  async (job) => {
    console.log(`[cert-expiry-monitor] Running daily cert expiry scan (job ${job.id})`);

    const tenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, slug: true },
    });

    let totalFired = 0;
    for (const tenant of tenants) {
      try {
        const fired = await processTenant(tenant.id);
        totalFired += fired;
        if (fired > 0) {
          console.log(`[cert-expiry-monitor] [${tenant.slug}] fired ${fired} alert(s)`);
        }
      } catch (err) {
        console.error(
          `[cert-expiry-monitor] Tenant ${tenant.slug} (${tenant.id}) failed:`,
          err,
        );
      }
    }

    console.log(
      `[cert-expiry-monitor] Scan complete — ${totalFired} alert(s) fired across ${tenants.length} tenant(s)`,
    );
  },
  { connection: bullmqConnection },
);
