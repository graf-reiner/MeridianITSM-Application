import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

// Inverse link types for bidirectional display
const INVERSE_LINK: Record<string, string> = {
  BLOCKS: 'BLOCKED_BY',
  BLOCKED_BY: 'BLOCKS',
  DUPLICATES: 'DUPLICATED_BY',
  DUPLICATED_BY: 'DUPLICATES',
  RELATED_TO: 'RELATED_TO',
};

const VALID_LINK_TYPES = Object.keys(INVERSE_LINK);

/**
 * Ticket Relationships REST API routes.
 *
 * POST   /api/v1/tickets/:id/children       — Create a child ticket
 * GET    /api/v1/tickets/:id/children       — List child tickets
 * PATCH  /api/v1/tickets/:id/parent         — Set/change parent ticket
 * DELETE /api/v1/tickets/:id/parent         — Remove parent (make standalone)
 * GET    /api/v1/tickets/:id/links          — List linked tickets
 * POST   /api/v1/tickets/:id/links          — Create a ticket link
 * DELETE /api/v1/tickets/:id/links/:linkId  — Remove a ticket link
 */
export async function ticketRelationshipRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /api/v1/tickets/:id/children ─────────────────────────────────────

  fastify.get('/api/v1/tickets/:id/children', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const children = await prisma.ticket.findMany({
      where: { parentId: id, tenantId: user.tenantId },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        type: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return reply.status(200).send(children);
  });

  // ─── POST /api/v1/tickets/:id/children — Create child ticket ──────────────

  fastify.post('/api/v1/tickets/:id/children', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as {
      title: string;
      description?: string;
      type?: string;
      priority?: string;
      assignedToId?: string;
      assignedGroupId?: string;
      queueId?: string;
      categoryId?: string;
    };

    if (!body.title) {
      return reply.status(400).send({ error: 'title is required' });
    }

    // Verify parent exists
    const parent = await prisma.ticket.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, slaId: true, queueId: true, categoryId: true },
    });
    if (!parent) {
      return reply.status(404).send({ error: 'Parent ticket not found' });
    }

    // Generate ticket number atomically
    const result = await prisma.$queryRaw<[{ next: number }]>`
      SELECT COALESCE(MAX("ticketNumber"), 0) + 1 AS next
      FROM "tickets"
      WHERE "tenantId" = ${user.tenantId}::uuid
      FOR UPDATE
    `;
    const ticketNumber = result[0].next;

    const child = await prisma.ticket.create({
      data: {
        tenantId: user.tenantId,
        ticketNumber,
        title: body.title,
        description: body.description ?? null,
        type: (body.type as any) ?? 'INCIDENT',
        priority: (body.priority as any) ?? 'MEDIUM',
        status: 'NEW',
        parentId: id,
        requestedById: user.userId,
        assignedToId: body.assignedToId ?? null,
        assignedGroupId: body.assignedGroupId ?? null,
        queueId: body.queueId ?? parent.queueId,
        categoryId: body.categoryId ?? parent.categoryId,
        slaId: parent.slaId, // Inherit SLA from parent
        source: 'AGENT',
      },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        type: true,
      },
    });

    // Log activity on both parent and child
    await prisma.ticketActivity.createMany({
      data: [
        {
          tenantId: user.tenantId,
          ticketId: id,
          actorId: user.userId,
          activityType: 'CHILD_ADDED',
          metadata: { childTicketId: child.id, childTicketNumber: child.ticketNumber },
        },
        {
          tenantId: user.tenantId,
          ticketId: child.id,
          actorId: user.userId,
          activityType: 'CREATED',
          metadata: { parentTicketId: id },
        },
      ],
    });

    return reply.status(201).send(child);
  });

  // ─── PATCH /api/v1/tickets/:id/parent — Set parent ────────────────────────

  fastify.patch('/api/v1/tickets/:id/parent', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };
    const { parentId } = request.body as { parentId: string };

    if (!parentId) {
      return reply.status(400).send({ error: 'parentId is required' });
    }

    if (parentId === id) {
      return reply.status(400).send({ error: 'A ticket cannot be its own parent' });
    }

    // Verify both tickets exist in tenant
    const [ticket, parent] = await Promise.all([
      prisma.ticket.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true, parentId: true } }),
      prisma.ticket.findFirst({ where: { id: parentId, tenantId: user.tenantId }, select: { id: true, parentId: true } }),
    ]);

    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    if (!parent) return reply.status(404).send({ error: 'Parent ticket not found' });

    // Prevent circular references — parent can't be a child of this ticket
    if (parent.parentId === id) {
      return reply.status(400).send({ error: 'Circular parent-child relationship detected' });
    }

    await prisma.ticket.update({
      where: { id },
      data: { parentId },
    });

    await prisma.ticketActivity.create({
      data: {
        tenantId: user.tenantId,
        ticketId: id,
        actorId: user.userId,
        activityType: 'FIELD_CHANGED',
        fieldName: 'parentId',
        oldValue: ticket.parentId,
        newValue: parentId,
      },
    });

    return reply.status(200).send({ success: true });
  });

  // ─── DELETE /api/v1/tickets/:id/parent — Remove parent ────────────────────

  fastify.delete('/api/v1/tickets/:id/parent', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };

    const ticket = await prisma.ticket.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, parentId: true },
    });

    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });
    if (!ticket.parentId) return reply.status(400).send({ error: 'Ticket has no parent' });

    await prisma.ticket.update({
      where: { id },
      data: { parentId: null },
    });

    await prisma.ticketActivity.create({
      data: {
        tenantId: user.tenantId,
        ticketId: id,
        actorId: user.userId,
        activityType: 'FIELD_CHANGED',
        fieldName: 'parentId',
        oldValue: ticket.parentId,
        newValue: null,
      },
    });

    return reply.status(204).send();
  });

  // ─── GET /api/v1/tickets/:id/links — List linked tickets ──────────────────

  fastify.get('/api/v1/tickets/:id/links', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    // Get links in both directions
    const [outgoing, incoming] = await Promise.all([
      prisma.ticketLink.findMany({
        where: { fromTicketId: id, tenantId: user.tenantId },
        include: {
          toTicket: {
            select: { id: true, ticketNumber: true, title: true, status: true, priority: true, type: true },
          },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.ticketLink.findMany({
        where: { toTicketId: id, tenantId: user.tenantId },
        include: {
          fromTicket: {
            select: { id: true, ticketNumber: true, title: true, status: true, priority: true, type: true },
          },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    // Normalize into a unified list with the "other" ticket and effective link type
    const links = [
      ...outgoing.map(l => ({
        id: l.id,
        linkType: l.linkType,
        ticket: l.toTicket,
        createdBy: l.createdBy,
        createdAt: l.createdAt,
      })),
      ...incoming.map(l => ({
        id: l.id,
        linkType: INVERSE_LINK[l.linkType] ?? l.linkType,
        ticket: l.fromTicket,
        createdBy: l.createdBy,
        createdAt: l.createdAt,
      })),
    ];

    return reply.status(200).send(links);
  });

  // ─── POST /api/v1/tickets/:id/links — Create link ─────────────────────────

  fastify.post('/api/v1/tickets/:id/links', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };
    const { targetTicketId, linkType } = request.body as { targetTicketId: string; linkType: string };

    if (!targetTicketId || !linkType) {
      return reply.status(400).send({ error: 'targetTicketId and linkType are required' });
    }

    if (!VALID_LINK_TYPES.includes(linkType)) {
      return reply.status(400).send({ error: `Invalid linkType. Valid types: ${VALID_LINK_TYPES.join(', ')}` });
    }

    if (targetTicketId === id) {
      return reply.status(400).send({ error: 'Cannot link a ticket to itself' });
    }

    // Verify target ticket exists in tenant
    const target = await prisma.ticket.findFirst({
      where: { id: targetTicketId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!target) {
      return reply.status(404).send({ error: 'Target ticket not found' });
    }

    const link = await prisma.ticketLink.create({
      data: {
        tenantId: user.tenantId,
        fromTicketId: id,
        toTicketId: targetTicketId,
        linkType,
        createdById: user.userId,
      },
      include: {
        toTicket: {
          select: { id: true, ticketNumber: true, title: true, status: true, priority: true, type: true },
        },
      },
    });

    // Log on both tickets
    await prisma.ticketActivity.createMany({
      data: [
        {
          tenantId: user.tenantId,
          ticketId: id,
          actorId: user.userId,
          activityType: 'LINK_ADDED',
          metadata: { linkType, linkedTicketId: targetTicketId },
        },
        {
          tenantId: user.tenantId,
          ticketId: targetTicketId,
          actorId: user.userId,
          activityType: 'LINK_ADDED',
          metadata: { linkType: INVERSE_LINK[linkType] ?? linkType, linkedTicketId: id },
        },
      ],
    });

    return reply.status(201).send(link);
  });

  // ─── DELETE /api/v1/tickets/:id/links/:linkId — Remove link ────────────────

  fastify.delete('/api/v1/tickets/:id/links/:linkId', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id, linkId } = request.params as { id: string; linkId: string };

    const link = await prisma.ticketLink.findFirst({
      where: { id: linkId, tenantId: user.tenantId },
    });

    if (!link) {
      return reply.status(404).send({ error: 'Link not found' });
    }

    // Determine the other ticket for activity logging
    const otherTicketId = link.fromTicketId === id ? link.toTicketId : link.fromTicketId;

    await prisma.ticketLink.delete({ where: { id: linkId } });

    await prisma.ticketActivity.createMany({
      data: [
        {
          tenantId: user.tenantId,
          ticketId: id,
          actorId: user.userId,
          activityType: 'LINK_REMOVED',
          metadata: { linkType: link.linkType, linkedTicketId: otherTicketId },
        },
        {
          tenantId: user.tenantId,
          ticketId: otherTicketId,
          actorId: user.userId,
          activityType: 'LINK_REMOVED',
          metadata: { linkType: INVERSE_LINK[link.linkType] ?? link.linkType, linkedTicketId: id },
        },
      ],
    });

    return reply.status(204).send();
  });
}
