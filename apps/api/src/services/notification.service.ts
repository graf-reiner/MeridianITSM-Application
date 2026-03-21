import { Queue } from 'bullmq';
import { prisma } from '@meridian/db';

// ─── BullMQ Queue (email-notification) ───────────────────────────────────────
// Uses the same host/port extraction pattern as apps/worker/src/queues/connection.ts

const emailNotificationQueue = new Queue('email-notification', {
  connection: {
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
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotifyPayload {
  tenantId: string;
  userId: string;
  type: string; // NotificationType enum value
  title: string;
  body?: string;
  resourceId?: string;
  resource?: string; // 'ticket', 'change', etc.
  emailData?: {
    to: string;
    templateName: string;
    variables: Record<string, string>;
  };
}

// Minimal ticket shape needed for notification helpers
interface TicketForNotification {
  id: string;
  ticketNumber: number;
  title: string;
  assignedToId?: string | null;
  requestedById?: string | null;
}

// Minimal comment shape needed for notification helpers
interface CommentForNotification {
  id: string;
  visibility: string;
}

// ─── Core Dispatch ────────────────────────────────────────────────────────────

/**
 * Create an in-app notification and optionally enqueue an email notification job.
 * All errors are swallowed — notification failure must never block the caller.
 */
export async function notifyUser(payload: NotifyPayload): Promise<void> {
  try {
    // Create in-app notification record
    await prisma.notification.create({
      data: {
        tenantId: payload.tenantId,
        userId: payload.userId,
        type: payload.type as Parameters<typeof prisma.notification.create>[0]['data']['type'],
        title: payload.title,
        body: payload.body,
        resourceId: payload.resourceId,
        resource: payload.resource,
      },
    });

    // Enqueue email job if email data is provided
    if (payload.emailData) {
      await emailNotificationQueue.add('send-email', {
        tenantId: payload.tenantId,
        to: payload.emailData.to,
        templateName: payload.emailData.templateName,
        variables: payload.emailData.variables,
      });
    }
  } catch (err) {
    console.error('[notification.service] notifyUser failed:', err);
  }
}

// ─── Ticket Notification Helpers ──────────────────────────────────────────────

/**
 * Notify assignee when a ticket is created with an assignee.
 * Covers: TICKET_CREATED, TICKET_ASSIGNED (initial assignment)
 */
export async function notifyTicketCreated(
  tenantId: string,
  ticket: TicketForNotification,
  creatorId: string,
): Promise<void> {
  try {
    if (!ticket.assignedToId || ticket.assignedToId === creatorId) return;

    // Look up assignee email for email notification
    const assignee = await prisma.user.findFirst({
      where: { id: ticket.assignedToId, tenantId },
      select: { email: true },
    });

    await notifyUser({
      tenantId,
      userId: ticket.assignedToId,
      type: 'TICKET_ASSIGNED',
      title: `Ticket TKT-${ticket.ticketNumber} assigned to you`,
      body: ticket.title,
      resourceId: ticket.id,
      resource: 'ticket',
      emailData: assignee
        ? {
            to: assignee.email,
            templateName: 'ticket-assigned',
            variables: {
              ticketNumber: String(ticket.ticketNumber),
              ticketTitle: ticket.title,
              ticketId: ticket.id,
            },
          }
        : undefined,
    });
  } catch (err) {
    console.error('[notification.service] notifyTicketCreated failed:', err);
  }
}

/**
 * Notify assignee when a ticket is explicitly assigned to them.
 * Covers: TICKET_ASSIGNED
 */
export async function notifyTicketAssigned(
  tenantId: string,
  ticket: TicketForNotification,
  assigneeId: string,
  actorId: string,
): Promise<void> {
  try {
    if (assigneeId === actorId) return;

    const assignee = await prisma.user.findFirst({
      where: { id: assigneeId, tenantId },
      select: { email: true },
    });

    await notifyUser({
      tenantId,
      userId: assigneeId,
      type: 'TICKET_ASSIGNED',
      title: `Ticket TKT-${ticket.ticketNumber} assigned to you`,
      body: ticket.title,
      resourceId: ticket.id,
      resource: 'ticket',
      emailData: assignee
        ? {
            to: assignee.email,
            templateName: 'ticket-assigned',
            variables: {
              ticketNumber: String(ticket.ticketNumber),
              ticketTitle: ticket.title,
              ticketId: ticket.id,
            },
          }
        : undefined,
    });
  } catch (err) {
    console.error('[notification.service] notifyTicketAssigned failed:', err);
  }
}

/**
 * Notify requester and assignee when a public comment is added.
 * Covers: TICKET_COMMENTED
 */
export async function notifyTicketCommented(
  tenantId: string,
  ticket: TicketForNotification,
  comment: CommentForNotification,
  actorId: string,
): Promise<void> {
  try {
    const isPublic = comment.visibility === 'PUBLIC';

    const recipientIds = new Set<string>();

    // Requester gets notified on public comments
    if (isPublic && ticket.requestedById && ticket.requestedById !== actorId) {
      recipientIds.add(ticket.requestedById);
    }

    // Assignee gets notified (public or internal)
    if (ticket.assignedToId && ticket.assignedToId !== actorId) {
      recipientIds.add(ticket.assignedToId);
    }

    if (recipientIds.size === 0) return;

    // Batch fetch emails for all recipients
    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(recipientIds) }, tenantId },
      select: { id: true, email: true },
    });
    const emailMap = new Map(users.map((u) => [u.id, u.email]));

    for (const userId of recipientIds) {
      const email = emailMap.get(userId);
      await notifyUser({
        tenantId,
        userId,
        type: 'TICKET_COMMENTED',
        title: `New comment on TKT-${ticket.ticketNumber}`,
        body: ticket.title,
        resourceId: ticket.id,
        resource: 'ticket',
        emailData: email
          ? {
              to: email,
              templateName: 'ticket-commented',
              variables: {
                ticketNumber: String(ticket.ticketNumber),
                ticketTitle: ticket.title,
                ticketId: ticket.id,
              },
            }
          : undefined,
      });
    }
  } catch (err) {
    console.error('[notification.service] notifyTicketCommented failed:', err);
  }
}

