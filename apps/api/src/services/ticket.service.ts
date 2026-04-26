import { prisma } from '@meridian/db';
import { calculateBreachAt, getResolutionMinutes, type Priority as SlaPriority, type HolidayEntry } from './sla.service.js';
import { dispatchNotificationEvent } from './notification-rules.service.js';
import { clearSlaAlerts } from '../workers/sla-monitor.worker.js';

/**
 * Loads the tenant's holiday list for use in SLA business-hours calculations.
 * Returns an empty array if the tenant has no holidays configured.
 */
async function loadTenantHolidays(tenantId: string): Promise<HolidayEntry[]> {
  const rows = await prisma.holiday.findMany({
    where: { tenantId },
    select: { date: true, recurring: true },
  });
  return rows.map((r) => ({ date: r.date, recurring: r.recurring }));
}

// ─── Status Transition Map ────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'PENDING', 'PENDING_APPROVAL', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['PENDING', 'PENDING_APPROVAL', 'RESOLVED', 'CANCELLED'],
  PENDING: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  PENDING_APPROVAL: ['OPEN', 'IN_PROGRESS', 'CANCELLED'], // Approved → OPEN/IN_PROGRESS, Rejected → CANCELLED
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: [],
  CANCELLED: [],
};

// ─── Priority Matrix (ITIL Impact x Urgency) ────────────────────────────────

type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const PRIORITY_MATRIX: Record<string, Record<string, PriorityLevel>> = {
  CRITICAL: { CRITICAL: 'CRITICAL', HIGH: 'CRITICAL', MEDIUM: 'HIGH',     LOW: 'MEDIUM' },
  HIGH:     { CRITICAL: 'CRITICAL', HIGH: 'HIGH',     MEDIUM: 'HIGH',     LOW: 'MEDIUM' },
  MEDIUM:   { CRITICAL: 'HIGH',     HIGH: 'HIGH',     MEDIUM: 'MEDIUM',   LOW: 'LOW' },
  LOW:      { CRITICAL: 'MEDIUM',   HIGH: 'MEDIUM',   MEDIUM: 'LOW',      LOW: 'LOW' },
};

/**
 * Calculate priority from Impact x Urgency matrix (ITIL standard).
 * If either value is missing, returns the explicit priority or MEDIUM default.
 */
