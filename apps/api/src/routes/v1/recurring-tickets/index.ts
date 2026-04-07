import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { getNextCronDate, getNextOccurrences } from '../../../services/cron.service.js';

/**
 * Recurring Ticket REST API routes.
 *
 * GET    /api/v1/recurring-tickets          — List recurring tickets
 * POST   /api/v1/recurring-tickets          — Create recurring ticket
 * GET    /api/v1/recurring-tickets/:id      — Get detail with next occurrences
 * PATCH  /api/v1/recurring-tickets/:id      — Update
 * DELETE /api/v1/recurring-tickets/:id      — Delete
 */
export async function recurringTicketRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.get('/api/v1/recurring-tickets', async (request, reply) => {
    const user = request.user as { tenantId: string };

    const items = await prisma.recurringTicket.findMany({
      where: { tenantId: user.tenantId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        category: { select: { id: true, name: true } },
        queue: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    return reply.status(200).send(items);
  });

  fastify.get('/api/v1/recurring-tickets/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const item = await prisma.recurringTicket.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        category: { select: { id: true, name: true } },
        queue: { select: { id: true, name: true } },
      },
    });

    if (!item) return reply.status(404).send({ error: 'Recurring ticket not found' });

    // Calculate next 5 occurrences
    const nextOccurrences = getNextOccurrences(item.schedule, item.timezone, 5);

    return reply.status(200).send({ ...item, nextOccurrences });
  });

  fastify.post('/api/v1/recurring-tickets', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const body = request.body as {
      name: string;
      schedule: string;
      timezone?: string;
      title: string;
      description?: string;
      type?: string;
      priority?: string;
      categoryId?: string;
      queueId?: string;
      assignedToId?: string;
      assignedGroupId?: string;
      tags?: string[];
      customFields?: Record<string, unknown>;
    };

    if (!body.name || !body.schedule || !body.title) {
      return reply.status(400).send({ error: 'name, schedule, and title are required' });
    }

    const timezone = body.timezone ?? 'UTC';
    const nextRunAt = getNextCronDate(body.schedule, timezone);

    if (!nextRunAt) {
      return reply.status(400).send({ error: 'Invalid cron expression' });
    }

    const item = await prisma.recurringTicket.create({
      data: {
        tenantId: user.tenantId,
        createdById: user.userId,
        name: body.name,
        schedule: body.schedule,
        timezone,
        title: body.title,
        description: body.description ?? null,
        type: (body.type as any) ?? 'INCIDENT',
        priority: (body.priority as any) ?? 'MEDIUM',
        categoryId: body.categoryId ?? null,
        queueId: body.queueId ?? null,
        assignedToId: body.assignedToId ?? null,
        assignedGroupId: body.assignedGroupId ?? null,
        tags: body.tags ?? [],
        customFields: body.customFields ?? null,
        nextRunAt,
      },
    });

    return reply.status(201).send(item);
  });

  fastify.patch('/api/v1/recurring-tickets/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.recurringTicket.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Recurring ticket not found' });

    const updates: Record<string, unknown> = {};
    const fields = ['name', 'schedule', 'timezone', 'title', 'description', 'type', 'priority',
      'categoryId', 'queueId', 'assignedToId', 'assignedGroupId', 'tags', 'customFields', 'isActive'];

    for (const field of fields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // Recalculate nextRunAt if schedule changed
    if (updates.schedule || updates.timezone) {
      const schedule = (updates.schedule ?? existing.schedule) as string;
      const tz = (updates.timezone ?? existing.timezone) as string;
      updates.nextRunAt = getNextCronDate(schedule, tz);
    }

    const updated = await prisma.recurringTicket.update({ where: { id }, data: updates });
    return reply.status(200).send(updated);
  });

  fastify.delete('/api/v1/recurring-tickets/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const existing = await prisma.recurringTicket.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Recurring ticket not found' });

    await prisma.recurringTicket.delete({ where: { id } });
    return reply.status(204).send();
  });
}
