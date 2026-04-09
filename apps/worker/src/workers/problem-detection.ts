import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

/**
 * Proactive Problem Detection worker.
 *
 * Runs daily at 4 AM UTC. For each active tenant, scans resolved/closed
 * incidents from the last 30 days and detects potential recurring problems:
 *
 * 1. Category clustering: if a category has 5+ incidents, flag it.
 * 2. Assignee + keyword clustering: if the same assignee has 3+ tickets
 *    with similar title keywords, flag it.
 *
 * Creates SYSTEM notifications for tenant admins when patterns are found.
 */

const CATEGORY_THRESHOLD = 5;
const ASSIGNEE_KEYWORD_THRESHOLD = 3;
const LOOKBACK_DAYS = 30;

/**
 * Extract significant keywords from a ticket title.
 * Filters out common stop words and short tokens.
 */
function extractKeywords(title: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'not',
    'no', 'but', 'or', 'and', 'if', 'so', 'it', 'its', 'this', 'that',
    'my', 'your', 'our', 'we', 'they', 'i', 'me', 'he', 'she', 'her',
    'him', 'them', 'us', 'need', 'help', 'please', 'issue', 'problem',
    'request', 'ticket', 'new', 'get', 'unable', 'cannot', 'error',
  ]);

  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Check if two keyword sets share enough overlap to be considered similar.
 * Requires at least 1 keyword in common (Jaccard-like check).
 */
function hasSimilarKeywords(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setB = new Set(b);
  const overlap = a.filter((w) => setB.has(w)).length;
  return overlap >= 1;
}

export const problemDetectionWorker = new Worker(
  QUEUE_NAMES.PROBLEM_DETECTION,
  async (_job) => {
    console.log('[problem-detection] Starting proactive problem detection scan');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    // Get all active tenants
    const activeTenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    console.log(`[problem-detection] Scanning ${activeTenants.length} active tenants`);

    let totalPatterns = 0;

    for (const tenant of activeTenants) {
      try {
        // Fetch resolved/closed incidents for this tenant in the lookback window
        const incidents = await prisma.ticket.findMany({
          where: {
            tenantId: tenant.id,
            type: 'INCIDENT',
            status: { in: ['RESOLVED', 'CLOSED'] },
            resolvedAt: { gte: cutoff },
          },
          select: {
            id: true,
            title: true,
            categoryId: true,
            assignedToId: true,
            category: { select: { id: true, name: true } },
          },
        });

        if (incidents.length === 0) continue;

        // Find admin users to notify (users with admin or msp_admin roles)
        const admins = await prisma.user.findMany({
          where: {
            tenantId: tenant.id,
            status: 'ACTIVE',
            userRoles: {
              some: {
                role: {
                  slug: { in: ['admin', 'msp_admin'] },
                },
              },
            },
          },
          select: { id: true },
        });

        if (admins.length === 0) continue;

        const patternsFound: string[] = [];

        // ── 1. Category clustering ──────────────────────────────────────────
        const categoryMap = new Map<string, { name: string; count: number }>();
        for (const inc of incidents) {
          if (!inc.categoryId || !inc.category) continue;
          const existing = categoryMap.get(inc.categoryId);
          if (existing) {
            existing.count++;
          } else {
            categoryMap.set(inc.categoryId, { name: inc.category.name, count: 1 });
          }
        }

        for (const [categoryId, { name, count }] of categoryMap) {
          if (count >= CATEGORY_THRESHOLD) {
            patternsFound.push(
              `Category "${name}": ${count} incidents in the last ${LOOKBACK_DAYS} days (category ID: ${categoryId})`,
            );
          }
        }

        // ── 2. Assignee + keyword clustering ────────────────────────────────
        const assigneeTickets = new Map<string, Array<{ title: string; keywords: string[] }>>();
        for (const inc of incidents) {
          if (!inc.assignedToId) continue;
          const list = assigneeTickets.get(inc.assignedToId) ?? [];
          list.push({ title: inc.title, keywords: extractKeywords(inc.title) });
          assigneeTickets.set(inc.assignedToId, list);
        }

        for (const [_assigneeId, tickets] of assigneeTickets) {
          if (tickets.length < ASSIGNEE_KEYWORD_THRESHOLD) continue;

          // Group tickets by keyword similarity (simple clustering)
          const clusters: Array<{ titles: string[]; keywords: string[] }> = [];

          for (const ticket of tickets) {
            let added = false;
            for (const cluster of clusters) {
              if (hasSimilarKeywords(ticket.keywords, cluster.keywords)) {
                cluster.titles.push(ticket.title);
                // Merge keywords
                for (const kw of ticket.keywords) {
                  if (!cluster.keywords.includes(kw)) cluster.keywords.push(kw);
                }
                added = true;
                break;
              }
            }
            if (!added) {
              clusters.push({ titles: [ticket.title], keywords: [...ticket.keywords] });
            }
          }

          for (const cluster of clusters) {
            if (cluster.titles.length >= ASSIGNEE_KEYWORD_THRESHOLD) {
              const sampleTitles = cluster.titles.slice(0, 3).map((t) => `"${t}"`).join(', ');
              patternsFound.push(
                `Assignee cluster: ${cluster.titles.length} similar tickets (e.g., ${sampleTitles})`,
              );
            }
          }
        }

        // ── 3. Create notifications for admins ──────────────────────────────
        if (patternsFound.length > 0) {
          totalPatterns += patternsFound.length;
          const body = patternsFound.join('\n');

          for (const admin of admins) {
            await prisma.notification.create({
              data: {
                tenantId: tenant.id,
                userId: admin.id,
                type: 'SYSTEM',
                title: 'Potential recurring problem detected',
                body,
              },
            });
          }

          console.log(
            `[problem-detection] Tenant ${tenant.id}: ${patternsFound.length} pattern(s) detected, notified ${admins.length} admin(s)`,
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[problem-detection] Error processing tenant ${tenant.id}: ${message}`);
        // Continue processing remaining tenants
      }
    }

    console.log(`[problem-detection] Scan complete: ${totalPatterns} pattern(s) found across all tenants`);
  },
  {
    connection: bullmqConnection,
    concurrency: 1, // Single instance — daily cron, no parallelism needed
  },
);

problemDetectionWorker.on('failed', (job, err) => {
  console.error(`[problem-detection] Job ${job?.id} failed:`, err.message);
});