export function calculatePriorityFromMatrix(
  impact?: string,
  urgency?: string,
  explicitPriority?: string,
): PriorityLevel {
  if (impact && urgency && PRIORITY_MATRIX[impact]?.[urgency]) {
    return PRIORITY_MATRIX[impact][urgency];
  }
  return (explicitPriority as PriorityLevel) ?? 'MEDIUM';
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateTicketData {
  title: string;
  description?: string;
  type?: 'INCIDENT' | 'SERVICE_REQUEST' | 'PROBLEM';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  impact?: string;
  urgency?: string;
  categoryId?: string;
  queueId?: string;
  assignedToId?: string;
  assignedGroupId?: string;
  requestedById?: string;
  slaId?: string;
  tags?: string[];
  source?: string;
  customFields?: Record<string, unknown>;
  isMajorIncident?: boolean;
  majorIncidentCoordinatorId?: string;
}

export interface UpdateTicketData {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  type?: string;
  assignedToId?: string;
  assignedGroupId?: string;
  queueId?: string;
  categoryId?: string;
  slaId?: string;
  resolution?: string;
  tags?: string[];
  isMajorIncident?: boolean;
  majorIncidentCoordinatorId?: string;
}

export interface AddCommentData {
  content: string;
  visibility?: 'PUBLIC' | 'INTERNAL';
  timeSpentMinutes?: number;
}

export interface TicketListFilters {
  status?: string;
  priority?: string;
  type?: string;
  assignedToId?: string;
  assignedGroupId?: string;
  requestedById?: string;
  categoryId?: string;
  queueId?: string;
  slaId?: string;
  source?: string;
  tags?: string[];
  search?: string;
  isMajorIncident?: boolean;
  dateFrom?: string;
  dateTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  resolvedFrom?: string;
  resolvedTo?: string;
  closedFrom?: string;
  closedTo?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TICKET_LIST_INCLUDE = {
  assignedTo: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  assignedGroup: {
    select: { id: true, name: true },
  },
  category: {
    select: { id: true, name: true },
  },
  queue: {
    select: { id: true, name: true },
  },
  majorIncidentCoordinator: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} as const;

const TICKET_DETAIL_INCLUDE = {
  assignedTo: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  assignedGroup: {
    select: { id: true, name: true },
  },
  requestedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  queue: {
    select: { id: true, name: true },
  },
  sla: {
    select: {
      id: true,
      name: true,
      p1ResponseMinutes: true,
      p1ResolutionMinutes: true,
      p2ResponseMinutes: true,
      p2ResolutionMinutes: true,
      p3ResponseMinutes: true,
      p3ResolutionMinutes: true,
      p4ResponseMinutes: true,
      p4ResolutionMinutes: true,
    },
  },
  category: {
    select: { id: true, name: true },
  },
  majorIncidentCoordinator: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  comments: {
    include: {
      author: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  attachments: {
    include: {
      uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  },
  activities: {
    orderBy: { createdAt: 'desc' as const },
    take: 50,
  },
  knowledgeArticles: {
    include: {
      knowledgeArticle: { select: { id: true, title: true, articleNumber: true } },
    },
  },
  cmdbTicketLinks: {
    include: {
      ci: { select: { id: true, name: true, ciNumber: true, type: true } },
    },
  },
} as const;

// ─── Exported Service Functions ───────────────────────────────────────────────

/**
 * Create a new ticket with a sequential, tenant-scoped ticket number.
 * Uses a FOR UPDATE lock to prevent duplicate ticket numbers under concurrent load.
 */
export async function createTicket(
  tenantId: string,
  data: CreateTicketData,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    // Get next ticket number atomically — use advisory lock to prevent race conditions
    // (FOR UPDATE cannot be used with aggregate functions in PostgreSQL)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_ticket_seq'))`;
    const result = await tx.$queryRaw<[{ next: bigint }]>`
      SELECT COALESCE(MAX("ticketNumber"), 0) + 1 AS next
      FROM tickets
      WHERE "tenantId" = ${tenantId}::uuid
    `;

    const ticketNumber = Number(result[0].next);

    // Resolve auto-assignment if queue has defaultAssigneeId
    let assignedToId = data.assignedToId;
    if (data.queueId && !assignedToId) {
      const queue = await tx.queue.findFirst({
        where: { id: data.queueId, tenantId },
        select: { autoAssign: true, defaultAssigneeId: true },
      });
      if (queue?.autoAssign && queue.defaultAssigneeId) {
        assignedToId = queue.defaultAssigneeId;
      }
    }

    // Calculate priority from Impact x Urgency matrix (ITIL) if impact/urgency provided
    const calculatedPriority = calculatePriorityFromMatrix(data.impact, data.urgency, data.priority);

    // Create ticket
    const ticket = await tx.ticket.create({
      data: {
        tenantId,
        ticketNumber,
        title: data.title,
        description: data.description,
        type: data.type ?? 'INCIDENT',
        priority: calculatedPriority,
        impact: data.impact,
        urgency: data.urgency,
        categoryId: data.categoryId,
        queueId: data.queueId,
        assignedToId,
        assignedGroupId: data.assignedGroupId,
        requestedById: data.requestedById,
        slaId: data.slaId,
        tags: data.tags ?? [],
        source: data.source ?? 'SERVICE_DESK',
        customFields: data.customFields ? (data.customFields as any) : null,
        isMajorIncident: data.isMajorIncident ?? false,
        majorIncidentCoordinatorId: data.majorIncidentCoordinatorId,
      },
      include: TICKET_LIST_INCLUDE,
    });

    // Calculate and store SLA breach time if an SLA policy is assigned
    if (data.slaId) {
      const sla = await tx.sLA.findFirst({
        where: { id: data.slaId, tenantId },
      });
      if (sla) {
        const priority = (data.priority ?? 'MEDIUM') as SlaPriority;
        const targetMinutes = getResolutionMinutes(sla as any, priority);
        const holidays = await loadTenantHolidays(tenantId);
        const slaBreachAt = calculateBreachAt(ticket.createdAt, targetMinutes, { ...(sla as any), holidays });
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { slaBreachAt },
        });
        // Update the ticket object for the return value
        (ticket as any).slaBreachAt = slaBreachAt;
      }
    }

    // Create audit activity
    await tx.ticketActivity.create({
      data: {
        tenantId,
        ticketId: ticket.id,
        actorId,
        activityType: 'CREATED',
        metadata: {
          title: ticket.title,
          type: ticket.type,
          priority: ticket.priority,
        },
      },
    });

    return ticket;
  }).then((createdTicket) => {
    // Fire-and-forget notification — must not block ticket creation
    void (async () => {
      try {
        await dispatchNotificationEvent(tenantId, 'TICKET_CREATED', {
          ticket: createdTicket, actorId,
        });
      } catch (err) {
        console.error('[ticket.service] notifyTicketCreated failed:', err);
      }
    })();
    return createdTicket;
  });
}

/**
 * Update a ticket, enforcing status transition rules and logging every field change.
 */
export async function updateTicket(
  tenantId: string,
  ticketId: string,
  data: UpdateTicketData,
  actorId: string,
) {
  const existing = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
  });

  if (!existing) {
    const err = new Error(`Ticket not found`) as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  // Validate status transition
  if (data.status && data.status !== existing.status) {
    const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(data.status)) {
      const err = new Error(
        `Invalid status transition from ${existing.status} to ${data.status}`,
      ) as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }
  }

  // Build update payload and track changed fields for audit trail
  const updates: Record<string, unknown> = {};
  const changedFields: Array<{ fieldName: string; oldValue: string; newValue: string }> = [];

  const trackChange = (field: string, oldVal: unknown, newVal: unknown) => {
    if (newVal !== undefined && String(newVal) !== String(oldVal ?? '')) {
      updates[field] = newVal;
      changedFields.push({
        fieldName: field,
        oldValue: String(oldVal ?? ''),
        newValue: String(newVal),
      });
    }
  };

  trackChange('title', existing.title, data.title);
  trackChange('description', existing.description, data.description);
  trackChange('priority', existing.priority, data.priority);
  trackChange('type', existing.type, data.type);
  trackChange('assignedToId', existing.assignedToId, data.assignedToId);
  trackChange('assignedGroupId', existing.assignedGroupId, data.assignedGroupId);
  trackChange('queueId', existing.queueId, data.queueId);
  trackChange('categoryId', existing.categoryId, data.categoryId);
  trackChange('slaId', existing.slaId, data.slaId);
  trackChange('resolution', existing.resolution, data.resolution);
  trackChange('isMajorIncident', existing.isMajorIncident, data.isMajorIncident);
  trackChange('majorIncidentCoordinatorId', existing.majorIncidentCoordinatorId, data.majorIncidentCoordinatorId);

  // Handle tags (compare as JSON string)
  if (data.tags !== undefined) {
    const oldTags = JSON.stringify(existing.tags ?? []);
    const newTags = JSON.stringify(data.tags);
    if (oldTags !== newTags) {
      updates.tags = data.tags;
      changedFields.push({
        fieldName: 'tags',
        oldValue: oldTags,
        newValue: newTags,
      });
    }
  }

  // Recalculate SLA breach time when slaId changes
  if (data.slaId && data.slaId !== existing.slaId) {
    const sla = await prisma.sLA.findFirst({
      where: { id: data.slaId, tenantId },
    });
    if (sla) {
      const priority = (data.priority ?? existing.priority ?? 'MEDIUM') as SlaPriority;
      const targetMinutes = getResolutionMinutes(sla as any, priority);
      const holidays = await loadTenantHolidays(tenantId);
      const slaBreachAt = calculateBreachAt(existing.createdAt, targetMinutes, { ...(sla as any), holidays });
      updates.slaBreachAt = slaBreachAt;
    }
  }

  // Recalculate SLA breach time when priority changes on a ticket that already has an SLA
  if (data.priority && data.priority !== existing.priority && existing.slaId && !data.slaId) {
    const sla = await prisma.sLA.findFirst({
      where: { id: existing.slaId, tenantId },
    });
    if (sla) {
      const targetMinutes = getResolutionMinutes(sla as any, data.priority as SlaPriority);
      const holidays = await loadTenantHolidays(tenantId);
      const slaBreachAt = calculateBreachAt(existing.createdAt, targetMinutes, { ...(sla as any), holidays });
      updates.slaBreachAt = slaBreachAt;
    }
  }

  // Handle status change with timestamp side-effects
  if (data.status && data.status !== existing.status) {
    updates.status = data.status;
    changedFields.push({
      fieldName: 'status',
      oldValue: existing.status,
      newValue: data.status,
    });

    if (data.status === 'RESOLVED') {
      updates.resolvedAt = new Date();
      // Clear SLA alert tracking so alerts can re-fire if ticket is reopened
      clearSlaAlerts(existing.id).catch(() => {});
    }
    if (data.status === 'CLOSED') {
      updates.closedAt = new Date();
      clearSlaAlerts(existing.id).catch(() => {});
    }

    // SLA pause: record pause timestamp in customFields when entering PENDING
    if (data.status === 'PENDING') {
      const currentCustomFields =
        (existing.customFields as Record<string, unknown> | null) ?? {};
      updates.customFields = {
        ...currentCustomFields,
        slaPausedAt: new Date().toISOString(),
      };
    }

    // SLA resume: shift slaBreachAt forward by time spent in PENDING
    if (existing.status === 'PENDING' && data.status !== 'PENDING') {
      const currentCustomFields =
        (existing.customFields as Record<string, unknown> | null) ?? {};
      const slaPausedAt = currentCustomFields.slaPausedAt as string | undefined;

      if (slaPausedAt && existing.slaBreachAt) {
        const pauseStart = new Date(slaPausedAt);
        const pauseDurationMs = Date.now() - pauseStart.getTime();
        const newSlaBreachAt = new Date(existing.slaBreachAt.getTime() + pauseDurationMs);
        updates.slaBreachAt = newSlaBreachAt;

        // Clear the slaPausedAt marker
        const { slaPausedAt: _removed, ...restCustomFields } = currentCustomFields;
        updates.customFields = restCustomFields;
      }
    }
  }

  // Execute update and audit log in a transaction
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.update({
      where: { id: ticketId },
      data: updates,
      include: TICKET_LIST_INCLUDE,
    });

    // Log each changed field as a separate activity record
    for (const changed of changedFields) {
      await tx.ticketActivity.create({
        data: {
          tenantId,
          ticketId,
          actorId,
          activityType: 'FIELD_CHANGED',
          fieldName: changed.fieldName,
          oldValue: changed.oldValue,
          newValue: changed.newValue,
        },
      });
    }

    return ticket;
  }).then((updatedTicket) => {
    // Fire-and-forget notifications — must not block ticket update
    const newStatus = data.status;
    const newAssignedToId = data.assignedToId;
    const otherChangedFields = changedFields
      .map((c) => c.fieldName)
      .filter((f) => f !== 'status' && f !== 'assignedToId');

    void (async () => {
      try {
        if (newStatus === 'RESOLVED') {
          await dispatchNotificationEvent(tenantId, 'TICKET_RESOLVED', { ticket: updatedTicket, actorId });
        } else if (newAssignedToId && newAssignedToId !== existing.assignedToId) {
          await dispatchNotificationEvent(tenantId, 'TICKET_ASSIGNED', { ticket: updatedTicket, actorId, newAssignedToId });
        } else if (otherChangedFields.length > 0) {
          await dispatchNotificationEvent(tenantId, 'TICKET_UPDATED', { ticket: updatedTicket, actorId, changedFields: otherChangedFields });
        }
      } catch (err) {
        console.error('[ticket.service] update notification failed:', err);
      }
    })();

    return updatedTicket;
  });
}

