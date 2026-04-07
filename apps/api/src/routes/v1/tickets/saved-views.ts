import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Saved Ticket Views REST API routes.
 *
 * GET    /api/v1/tickets/views       — List saved views (own + shared)
 * POST   /api/v1/tickets/views       — Create a saved view
 * PATCH  /api/v1/tickets/views/:id   — Update a saved view
 * DELETE /api/v1/tickets/views/:id   — Delete a saved view
 * PATCH  /api/v1/tickets/views/reorder — Reorder saved views
 */
export async function savedViewRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET — List views ──────────────────────────────────────────────────────

  fastify.get('/api/v1/tickets/views', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };

    const views = await prisma.savedTicketView.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          { userId: user.userId },
          { isShared: true },
        ],
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    return reply.status(200).send(views);
  });

  // ─── POST — Create view ───────────────────────────────────────────────────

  fastify.post('/api/v1/tickets/views', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const body = request.body as {
      name: string;
      filters: Record<string, unknown>;
      sortBy?: string;
      sortDir?: string;
      isShared?: boolean;
    };

    if (!body.name || !body.filters) {
      return reply.status(400).send({ error: 'name and filters are required' });
    }

    // Get next position
    const maxPos = await prisma.savedTicketView.aggregate({
      where: { tenantId: user.tenantId, userId: user.userId },
      _max: { position: true },
    });

    const view = await prisma.savedTicketView.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        name: body.name,
        filters: body.filters,
        sortBy: body.sortBy ?? 'createdAt',
        sortDir: body.sortDir ?? 'desc',
        isShared: body.isShared ?? false,
        position: (maxPos._max.position ?? 0) + 1,
      },
    });

    return reply.status(201).send(view);
  });

  // ─── PATCH — Update view ──────────────────────────────────────────────────

  fastify.patch('/api/v1/tickets/views/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      filters?: Record<string, unknown>;
      sortBy?: string;
      sortDir?: string;
      isShared?: boolean;
    };

    const existing = await prisma.savedTicketView.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.userId },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'View not found' });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.filters !== undefined) updates.filters = body.filters;
    if (body.sortBy !== undefined) updates.sortBy = body.sortBy;
    if (body.sortDir !== undefined) updates.sortDir = body.sortDir;
    if (body.isShared !== undefined) updates.isShared = body.isShared;

    const view = await prisma.savedTicketView.update({
      where: { id },
      data: updates,
    });

    return reply.status(200).send(view);
  });

  // ─── DELETE — Delete view ─────────────────────────────────────────────────

  fastify.delete('/api/v1/tickets/views/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };

    const existing = await prisma.savedTicketView.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.userId },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'View not found' });
    }

    await prisma.savedTicketView.delete({ where: { id } });

    return reply.status(204).send();
  });

  // ─── PATCH — Reorder views ────────────────────────────────────────────────

  fastify.patch('/api/v1/tickets/views/reorder', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { viewIds } = request.body as { viewIds: string[] };

    if (!viewIds || !Array.isArray(viewIds)) {
      return reply.status(400).send({ error: 'viewIds array is required' });
    }

    await prisma.$transaction(
      viewIds.map((viewId, index) =>
        prisma.savedTicketView.updateMany({
          where: { id: viewId, tenantId: user.tenantId, userId: user.userId },
          data: { position: index },
        }),
      ),
    );

    return reply.status(200).send({ success: true });
  });
}
