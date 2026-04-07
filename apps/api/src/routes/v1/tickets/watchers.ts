import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Ticket Watcher REST API routes.
 *
 * GET    /api/v1/tickets/:id/watchers      — List watchers for a ticket
 * POST   /api/v1/tickets/:id/watchers      — Add a watcher
 * DELETE /api/v1/tickets/:id/watchers/:uid — Remove a watcher
 * GET    /api/v1/tickets/watching           — List tickets the current user is watching
 */
export async function ticketWatcherRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /api/v1/tickets/:id/watchers ───────────────────────────────────────

  fastify.get('/api/v1/tickets/:id/watchers', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const watchers = await prisma.ticketWatcher.findMany({
      where: { ticketId: id, tenantId: user.tenantId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return reply.status(200).send(watchers);
  });

  // ─── POST /api/v1/tickets/:id/watchers — Add watcher ───────────────────────

  fastify.post('/api/v1/tickets/:id/watchers', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };
    const { userId } = request.body as { userId?: string };

    // Default to self-watch if no userId provided
    const watchUserId = userId ?? user.userId;

    // Verify ticket exists and belongs to tenant
    const ticket = await prisma.ticket.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    // Upsert — idempotent
    const watcher = await prisma.ticketWatcher.upsert({
      where: { ticketId_userId: { ticketId: id, userId: watchUserId } },
      update: {},
      create: {
        tenantId: user.tenantId,
        ticketId: id,
        userId: watchUserId,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Log the activity
    await prisma.ticketActivity.create({
      data: {
        tenantId: user.tenantId,
        ticketId: id,
        actorId: user.userId,
        activityType: 'WATCHER_ADDED',
        metadata: { watcherUserId: watchUserId },
      },
    });

    return reply.status(201).send(watcher);
  });

  // ─── DELETE /api/v1/tickets/:id/watchers/:uid — Remove watcher ─────────────

  fastify.delete('/api/v1/tickets/:id/watchers/:uid', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    const { id, uid } = request.params as { id: string; uid: string };

    // Only allow self-unwatch or admin removal
    const isAdmin = user.roles.includes('admin') || user.roles.includes('msp_admin');
    if (uid !== user.userId && !isAdmin) {
      return reply.status(403).send({ error: 'You can only remove yourself as a watcher' });
    }

    const existing = await prisma.ticketWatcher.findUnique({
      where: { ticketId_userId: { ticketId: id, userId: uid } },
    });

    if (!existing || existing.tenantId !== user.tenantId) {
      return reply.status(404).send({ error: 'Watcher not found' });
    }

    await prisma.ticketWatcher.delete({
      where: { ticketId_userId: { ticketId: id, userId: uid } },
    });

    await prisma.ticketActivity.create({
      data: {
        tenantId: user.tenantId,
        ticketId: id,
        actorId: user.userId,
        activityType: 'WATCHER_REMOVED',
        metadata: { watcherUserId: uid },
      },
    });

    return reply.status(204).send();
  });

  // ─── GET /api/v1/tickets/watching — Tickets I'm watching ───────────────────

  fastify.get('/api/v1/tickets/watching', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { page = '1', limit = '25' } = request.query as { page?: string; limit?: string };
    const skip = (Number(page) - 1) * Number(limit);

    const [tickets, total] = await Promise.all([
      prisma.ticketWatcher.findMany({
        where: { userId: user.userId, tenantId: user.tenantId },
        include: {
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              status: true,
              priority: true,
              type: true,
              assignedTo: { select: { id: true, firstName: true, lastName: true } },
              updatedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.ticketWatcher.count({
        where: { userId: user.userId, tenantId: user.tenantId },
      }),
    ]);

    return reply.status(200).send({
      tickets: tickets.map(w => w.ticket),
      total,
      page: Number(page),
      limit: Number(limit),
    });
  });
}