/**
 * Add a comment to a ticket.
 * Tracks first response time when a non-requester agent/admin comments.
 */
export async function addComment(
  tenantId: string,
  ticketId: string,
  data: AddCommentData,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({
      where: { id: ticketId, tenantId },
      select: { firstResponseAt: true, requestedById: true, assignedToId: true, ticketNumber: true, title: true },
    });

    if (!ticket) {
      const err = new Error('Ticket not found') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }

    // Create the comment
    const comment = await tx.ticketComment.create({
      data: {
        tenantId,
        ticketId,
        authorId: actorId,
        content: data.content,
        visibility: data.visibility ?? 'PUBLIC',
        timeSpentMinutes: data.timeSpentMinutes,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Track first response: set firstResponseAt if not yet set and actor is not the requester
    const isFirstResponse =
      !ticket.firstResponseAt && ticket.requestedById !== actorId;

    if (isFirstResponse) {
      await tx.ticket.update({
        where: { id: ticketId },
        data: { firstResponseAt: new Date() },
      });
    }

    // Log activity
    await tx.ticketActivity.create({
      data: {
        tenantId,
        ticketId,
        actorId,
        activityType: 'COMMENT_ADDED',
        metadata: {
          visibility: comment.visibility,
          commentId: comment.id,
        },
      },
    });

    return { comment, ticket };
  }).then(({ comment, ticket }) => {
    // Fire-and-forget notification — must not block comment creation
    const ticketForNotify = {
      id: ticketId,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      assignedToId: ticket.assignedToId,
      requestedById: ticket.requestedById,
    };

    void (async () => {
      try {
        await dispatchNotificationEvent(tenantId, 'TICKET_COMMENTED', {
          ticket: ticketForNotify, comment, actorId,
        });
      } catch (err) {
        console.error('[ticket.service] notifyTicketCommented failed:', err);
      }
    })();

    return comment;
  });
}

/**
 * Get a paginated, filtered list of tickets for a tenant.
 */
export async function getTicketList(tenantId: string, filters: TicketListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { tenantId };

  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.type) where.type = filters.type;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters.assignedGroupId) where.assignedGroupId = filters.assignedGroupId;
  if (filters.requestedById) where.requestedById = filters.requestedById;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.queueId) where.queueId = filters.queueId;
  if (filters.slaId) where.slaId = filters.slaId;
  if (filters.source) where.source = filters.source;
  if (filters.tags?.length) where.tags = { hasSome: filters.tags };
  if (filters.isMajorIncident !== undefined) where.isMajorIncident = filters.isMajorIncident;

  // Date range filters
  const dateRanges: [string, string, string | undefined, string | undefined][] = [
    ['createdAt', 'createdAt', filters.dateFrom, filters.dateTo],
    ['updatedAt', 'updatedAt', filters.updatedFrom, filters.updatedTo],
    ['resolvedAt', 'resolvedAt', filters.resolvedFrom, filters.resolvedTo],
    ['closedAt', 'closedAt', filters.closedFrom, filters.closedTo],
  ];
  for (const [, field, from, to] of dateRanges) {
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.gte = new Date(from);
      if (to) range.lte = new Date(to);
      where[field] = range;
    }
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  // Dynamic sort with whitelist
  const VALID_SORT_FIELDS = ['createdAt', 'updatedAt', 'priority', 'status', 'title', 'ticketNumber', 'resolvedAt', 'closedAt', 'type', 'source'];
  const sortField = VALID_SORT_FIELDS.includes(filters.sortBy ?? '') ? filters.sortBy! : 'createdAt';
  const sortDirection = filters.sortDir === 'asc' ? 'asc' : 'desc';

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: TICKET_LIST_INCLUDE,
      orderBy: { [sortField]: sortDirection },
      skip,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return { data: tickets, total, page, pageSize };
}

