import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { renderTemplate } from '@meridian/core';

/**
 * Canned Response / Quick Reply REST API routes.
 *
 * GET    /api/v1/canned-responses          — List canned responses visible to current user
 * GET    /api/v1/canned-responses/:id      — Get single canned response
 * POST   /api/v1/canned-responses          — Create canned response
 * PATCH  /api/v1/canned-responses/:id      — Update canned response
 * DELETE /api/v1/canned-responses/:id      — Delete canned response
 */
export async function cannedResponseRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /api/v1/canned-responses — List visible to current user ────────────

  fastify.get('/api/v1/canned-responses', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { search, category } = request.query as { search?: string; category?: string };

    // Get user's group IDs for TEAM visibility filtering
    const memberships = await prisma.userGroupMember.findMany({
      where: { userId: user.userId, tenantId: user.tenantId },
      select: { userGroupId: true },
    });
    const groupIds = memberships.map(m => m.userGroupId);

    // Build visibility filter: PERSONAL (own) + TEAM (my groups) + GLOBAL
    const visibilityFilter = [
      { visibility: 'PERSONAL', createdById: user.userId },
      { visibility: 'GLOBAL' },
      ...(groupIds.length > 0
        ? [{ visibility: 'TEAM', groupId: { in: groupIds } }]
        : []),
    ];

    const where: Record<string, unknown> = {
      tenantId: user.tenantId,
      OR: visibilityFilter,
    };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { content: { contains: search, mode: 'insensitive' } },
            { shortcut: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const responses = await prisma.cannedResponse.findMany({
      where: where as any,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });

    return reply.status(200).send(responses);
  });

  // ─── GET /api/v1/canned-responses/:id — Get single ─────────────────────────

  fastify.get('/api/v1/canned-responses/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };

    const response = await prisma.cannedResponse.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        group: { select: { id: true, name: true } },
      },
    });

    if (!response) {
      return reply.status(404).send({ error: 'Canned response not found' });
    }

    return reply.status(200).send(response);
  });

  // ─── POST /api/v1/canned-responses — Create ────────────────────────────────

  fastify.post('/api/v1/canned-responses', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    const body = request.body as {
      title: string;
      content: string;
      shortcut?: string;
      category?: string;
      visibility?: string;
      groupId?: string;
    };

    if (!body.title || !body.content) {
      return reply.status(400).send({ error: 'title and content are required' });
    }

    // Only admins can create GLOBAL responses
    const visibility = body.visibility ?? 'PERSONAL';
    if (visibility === 'GLOBAL' && !user.roles.includes('admin') && !user.roles.includes('msp_admin')) {
      return reply.status(403).send({ error: 'Only admins can create global canned responses' });
    }

    // TEAM responses require a groupId
    if (visibility === 'TEAM' && !body.groupId) {
      return reply.status(400).send({ error: 'groupId is required for TEAM visibility' });
    }

    const response = await prisma.cannedResponse.create({
      data: {
        tenantId: user.tenantId,
        createdById: user.userId,
        title: body.title,
        content: body.content,
        shortcut: body.shortcut ?? null,
        category: body.category ?? null,
        visibility,
        groupId: visibility === 'TEAM' ? body.groupId! : null,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        group: { select: { id: true, name: true } },
      },
    });

    return reply.status(201).send(response);
  });

  // ─── PATCH /api/v1/canned-responses/:id — Update ───────────────────────────

  fastify.patch('/api/v1/canned-responses/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    const { id } = request.params as { id: string };
    const body = request.body as {
      title?: string;
      content?: string;
      shortcut?: string;
      category?: string;
      visibility?: string;
      groupId?: string;
    };

    const existing = await prisma.cannedResponse.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Canned response not found' });
    }

    // Only the creator or an admin can edit
    const isAdmin = user.roles.includes('admin') || user.roles.includes('msp_admin');
    if (existing.createdById !== user.userId && !isAdmin) {
      return reply.status(403).send({ error: 'You can only edit your own canned responses' });
    }

    // Only admins can set GLOBAL visibility
    if (body.visibility === 'GLOBAL' && !isAdmin) {
      return reply.status(403).send({ error: 'Only admins can create global canned responses' });
    }

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.shortcut !== undefined) updates.shortcut = body.shortcut || null;
    if (body.category !== undefined) updates.category = body.category || null;
    if (body.visibility !== undefined) {
      updates.visibility = body.visibility;
      if (body.visibility === 'TEAM') {
        if (!body.groupId && !existing.groupId) {
          return reply.status(400).send({ error: 'groupId is required for TEAM visibility' });
        }
        updates.groupId = body.groupId ?? existing.groupId;
      } else {
        updates.groupId = null;
      }
    }
    if (body.groupId !== undefined && body.visibility === undefined) {
      updates.groupId = body.groupId || null;
    }

    const updated = await prisma.cannedResponse.update({
      where: { id },
      data: updates,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        group: { select: { id: true, name: true } },
      },
    });

    return reply.status(200).send(updated);
  });

  // ─── GET /api/v1/canned-responses/:id/rendered — Render with ticket context ─

  /**
   * Returns the canned response content with `{{ticket.*}}`, `{{requester.*}}`,
   * `{{assignee.*}}`, `{{tenant.*}}`, `{{now.*}}` tokens substituted.
   * Requires `ticketId` query param so the server can load the right context.
   * Used by the `CannedResponsePicker` when the user is inserting a response
   * into a specific ticket comment.
   */
  fastify.get(
    '/api/v1/canned-responses/:id/rendered',
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };
      const { ticketId } = request.query as { ticketId?: string };

      if (!ticketId) {
        return reply.status(400).send({ error: 'ticketId query parameter is required' });
      }

      const response = await prisma.cannedResponse.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!response) {
        return reply.status(404).send({ error: 'Canned response not found' });
      }

      const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId, tenantId: user.tenantId },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
          requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          category: { select: { id: true, name: true } },
          queue: { select: { id: true, name: true } },
        },
      });
      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const tenant = await prisma.tenant.findFirst({
        where: { id: user.tenantId },
        select: { name: true, subdomain: true },
      });

      const now = new Date();
      const ctx: Record<string, unknown> = {
        ticket: {
          number: `T-${ticket.ticketNumber}`,
          title: ticket.title,
          description: ticket.description ?? '',
          status: ticket.status,
          priority: ticket.priority,
          type: ticket.type,
          category: ticket.category?.name ?? '',
          queue: ticket.queue?.name ?? '',
          tags: (ticket.tags ?? []).join(', '),
          createdAt: ticket.createdAt.toISOString(),
          resolvedAt: ticket.resolvedAt?.toISOString() ?? '',
        },
        requester: ticket.requestedBy
          ? {
              firstName: ticket.requestedBy.firstName,
              lastName: ticket.requestedBy.lastName,
              displayName: `${ticket.requestedBy.firstName} ${ticket.requestedBy.lastName}`,
              email: ticket.requestedBy.email,
            }
          : {},
        assignee: ticket.assignedTo
          ? {
              firstName: ticket.assignedTo.firstName,
              lastName: ticket.assignedTo.lastName,
              displayName: `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`,
              email: ticket.assignedTo.email,
            }
          : {},
        tenant: { name: tenant?.name ?? '', subdomain: tenant?.subdomain ?? '' },
        now: {
          iso: now.toISOString(),
          date: now.toISOString().slice(0, 10),
          time: now.toISOString().slice(11, 16),
        },
      };

      const rendered = renderTemplate(response.content, ctx);
      return reply.status(200).send({ content: rendered });
    },
  );

  // ─── DELETE /api/v1/canned-responses/:id — Delete ──────────────────────────

  fastify.delete('/api/v1/canned-responses/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    const { id } = request.params as { id: string };

    const existing = await prisma.cannedResponse.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Canned response not found' });
    }

    // Only the creator or an admin can delete
    const isAdmin = user.roles.includes('admin') || user.roles.includes('msp_admin');
    if (existing.createdById !== user.userId && !isAdmin) {
      return reply.status(403).send({ error: 'You can only delete your own canned responses' });
    }

    await prisma.cannedResponse.delete({ where: { id } });

    return reply.status(204).send();
  });
}
