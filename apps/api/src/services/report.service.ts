import { prisma } from '@meridian/db';
import { stringify } from 'csv-stringify/sync';
import { Queue } from 'bullmq';

// Queue names mirrored here to avoid cross-app import from apps/worker
const QUEUE_NAMES = {
  SLA_MONITOR: 'sla-monitor',
  EMAIL_NOTIFICATION: 'email-notification',
  EMAIL_POLLING: 'email-polling',
  CMDB_RECONCILIATION: 'cmdb-reconciliation',
  STRIPE_WEBHOOK: 'stripe-webhook',
  TRIAL_EXPIRY: 'trial-expiry',
  USAGE_SNAPSHOT: 'usage-snapshot',
  SCHEDULED_REPORT: 'scheduled-report',
} as const;

// BullMQ connection options (same host/port extraction pattern as worker)
const bullmqConnection = {
  host: (() => {
    try {
      return new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname;
    } catch {
      return 'localhost';
    }
  })(),
  port: (() => {
    try {
      return Number(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port) || 6379;
    } catch {
      return 6379;
    }
  })(),
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TicketReportFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  priority?: string;
  assignedToId?: string;
  categoryId?: string;
  format: 'csv' | 'json';
}

export interface SlaReportFilters {
  dateFrom?: string;
  dateTo?: string;
}

export interface ChangeReportFilters {
  dateFrom?: string;
  dateTo?: string;
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

/**
 * Returns aggregate dashboard statistics for a tenant.
 * Includes ticket counts, volume charts, top categories, and recent activity.
 */
export async function getDashboardStats(tenantId: string) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const last30Days = new Date(now);
  last30Days.setDate(last30Days.getDate() - 30);

  const [
    totalTickets,
    openTickets,
    resolvedToday,
    overdueTickets,
    volumeByPriority,
    recentActivity,
  ] = await Promise.all([
    // Total tickets
    prisma.ticket.count({ where: { tenantId } }),

    // Open tickets (not resolved/closed/cancelled)
    prisma.ticket.count({
      where: {
        tenantId,
        status: { in: ['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING'] },
      },
    }),

    // Resolved today
    prisma.ticket.count({
      where: {
        tenantId,
        status: 'RESOLVED',
        resolvedAt: { gte: startOfToday },
      },
    }),

    // Overdue (SLA breached, not resolved)
    prisma.ticket.count({
      where: {
        tenantId,
        slaBreachAt: { lt: now },
        status: { notIn: ['RESOLVED', 'CLOSED', 'CANCELLED'] },
      },
    }),

    // Ticket volume by priority
    prisma.ticket.groupBy({
      by: ['priority'],
      where: { tenantId },
      _count: { _all: true },
    }),

    // Recent activity — last 10 across all tickets for tenant
    prisma.ticketActivity.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        ticketId: true,
        actorId: true,
        activityType: true,
        fieldName: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
      },
    }),
  ]);

  // Volume by day (last 30 days) — raw SQL for DATE grouping
  const volumeByDayRaw = await prisma.$queryRaw<{ day: string; count: bigint }[]>`
    SELECT DATE("createdAt") as day, COUNT(*) as count
    FROM tickets
    WHERE "tenantId" = ${tenantId}::uuid
      AND "createdAt" >= ${last30Days}
    GROUP BY DATE("createdAt")
    ORDER BY day ASC
  `;

  const volumeByDay = volumeByDayRaw.map((r) => ({
    day: r.day,
    count: Number(r.count),
  }));

  // Top categories (top 5 by ticket count)
  const topCategoriesRaw = await prisma.ticket.groupBy({
    by: ['categoryId'],
    where: { tenantId, categoryId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { categoryId: 'desc' } },
    take: 5,
  });

  // Fetch category names
  const categoryIds = topCategoriesRaw
    .map((r) => r.categoryId)
    .filter((id): id is string => id !== null);

  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  });

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const topCategories = topCategoriesRaw.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryId ? (categoryMap.get(r.categoryId) ?? 'Unknown') : 'Uncategorized',
    count: r._count._all,
  }));

  return {
    totalTickets,
    openTickets,
    resolvedToday,
    overdueTickets,
    volumeByDay,
    volumeByPriority: volumeByPriority.map((r) => ({
      priority: r.priority,
      count: r._count._all,
    })),
    topCategories,
    recentActivity,
  };
}

// ─── Ticket Report ────────────────────────────────────────────────────────────

/**
 * Generates a ticket report with optional filters.
 * Returns CSV string or raw JSON array depending on format param.
 * Capped at 5000 records for memory protection.
 */