/**
 * Get full ticket detail including all relations.
 */
export async function getTicketDetail(tenantId: string, ticketId: string) {
  return prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    include: TICKET_DETAIL_INCLUDE,
  });
}

/**
 * Assign a ticket to a user, logging the assignment change.
 */
export async function assignTicket(
  tenantId: string,
  ticketId: string,
  assignedToId: string,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.ticket.findFirst({
      where: { id: ticketId, tenantId },
      select: { assignedToId: true },
    });

    if (!existing) {
      const err = new Error('Ticket not found') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }

    const ticket = await tx.ticket.update({
      where: { id: ticketId },
      data: { assignedToId },
      include: TICKET_LIST_INCLUDE,
    });

    await tx.ticketActivity.create({
      data: {
        tenantId,
        ticketId,
        actorId,
        activityType: 'ASSIGNMENT_CHANGED',
        fieldName: 'assignedToId',
        oldValue: existing.assignedToId ?? '',
        newValue: assignedToId,
      },
    });

    return ticket;
  }).then((assignedTicket) => {
    // Fire-and-forget notification — must not block ticket assignment
    void (async () => {
      try {
        await dispatchNotificationEvent(tenantId, 'TICKET_ASSIGNED', {
          ticket: assignedTicket, actorId, newAssignedToId: assignedToId,
        });
      } catch (err) {
        console.error('[ticket.service] notifyTicketAssigned failed:', err);
      }
    })();
    return assignedTicket;
  });
}

