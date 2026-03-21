import type { FastifyInstance } from 'fastify';
import {
  getNotifications,
  markRead,
  markAllRead,
} from '../../../services/notification.service.js';

/**
 * Notification center REST API routes.
 *
 * GET   /api/v1/notifications                — List user's notifications (paginated, filterable)
 * GET   /api/v1/notifications/unread-count   — Get unread count for badge display
 * PATCH /api/v1/notifications/read-all       — Mark all notifications as read
 * PATCH /api/v1/notifications/:id/read       — Mark a single notification as read
 */
export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /api/v1/notifications ───────────────────────────────────────────────

  fastify.get('/api/v1/notifications', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId, userId } = user;

    const query = request.query as {
      unread?: string;
      page?: string;
      pageSize?: string;
    };

    const filters = {
      unread: query.unread === 'true' ? true : query.unread === 'false' ? false : undefined,
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    };

    const result = await getNotifications(tenantId, userId, filters);

    return reply.status(200).send(result);
  });

  // ─── GET /api/v1/notifications/unread-count ──────────────────────────────────
  // Must be registered before the :id parameter route to avoid route collision

  fastify.get('/api/v1/notifications/unread-count', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId, userId } = user;

    const result = await getNotifications(tenantId, userId, { unread: true, pageSize: 1 });

    return reply.status(200).send({ count: result.unreadCount });
  });

  // ─── PATCH /api/v1/notifications/read-all ────────────────────────────────────
  // Must be registered before the :id parameter route to avoid route collision

  fastify.patch('/api/v1/notifications/read-all', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId, userId } = user;

    await markAllRead(tenantId, userId);

    return reply.status(200).send({ success: true });
  });

  // ─── PATCH /api/v1/notifications/:id/read ────────────────────────────────────

  fastify.patch('/api/v1/notifications/:id/read', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId, userId } = user;
    const { id } = request.params as { id: string };

    await markRead(tenantId, userId, id);

    return reply.status(200).send({ success: true });
  });
}