export async function getTicketReport(tenantId: string, filters: TicketReportFilters) {
  const where: Record<string, unknown> = { tenantId };

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters.categoryId) where.categoryId = filters.categoryId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tickets = await prisma.ticket.findMany({
    where: where as any,
    take: 5000,
    orderBy: { createdAt: 'desc' },
    include: {
      assignedTo: { select: { firstName: true, lastName: true } },
      category: { select: { name: true } },
      queue: { select: { name: true } },
    },
  });

  if (filters.format === 'csv') {
    const rows = tickets.map((t) => [
      `TKT-${String(t.ticketNumber).padStart(5, '0')}`,
      t.title,
      t.status,
      t.priority,
      t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '',
      t.category?.name ?? '',
      t.createdAt.toISOString(),
      t.resolvedAt?.toISOString() ?? '',
    ]);

    const csv = stringify(rows, {
      header: true,
      columns: ['Ticket Number', 'Title', 'Status', 'Priority', 'Assignee', 'Category', 'Created', 'Resolved'],
    });

    return { data: csv, format: 'csv' as const, count: tickets.length };
  }

  return { data: tickets, format: 'json' as const, count: tickets.length };
}

// ─── SLA Compliance Report ────────────────────────────────────────────────────

/**
 * Calculates SLA compliance metrics: breach rate, avg response/resolution times,
 * and per-priority breakdown.
 */