/**
 * Link a knowledge article to a ticket (upsert to handle re-link).
 */
export async function linkKnowledgeArticle(
  tenantId: string,
  ticketId: string,
  knowledgeArticleId: string,
) {
  return prisma.ticketKnowledgeArticle.upsert({
    where: {
      ticketId_knowledgeArticleId: {
        ticketId,
        knowledgeArticleId,
      },
    },
    create: {
      tenantId,
      ticketId,
      knowledgeArticleId,
    },
    update: {},
  });
}

/**
 * Link a CMDB CI to a ticket (upsert to handle re-link).
 */
export async function linkCmdbItem(
  tenantId: string,
  ticketId: string,
  ciId: string,
  linkType: 'AFFECTED' | 'RELATED' | 'CAUSED_BY' = 'AFFECTED',
) {
  return prisma.cmdbTicketLink.upsert({
    where: {
      ciId_ticketId: {
        ciId,
        ticketId,
      },
    },
    create: {
      tenantId,
      ciId,
      ticketId,
      linkType,
    },
    update: { linkType },
  });
}

// ─── Major Incident Promotion / De-escalation ───────────────────────────────

const MAJOR_INCIDENT_OPEN_STATUSES = new Set(['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING']);

export interface PromoteMajorIncidentData {
  coordinatorId: string;
  impact: 'HIGH' | 'CRITICAL';
  urgency: 'HIGH' | 'CRITICAL';
  summary: string;
  bridgeUrl?: string | null;
}