/**
 * Notify the ticket requester when a ticket is resolved.
 * Covers: TICKET_RESOLVED
 */
export async function notifyTicketResolved(
  tenantId: string,
  ticket: TicketForNotification,
  actorId: string,
): Promise<void> {
  try {
    if (!ticket.requestedById || ticket.requestedById === actorId) return;

    const requester = await prisma.user.findFirst({
      where: { id: ticket.requestedById, tenantId },
      select: { email: true },
    });

    await notifyUser({
      tenantId,
      userId: ticket.requestedById,
      type: 'TICKET_RESOLVED',
      title: `Ticket TKT-${ticket.ticketNumber} has been resolved`,
      body: ticket.title,
      resourceId: ticket.id,
      resource: 'ticket',
      emailData: requester
        ? {
            to: requester.email,
            templateName: 'ticket-resolved',
            variables: {
              ticketNumber: String(ticket.ticketNumber),
              ticketTitle: ticket.title,
              ticketId: ticket.id,
            },
          }
        : undefined,
    });
  } catch (err) {
    console.error('[notification.service] notifyTicketResolved failed:', err);
  }
}

/**
 * Notify the assignee when ticket fields are updated (non-assignment, non-resolve changes).
 * Covers: TICKET_UPDATED
 */
export async function notifyTicketUpdated(
  tenantId: string,
  ticket: TicketForNotification,
  changes: string[],
  actorId: string,
): Promise<void> {
  try {
    if (!ticket.assignedToId || ticket.assignedToId === actorId || changes.length === 0) return;

    await notifyUser({
      tenantId,
      userId: ticket.assignedToId,
      type: 'TICKET_UPDATED',
      title: `Ticket TKT-${ticket.ticketNumber} was updated`,
      body: `Changed: ${changes.join(', ')}`,
      resourceId: ticket.id,
      resource: 'ticket',
    });
  } catch (err) {
    console.error('[notification.service] notifyTicketUpdated failed:', err);
  }
}

// ─── Notification Query Functions ─────────────────────────────────────────────

/**
 * Fetch paginated notifications for a user with optional unread filter.
 * Always returns unreadCount for badge display.
 */
export async function getNotifications(
  tenantId: string,
  userId: string,
  filters: { unread?: boolean; page?: number; pageSize?: number },
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { tenantId, userId };
  if (filters.unread === true) {
    where.isRead = false;
  }

  const [data, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { tenantId, userId, isRead: false } }),
  ]);

  return { data, total, unreadCount };
}

/**
 * Mark a single notification as read.
 * Scoped by tenantId + userId for multi-tenant security.
 */
export async function markRead(
  tenantId: string,
  userId: string,
  notificationId: string,
): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, tenantId, userId },
    data: { isRead: true, readAt: new Date() },
  });
}

/**
 * Mark all unread notifications as read for a user.
 */
export async function markAllRead(tenantId: string, userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { tenantId, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}