export async function getSlaComplianceReport(tenantId: string, filters: SlaReportFilters) {
  const where: Record<string, unknown> = {
    tenantId,
    status: { in: ['RESOLVED', 'CLOSED'] },
    slaBreachAt: { not: null }, // Only tickets that had SLA assigned
  };

  if (filters.dateFrom || filters.dateTo) {
    where.resolvedAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tickets = await prisma.ticket.findMany({
    where: where as any,
    select: {
      priority: true,
      createdAt: true,
      resolvedAt: true,
      firstResponseAt: true,
      slaBreachAt: true,
    },
  });

  const totalWithSla = tickets.length;
  let breachedCount = 0;
  let totalResponseMinutes = 0;
  let responseCount = 0;
  let totalResolutionMinutes = 0;
  let resolutionCount = 0;

  type PriorityStats = {
    total: number;
    breached: number;
    totalResolutionMinutes: number;
    resolutionCount: number;
  };

  const byPriority: Record<string, PriorityStats> = {};

  for (const ticket of tickets) {
    const breached = ticket.resolvedAt && ticket.slaBreachAt
      ? ticket.resolvedAt > ticket.slaBreachAt
      : false;

    if (breached) breachedCount++;

    // Response time
    if (ticket.firstResponseAt) {
      totalResponseMinutes +=
        (ticket.firstResponseAt.getTime() - ticket.createdAt.getTime()) / 60000;
      responseCount++;
    }

    // Resolution time
    if (ticket.resolvedAt) {
      totalResolutionMinutes +=
        (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 60000;
      resolutionCount++;
    }

    // Per-priority aggregation
    const p = ticket.priority;
    if (!byPriority[p]) {
      byPriority[p] = { total: 0, breached: 0, totalResolutionMinutes: 0, resolutionCount: 0 };
    }
    byPriority[p].total++;
    if (breached) byPriority[p].breached++;
    if (ticket.resolvedAt) {
      byPriority[p].totalResolutionMinutes +=
        (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 60000;
      byPriority[p].resolutionCount++;
    }
  }

  const complianceRate =
    totalWithSla > 0
      ? ((totalWithSla - breachedCount) / totalWithSla) * 100
      : 100;

  return {
    totalWithSla,
    breachedCount,
    complianceRate: Math.round(complianceRate * 100) / 100,
    avgResponseMinutes: responseCount > 0 ? Math.round(totalResponseMinutes / responseCount) : null,
    avgResolutionMinutes:
      resolutionCount > 0 ? Math.round(totalResolutionMinutes / resolutionCount) : null,
    byPriority: Object.entries(byPriority).map(([priority, stats]) => ({
      priority,
      total: stats.total,
      breached: stats.breached,
      complianceRate:
        stats.total > 0
          ? Math.round(((stats.total - stats.breached) / stats.total) * 10000) / 100
          : 100,
      avgResolutionMinutes:
        stats.resolutionCount > 0
          ? Math.round(stats.totalResolutionMinutes / stats.resolutionCount)
          : null,
    })),
  };
}

// ─── Change Report ────────────────────────────────────────────────────────────

/**
 * Aggregates change management statistics.
 * Note: Change CRUD is Phase 4 — this report infrastructure works once changes exist.
 */
export async function getChangeReport(tenantId: string, filters: ChangeReportFilters) {
  const where: Record<string, unknown> = { tenantId };

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereAny = where as any;

  const [totalChanges, byStatus, byRiskLevel, byType] = await Promise.all([
    prisma.change.count({ where: whereAny }),

    prisma.change.groupBy({
      by: ['status'],
      where: whereAny,
      _count: { _all: true },
    }),

    prisma.change.groupBy({
      by: ['riskLevel'],
      where: whereAny,
      _count: { _all: true },
    }),

    prisma.change.groupBy({
      by: ['type'],
      where: whereAny,
      _count: { _all: true },
    }),
  ]);

  return {
    totalChanges,
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
    byRiskLevel: byRiskLevel.map((r) => ({ riskLevel: r.riskLevel, count: r._count._all })),
    byType: byType.map((r) => ({ type: r.type, count: r._count._all })),
  };
}

// ─── System Health ────────────────────────────────────────────────────────────

/**
 * Returns BullMQ queue job counts and per-tenant DB stats.
 * Creates temporary Queue instances to read counts, then closes them.
 */
export async function getSystemHealth(tenantId: string) {
  const queueEntries = Object.entries(QUEUE_NAMES);
  const queueResults: {
    name: string;
    active: number;
    waiting: number;
    completed: number;
    failed: number;
    delayed: number;
  }[] = [];

  for (const [, queueName] of queueEntries) {
    const q = new Queue(queueName, { connection: bullmqConnection });
    try {
      const counts = await q.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
      queueResults.push({
        name: queueName,
        active: counts.active ?? 0,
        waiting: counts.waiting ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      });
    } finally {
      await q.close();
    }
  }

  const [users, tickets, articles] = await Promise.all([
    prisma.user.count({ where: { tenantId } }),
    prisma.ticket.count({ where: { tenantId } }),
    prisma.knowledgeArticle.count({ where: { tenantId } }),
  ]);

  return {
    queues: queueResults,
    dbStats: { users, tickets, articles },
  };
}

// ─── Software Inventory Report (Phase 8 / CASR-03) ────────────────────────────

export interface SoftwareInventoryReportFilters {
  softwareName?: string;
  vendor?: string;
  publisher?: string;
  ciClassKey?: string;
  page?: number;
  pageSize?: number;
}

export interface SoftwareInventoryRow {
  ciId: string;
  ciName: string;
  ciNumber: number;
  classKey: string;
  name: string;
  version: string;
  vendor: string | null;
  publisher: string | null;
  lastSeenAt: Date;
  // NB: licenseKey INTENTIONALLY OMITTED (Phase 8 threat T-8-05-02).
  //     Surfaced only by GET /api/v1/cmdb/cis/:id/software with cmdb.view.
}

/**
 * Phase 8 (CASR-03 / CRIT-5): software-by-CI listing for license reporting.
 *
 * Tenant-scoped via tenantId — the `where: { tenantId }` predicate is the
 * FIRST entry in the filter. This is the primary anti-leak guard (threat
 * T-8-05-04). Callers MUST supply tenantId from the authenticated session;
 * NEVER from request body / query string.
 *
 * `licenseKey` is intentionally OMITTED from the returned rows (explicit
 * `select` clause). The per-CI /api/v1/cmdb/cis/:id/software endpoint
 * surfaces it with cmdb.view permission.
 */
export async function getSoftwareInventoryReport(
  tenantId: string,
  filters: SoftwareInventoryReportFilters = {},
): Promise<{ data: SoftwareInventoryRow[]; count: number }> {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const skip = (page - 1) * pageSize;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    tenantId,
    ...(filters.softwareName && {
      name: { contains: filters.softwareName, mode: 'insensitive' as const },
    }),
    ...(filters.vendor && { vendor: filters.vendor }),
    ...(filters.publisher && { publisher: filters.publisher }),
    ...(filters.ciClassKey && {
      ci: { ciClass: { classKey: filters.ciClassKey } },
    }),
  };

  const [rows, count] = await Promise.all([
    prisma.cmdbSoftwareInstalled.findMany({
      where,
      select: {
        // Explicit column allowlist — omits licenseKey.
        ciId: true,
        name: true,
        version: true,
        vendor: true,
        publisher: true,
        lastSeenAt: true,
        ci: {
          select: {
            id: true,
            name: true,
            ciNumber: true,
            ciClass: { select: { classKey: true } },
          },
        },
      },
      orderBy: [{ ci: { name: 'asc' } }, { name: 'asc' }],
      skip,
      take: pageSize,
    }),
    prisma.cmdbSoftwareInstalled.count({ where }),
  ]);

  return {
    data: rows.map((r) => ({
      ciId: r.ciId,
      ciName: r.ci.name,
      ciNumber: r.ci.ciNumber,
      classKey: r.ci.ciClass.classKey,
      name: r.name,
      version: r.version,
      vendor: r.vendor,
      publisher: r.publisher,
      lastSeenAt: r.lastSeenAt,
    })),
    count,
  };
}
