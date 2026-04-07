import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Saved Ticket Views — Advanced REST API.
 *
 * GET    /api/v1/tickets/views            — List views (own + assigned + global)
 * GET    /api/v1/tickets/views/default    — Get user's default view
 * POST   /api/v1/tickets/views            — Create view
 * GET    /api/v1/tickets/views/:id        — Get single view
 * PATCH  /api/v1/tickets/views/:id        — Update view
 * DELETE /api/v1/tickets/views/:id        — Delete view
 * PATCH  /api/v1/tickets/views/:id/set-default — Set as default
 * GET    /api/v1/tickets/views/:id/export — Export view config as JSON
 * POST   /api/v1/tickets/views/import     — Import view from JSON
 * PATCH  /api/v1/tickets/views/reorder    — Reorder views
 */
export async function savedViewRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET — List views (own + assigned to me + global) ─────────────────────

  fastify.get('/api/v1/tickets/views', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };

    // Get user's group memberships for assignment-aware query
    const groupIds = (await prisma.userGroupMember.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { userGroupId: true },
    })).map(m => m.userGroupId);

    const views = await prisma.savedTicketView.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          { userId: user.userId },
          { isGlobal: true },
          { assignments: { some: { userId: user.userId } } },
          ...(groupIds.length > 0
            ? [{ assignments: { some: { userGroupId: { in: groupIds } } } }]
            : []),
        ],
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        assignments: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            userGroup: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    return reply.status(200).send(views);
  });

  // ─── GET /default — User's default view ───────────────────────────────────

  fastify.get('/api/v1/tickets/views/default', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };

    const defaultView = await prisma.savedTicketView.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId, isDefault: true },
    });

    return reply.status(200).send(defaultView ?? null);
  });

  // ─── POST — Create view ───────────────────────────────────────────────────

  fastify.post('/api/v1/tickets/views', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    const body = request.body as {
      name: string;
      description?: string;
      filters: Record<string, unknown>;
      sortBy?: string;
      sortDir?: string;
      displayConfig?: Record<string, unknown>;
      isDefault?: boolean;
      isGlobal?: boolean;
      assignments?: Array<{ userId?: string; userGroupId?: string }>;
    };

    if (!body.name || !body.filters) {
      return reply.status(400).send({ error: 'name and filters are required' });
    }

    const isAdmin = user.roles.includes('admin') || user.roles.includes('msp_admin');

    // Only admins can set isGlobal or manage assignments
    if ((body.isGlobal || body.assignments?.length) && !isAdmin) {
      return reply.status(403).send({ error: 'Only admins can create global views or assign views to others' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Enforce at-most-one default per user
      if (body.isDefault) {
        await tx.savedTicketView.updateMany({
          where: { tenantId: user.tenantId, userId: user.userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const maxPos = await tx.savedTicketView.aggregate({
        where: { tenantId: user.tenantId, userId: user.userId },
        _max: { position: true },
      });

      const view = await tx.savedTicketView.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          name: body.name,
          description: body.description ?? null,
          filters: body.filters,
          sortBy: body.sortBy ?? 'createdAt',
          sortDir: body.sortDir ?? 'desc',
          displayConfig: body.displayConfig ?? null,
          isGlobal: body.isGlobal ?? false,
          isDefault: body.isDefault ?? false,
          position: (maxPos._max.position ?? 0) + 1,
        },
      });

      // Create assignments
      if (body.assignments?.length) {
        await tx.ticketViewAssignment.createMany({
          data: body.assignments.map(a => ({
            tenantId: user.tenantId,
            viewId: view.id,
            userId: a.userId ?? null,
            userGroupId: a.userGroupId ?? null,
          })),
        });
      }

      return view;
    });

    return reply.status(201).send(result);
  });

  // ─── GET /:id — Single view detail ────────────────────────────────────────

  fastify.get('/api/v1/tickets/views/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };

    const view = await prisma.savedTicketView.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        assignments: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            userGroup: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!view) return reply.status(404).send({ error: 'View not found' });
    return reply.status(200).send(view);
  });

  // ─── PATCH /:id — Update view ─────────────────────────────────────────────

  fastify.patch('/api/v1/tickets/views/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      description?: string;
      filters?: Record<string, unknown>;
      sortBy?: string;
      sortDir?: string;
      displayConfig?: Record<string, unknown>;
      isDefault?: boolean;
      isGlobal?: boolean;
      assignments?: Array<{ userId?: string; userGroupId?: string }>;
    };

    const isAdmin = user.roles.includes('admin') || user.roles.includes('msp_admin');

    const existing = await prisma.savedTicketView.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!existing) return reply.status(404).send({ error: 'View not found' });

    // Owner can edit their own view; admins can edit any view in tenant
    if (existing.userId !== user.userId && !isAdmin) {
      return reply.status(403).send({ error: 'You can only edit your own views' });
    }

    if ((body.isGlobal !== undefined || body.assignments) && !isAdmin) {
      return reply.status(403).send({ error: 'Only admins can manage global status or assignments' });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.savedTicketView.updateMany({
          where: { tenantId: user.tenantId, userId: existing.userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      const updates: Record<string, unknown> = {};
      const fields = ['name', 'description', 'filters', 'sortBy', 'sortDir', 'displayConfig', 'isGlobal', 'isDefault'];
      for (const f of fields) {
        if ((body as Record<string, unknown>)[f] !== undefined) updates[f] = (body as Record<string, unknown>)[f];
      }

      const view = await tx.savedTicketView.update({ where: { id }, data: updates });

      // Replace assignments atomically
      if (body.assignments !== undefined) {
        await tx.ticketViewAssignment.deleteMany({ where: { viewId: id } });
        if (body.assignments.length > 0) {
          await tx.ticketViewAssignment.createMany({
            data: body.assignments.map(a => ({
              tenantId: user.tenantId,
              viewId: id,
              userId: a.userId ?? null,
              userGroupId: a.userGroupId ?? null,
            })),
          });
        }
      }

      return view;
    });

    return reply.status(200).send(result);
  });

  // ─── DELETE /:id — Delete view ────────────────────────────────────────────

  fastify.delete('/api/v1/tickets/views/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    const { id } = request.params as { id: string };

    const existing = await prisma.savedTicketView.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!existing) return reply.status(404).send({ error: 'View not found' });

    const isAdmin = user.roles.includes('admin') || user.roles.includes('msp_admin');
    if (existing.userId !== user.userId && !isAdmin) {
      return reply.status(403).send({ error: 'You can only delete your own views' });
    }

    // Cascade deletes assignments automatically
    await prisma.savedTicketView.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ─── PATCH /:id/set-default — Toggle default view ─────────────────────────

  fastify.patch('/api/v1/tickets/views/:id/set-default', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };

    const existing = await prisma.savedTicketView.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!existing) return reply.status(404).send({ error: 'View not found' });

    await prisma.$transaction(async (tx) => {
      await tx.savedTicketView.updateMany({
        where: { tenantId: user.tenantId, userId: user.userId, isDefault: true },
        data: { isDefault: false },
      });
      await tx.savedTicketView.update({
        where: { id },
        data: { isDefault: true },
      });
    });

    return reply.status(200).send({ success: true });
  });

  // ─── GET /:id/export — Export view config as portable JSON ────────────────

  fastify.get('/api/v1/tickets/views/:id/export', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const view = await prisma.savedTicketView.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        assignments: {
          include: {
            user: { select: { email: true, firstName: true, lastName: true } },
            userGroup: { select: { name: true } },
          },
        },
      },
    });

    if (!view) return reply.status(404).send({ error: 'View not found' });

    const exportData = {
      version: 1,
      name: view.name,
      description: view.description,
      filters: view.filters,
      sortBy: view.sortBy,
      sortDir: view.sortDir,
      displayConfig: view.displayConfig,
      isGlobal: view.isGlobal,
      assignments: view.assignments
        .map(a => ({
          userEmail: a.user?.email ?? undefined,
          userGroupName: a.userGroup?.name ?? undefined,
        }))
        .filter(a => a.userEmail || a.userGroupName),
    };

    const filename = view.name.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
    reply.header('Content-Disposition', `attachment; filename="view-${filename}.json"`);
    reply.header('Content-Type', 'application/json');
    return reply.send(exportData);
  });

  // ─── POST /import — Import view from JSON config ──────────────────────────

  fastify.post('/api/v1/tickets/views/import', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    const body = request.body as {
      config: {
        version?: number;
        name: string;
        description?: string;
        filters: Record<string, unknown>;
        sortBy?: string;
        sortDir?: string;
        displayConfig?: Record<string, unknown>;
        isGlobal?: boolean;
        assignments?: Array<{ userEmail?: string; userGroupName?: string }>;
      };
    };

    if (!body.config?.name || !body.config?.filters) {
      return reply.status(400).send({ error: 'config with name and filters is required' });
    }

    const isAdmin = user.roles.includes('admin') || user.roles.includes('msp_admin');
    const config = body.config;
    const warnings: string[] = [];

    // Resolve assignment references
    const resolvedAssignments: Array<{ userId?: string; userGroupId?: string }> = [];
    if (config.assignments?.length && isAdmin) {
      for (const a of config.assignments) {
        if (a.userEmail) {
          const found = await prisma.user.findFirst({
            where: { tenantId: user.tenantId, email: a.userEmail },
            select: { id: true },
          });
          if (found) resolvedAssignments.push({ userId: found.id });
          else warnings.push(`User "${a.userEmail}" not found — skipped`);
        }
        if (a.userGroupName) {
          const found = await prisma.userGroup.findFirst({
            where: { tenantId: user.tenantId, name: a.userGroupName },
            select: { id: true },
          });
          if (found) resolvedAssignments.push({ userGroupId: found.id });
          else warnings.push(`Group "${a.userGroupName}" not found — skipped`);
        }
      }
    }

    const maxPos = await prisma.savedTicketView.aggregate({
      where: { tenantId: user.tenantId, userId: user.userId },
      _max: { position: true },
    });

    const view = await prisma.$transaction(async (tx) => {
      const created = await tx.savedTicketView.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          name: config.name,
          description: config.description ?? null,
          filters: config.filters,
          sortBy: config.sortBy ?? 'createdAt',
          sortDir: config.sortDir ?? 'desc',
          displayConfig: config.displayConfig ?? null,
          isGlobal: isAdmin ? (config.isGlobal ?? false) : false,
          position: (maxPos._max.position ?? 0) + 1,
        },
      });

      if (resolvedAssignments.length > 0) {
        await tx.ticketViewAssignment.createMany({
          data: resolvedAssignments.map(a => ({
            tenantId: user.tenantId,
            viewId: created.id,
            userId: a.userId ?? null,
            userGroupId: a.userGroupId ?? null,
          })),
        });
      }

      return created;
    });

    return reply.status(201).send({ view, warnings });
  });

  // ─── PATCH /reorder — Reorder views ───────────────────────────────────────

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