function fullName(u: { firstName?: string | null; lastName?: string | null; email: string }): string {
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return name || u.email;
}

/**
 * Promote an existing INCIDENT-type ticket to a Major Incident.
 *
 * Atomic operation: updates ticket flag/coordinator/priority/impact/urgency,
 * writes one TicketActivity row per changed field, posts an INTERNAL ticket
 * comment with the situation summary, and dispatches the
 * MAJOR_INCIDENT_DECLARED event so the coordinator is notified.
 *
 * Preconditions (throws statusCode-tagged Error if violated):
 *   - ticket exists in tenant
 *   - ticket.type === 'INCIDENT'
 *   - ticket.status is open (NEW, OPEN, IN_PROGRESS, PENDING)
 *   - ticket.isMajorIncident === false
 *   - coordinator exists in same tenant
 */
export async function promoteToMajorIncident(
  tenantId: string,
  ticketId: string,
  data: PromoteMajorIncidentData,
  actorId: string,
) {
  const existing = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      impact: true,
      urgency: true,
      isMajorIncident: true,
      majorIncidentCoordinatorId: true,
    },
  });

  if (!existing) {
    const err = new Error('Ticket not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  if (existing.type !== 'INCIDENT') {
    const err = new Error('Only INCIDENT-type tickets can be promoted to a Major Incident') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  if (!MAJOR_INCIDENT_OPEN_STATUSES.has(existing.status)) {
    const err = new Error(`Ticket status ${existing.status} is not open; cannot promote`) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  if (existing.isMajorIncident) {
    const err = new Error('Ticket is already a Major Incident') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const [coordinator, actor] = await Promise.all([
    prisma.user.findFirst({
      where: { id: data.coordinatorId, tenantId },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.user.findFirst({
      where: { id: actorId, tenantId },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  if (!coordinator) {
    const err = new Error('Coordinator not found in tenant') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const changedFields: Array<{ fieldName: string; oldValue: string; newValue: string }> = [
    { fieldName: 'isMajorIncident', oldValue: 'false', newValue: 'true' },
    {
      fieldName: 'majorIncidentCoordinatorId',
      oldValue: String(existing.majorIncidentCoordinatorId ?? ''),
      newValue: data.coordinatorId,
    },
    { fieldName: 'impact', oldValue: String(existing.impact ?? ''), newValue: data.impact },
    { fieldName: 'urgency', oldValue: String(existing.urgency ?? ''), newValue: data.urgency },
  ];
  if (existing.priority !== 'CRITICAL') {
    changedFields.push({ fieldName: 'priority', oldValue: existing.priority, newValue: 'CRITICAL' });
  }

  const actorName = actor ? fullName(actor) : 'Unknown';
  const coordinatorName = fullName(coordinator);
  const commentBody = [
    `**Promoted to Major Incident** by ${actorName}.`,
    `Coordinator: ${coordinatorName}`,
    `Impact: ${data.impact} · Urgency: ${data.urgency} · Priority: CRITICAL`,
    data.bridgeUrl ? `Bridge: ${data.bridgeUrl}` : null,
    '',
    `**Summary:** ${data.summary}`,
  ]
    .filter(Boolean)
    .join('\n');

  const updatedTicket = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        isMajorIncident: true,
        majorIncidentCoordinatorId: data.coordinatorId,
        priority: 'CRITICAL',
        impact: data.impact,
        urgency: data.urgency,
      },
      include: TICKET_LIST_INCLUDE,
    });

    for (const c of changedFields) {
      await tx.ticketActivity.create({
        data: {
          tenantId,
          ticketId,
          actorId,
          activityType: 'FIELD_CHANGED',
          fieldName: c.fieldName,
          oldValue: c.oldValue,
          newValue: c.newValue,
        },
      });
    }

    await tx.ticketComment.create({
      data: {
        tenantId,
        ticketId,
        authorId: actorId,
        content: commentBody,
        visibility: 'INTERNAL',
      },
    });

    return ticket;
  });

  // Fire-and-forget notification — must not block the promotion
  void (async () => {
    try {
      await dispatchNotificationEvent(tenantId, 'MAJOR_INCIDENT_DECLARED', {
        ticket: updatedTicket as any,
        actorId,
        coordinatorId: data.coordinatorId,
      });
    } catch (err) {
      console.error('[ticket.service] promoteToMajorIncident notification failed:', err);
    }
  })();

  return updatedTicket;
}

/**
 * De-escalate a Major Incident back to a regular ticket.
 *
 * Clears `isMajorIncident` and `majorIncidentCoordinatorId`, logs activity,
 * posts an INTERNAL audit comment. No notification fires (de-escalation is
 * not urgent).
 *
 * Preconditions (throws statusCode-tagged Error if violated):
 *   - ticket exists in tenant
 *   - ticket.isMajorIncident === true
 */
export async function deescalateMajorIncident(
  tenantId: string,
  ticketId: string,
  reason: string,
  actorId: string,
) {
  const existing = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: {
      id: true,
      isMajorIncident: true,
      majorIncidentCoordinatorId: true,
    },
  });

  if (!existing) {
    const err = new Error('Ticket not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  if (!existing.isMajorIncident) {
    const err = new Error('Ticket is not a Major Incident') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const actor = await prisma.user.findFirst({
    where: { id: actorId, tenantId },
    select: { firstName: true, lastName: true, email: true },
  });
  const actorName = actor ? fullName(actor) : 'Unknown';

  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        isMajorIncident: false,
        majorIncidentCoordinatorId: null,
      },
      include: TICKET_LIST_INCLUDE,
    });

    await tx.ticketActivity.create({
      data: {
        tenantId,
        ticketId,
        actorId,
        activityType: 'FIELD_CHANGED',
        fieldName: 'isMajorIncident',
        oldValue: 'true',
        newValue: 'false',
      },
    });
    if (existing.majorIncidentCoordinatorId) {
      await tx.ticketActivity.create({
        data: {
          tenantId,
          ticketId,
          actorId,
          activityType: 'FIELD_CHANGED',
          fieldName: 'majorIncidentCoordinatorId',
          oldValue: existing.majorIncidentCoordinatorId,
          newValue: '',
        },
      });
    }

    await tx.ticketComment.create({
      data: {
        tenantId,
        ticketId,
        authorId: actorId,
        content: `**De-escalated from Major Incident** by ${actorName}.\n\n**Reason:** ${reason}`,
        visibility: 'INTERNAL',
      },
    });

    return ticket;
  });
}
