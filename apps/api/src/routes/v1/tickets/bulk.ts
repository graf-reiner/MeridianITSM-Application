import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Bulk Ticket Operations REST API routes.
 *
 * POST /api/v1/tickets/bulk — Apply an action to multiple tickets
 */
export async function ticketBulkRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post('/api/v1/tickets/bulk', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    const body = request.body as {
      ticketIds: string[];
      action: 'assign' | 'change_status' | 'change_priority' | 'change_queue' | 'change_category' | 'close';
      assignedToId?: string;
      assignedGroupId?: string;
      status?: string;
      priority?: string;
      queueId?: string;
      categoryId?: string;
    };

    if (!body.ticketIds || !Array.isArray(body.ticketIds) || body.ticketIds.length === 0) {
      return reply.status(400).send({ error: 'ticketIds array is required' });
    }

    if (!body.action) {
      return reply.status(400).send({ error: 'action is required' });
    }

    if (body.ticketIds.length > 100) {
      return reply.status(400).send({ error: 'Maximum 100 tickets per bulk operation' });
    }

    // Verify all tickets belong to this tenant
    const tickets = await prisma.ticket.findMany({
      where: { id: { in: body.ticketIds }, tenantId: user.tenantId },
      select: { id: true, status: true, priority: true },
    });

    if (tickets.length !== body.ticketIds.length) {
      return reply.status(400).send({ error: 'One or more tickets not found' });
    }

    // Build the update data based on action
    const updates: Record<string, unknown> = {};
    let activityType = 'FIELD_CHANGED';
    let fieldName = '';
    let newValue = '';

    switch (body.action) {
      case 'assign':
        if (body.assignedToId) {
          updates.assignedToId = body.assignedToId;
          fieldName = 'assignedToId';
          newValue = body.assignedToId;
        }
        if (body.assignedGroupId) {
          updates.assignedGroupId = body.assignedGroupId;
          fieldName = 'assignedGroupId';
          newValue = body.assignedGroupId;
        }
        if (!body.assignedToId && !body.assignedGroupId) {
          return reply.status(400).send({ error: 'assignedToId or assignedGroupId required for assign action' });
        }
        break;

      case 'change_status':
        if (!body.status) {
          return reply.status(400).send({ error: 'status is required for change_status action' });
        }
        updates.status = body.status;
        if (body.status === 'RESOLVED') updates.resolvedAt = new Date();
        if (body.status === 'CLOSED') updates.closedAt = new Date();
        fieldName = 'status';
        newValue = body.status;
        break;

      case 'change_priority':
        if (!body.priority) {
          return reply.status(400).send({ error: 'priority is required for change_priority action' });
        }
        updates.priority = body.priority;
        fieldName = 'priority';
        newValue = body.priority;
        break;

      case 'change_queue':
        if (!body.queueId) {
          return reply.status(400).send({ error: 'queueId is required for change_queue action' });
        }
        updates.queueId = body.queueId;
        fieldName = 'queueId';
        newValue = body.queueId;
        break;

      case 'change_category':
        if (!body.categoryId) {
          return reply.status(400).send({ error: 'categoryId is required for change_category action' });
        }
        updates.categoryId = body.categoryId;
        fieldName = 'categoryId';
        newValue = body.categoryId;
        break;

      case 'close':
        updates.status = 'CLOSED';
        updates.closedAt = new Date();
        fieldName = 'status';
        newValue = 'CLOSED';
        break;

      default:
        return reply.status(400).send({ error: `Unknown action: ${body.action}` });
    }

    // Execute bulk update + activity logging in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update all tickets
      const updated = await tx.ticket.updateMany({
        where: { id: { in: body.ticketIds }, tenantId: user.tenantId },
        data: updates,
      });

      // Create activity entries for each ticket
      await tx.ticketActivity.createMany({
        data: body.ticketIds.map((ticketId) => ({
          tenantId: user.tenantId,
          ticketId,
          actorId: user.userId,
          activityType,
          fieldName,
          oldValue: null,
          newValue,
          metadata: { bulkAction: body.action, ticketCount: body.ticketIds.length },
        })),
      });

      return { updated: updated.count };
    });

    return reply.status(200).send({
      success: true,
      updated: result.updated,
      action: body.action,
    });
  });
}
