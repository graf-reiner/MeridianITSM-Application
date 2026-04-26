import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

/**
 * Major Incident detection worker.
 *
 * Runs every minute. For each active tenant, scans INCIDENT-type tickets
 * created in the last 10 minutes that are NOT already a Major Incident, and
 * surfaces likely outages so an admin can decide whether to formally promote.
 *
 * Detection rules (any single match fires a SYSTEM notification):
 *   1. Category clustering — ≥5 incidents in the same category
 *   2. CI clustering       — ≥5 incidents linked to the same CMDB CI
 *   3. Critical CI hit     — any incident linked to a CMDB CI with
 *                            criticality='CRITICAL' and environment='PRODUCTION'
 *
 * Notifications go to users with admin or msp_admin roles in the tenant
 * (these roles get the `tickets.major_incident.declare` permission via wildcards).
 *
 * V1 is opinionated. Future work will expose thresholds + recipients via the
 * notification-rules engine for tenant-level configurability.
 */

const CATEGORY_THRESHOLD = 5;
const CI_THRESHOLD = 5;
const LOOKBACK_MINUTES = 10;

export const majorIncidentDetectionWorker = new Worker(
  QUEUE_NAMES.MAJOR_INCIDENT_DETECTION,
  async (_job) => {
    console.log('[major-incident-detection] Starting scan');

    const cutoff = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000);

    const activeTenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    let totalSignals = 0;

    for (const tenant of activeTenants) {
      try {
        // Pull recent open INCIDENT tickets that are not yet major incidents.
        const incidents = await prisma.ticket.findMany({
          where: {
            tenantId: tenant.id,
            type: 'INCIDENT',
            isMajorIncident: false,
            status: { in: ['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING'] },
            createdAt: { gte: cutoff },
          },
          select: {
            id: true,
            ticketNumber: true,
            categoryId: true,
            category: { select: { name: true } },
            cmdbIncidentLinks: {
              select: {
                ciId: true,
                ci: {
                  select: {
                    name: true,
                    criticality: true,
                    environment: true,
                  },
                },
              },
            },
          },
        });

        if (incidents.length === 0) continue;

        // Resolve admin recipients (role wildcards grant
        // tickets.major_incident.declare for v1).
        const admins = await prisma.user.findMany({
          where: {
            tenantId: tenant.id,
            status: 'ACTIVE',
            userRoles: {
              some: {
                role: { slug: { in: ['admin', 'msp_admin'] } },
              },
            },
          },
          select: { id: true },
        });
        if (admins.length === 0) continue;

        const signals: string[] = [];

        // ── Rule 1: Category clustering ────────────────────────────────────
        const byCategory = new Map<string, { name: string; count: number }>();
        for (const inc of incidents) {
          if (!inc.categoryId || !inc.category) continue;
          const existing = byCategory.get(inc.categoryId);
          if (existing) {
            existing.count++;
          } else {
            byCategory.set(inc.categoryId, { name: inc.category.name, count: 1 });
          }
        }
        for (const [, { name, count }] of byCategory) {
          if (count >= CATEGORY_THRESHOLD) {
            signals.push(
              `${count} new incidents in category "${name}" within the last ${LOOKBACK_MINUTES} minutes.`,
            );
          }
        }

        // ── Rule 2: CI clustering ──────────────────────────────────────────
        const byCi = new Map<string, { name: string; count: number }>();
        for (const inc of incidents) {
          for (const link of inc.cmdbIncidentLinks) {
            const existing = byCi.get(link.ciId);
            if (existing) {
              existing.count++;
            } else {
              byCi.set(link.ciId, { name: link.ci?.name ?? 'unknown CI', count: 1 });
            }
          }
        }
        for (const [, { name, count }] of byCi) {
          if (count >= CI_THRESHOLD) {
            signals.push(
              `${count} new incidents reference CI "${name}" within the last ${LOOKBACK_MINUTES} minutes.`,
            );
          }
        }

        // ── Rule 3: Any hit on a critical-production CI ────────────────────
        const criticalCiHits = new Set<string>();
        for (const inc of incidents) {
          for (const link of inc.cmdbIncidentLinks) {
            const ci = link.ci;
            if (!ci) continue;
            if (
              (ci.criticality ?? '').toUpperCase() === 'CRITICAL' &&
              ci.environment === 'PRODUCTION'
            ) {
              criticalCiHits.add(ci.name ?? 'unknown CI');
            }
          }
        }
        for (const ciName of criticalCiHits) {
          signals.push(
            `Incident reported against critical production CI "${ciName}" — review for Major Incident promotion.`,
          );
        }

        if (signals.length === 0) continue;

        // Single combined notification per tenant per tick (avoids spam).
        const body = signals.join('\n');
        for (const admin of admins) {
          await prisma.notification.create({
            data: {
              tenantId: tenant.id,
              userId: admin.id,
              type: 'SYSTEM',
              title: 'Possible Major Incident detected',
              body,
              resource: 'major-incident',
            },
          });
        }

        totalSignals += signals.length;
        console.log(
          `[major-incident-detection] Tenant ${tenant.id}: ${signals.length} signal(s), notified ${admins.length} admin(s)`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[major-incident-detection] Error processing tenant ${tenant.id}: ${message}`);
        // Continue with the next tenant
      }
    }

    console.log(`[major-incident-detection] Scan complete: ${totalSignals} signal(s) across all tenants`);
  },
  {
    connection: bullmqConnection,
    concurrency: 1,
  },
);

majorIncidentDetectionWorker.on('failed', (job, err) => {
  console.error(`[major-incident-detection] Job ${job?.id} failed:`, err.message);
});
