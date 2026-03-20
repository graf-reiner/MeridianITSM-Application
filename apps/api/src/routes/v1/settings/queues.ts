import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Settings: Queue Management Routes (SETT-04)
 *
 * GET    /api/v1/settings/queues       — List queues
 * POST   /api/v1/settings/queues       — Create queue
 * PATCH  /api/v1/settings/queues/:id   — Update queue
 * DELETE /api/v1/settings/queues/:id   — Delete queue (blocked if tickets assigned)
 */
export async function queuesSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/queues — List queues
  fastify.get(
    '/api/v1/settings/queues',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const queues = await prisma.queue.findMany({
        where: { tenantId },
        include: {
          _count: { select: { tickets: true } },
        },
        orderBy: { name: 'asc' },
      });

      return reply.status(200).send(queues);
    },
  );

  // POST /api/v1/settings/queues — Create queue
  fastify.post(
    '/api/v1/settings/queues',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        name: string;
        autoAssign?: boolean;
        defaultAssigneeId?: string;
        assignmentRules?: unknown;
      };

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required' });
      }

      // Validate defaultAssigneeId if provided
      if (body.defaultAssigneeId) {
        const assignee = await prisma.user.findFirst({
          where: { id: body.defaultAssigneeId, tenantId },
        });
        if (!assignee) {
          return reply.status(400).send({ error: 'defaultAssigneeId refers to unknown user' });
        }
      }

      const queue = await prisma.queue.create({
        data: {
          tenantId,
          name: body.name,
          autoAssign: body.autoAssign ?? false,
          defaultAssigneeId: body.defaultAssigneeId,
          assignmentRules: body.assignmentRules ?? undefined,
        },
      });

      return reply.status(201).send(queue);
    },
  );

  // PATCH /api/v1/settings/queues/:id — Update queue
  fastify.patch(
    '/api/v1/settings/queues/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        autoAssign?: boolean;
        defaultAssigneeId?: string | null;
        assignmentRules?: unknown;
      };

      const existing = await prisma.queue.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      // Validate defaultAssigneeId if provided
      if (body.defaultAssigneeId) {
        const assignee = await prisma.user.findFirst({
          where: { id: body.defaultAssigneeId, tenantId },
        });
        if (!assignee) {
          return reply.status(400).send({ error: 'defaultAssigneeId refers to unknown user' });
        }
      }

      const updated = await prisma.queue.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.autoAssign !== undefined && { autoAssign: body.autoAssign }),
          ...(body.defaultAssigneeId !== undefined && { defaultAssigneeId: body.defaultAssigneeId }),
          ...(body.assignmentRules !== undefined && { assignmentRules: body.assignmentRules ?? undefined }),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // DELETE /api/v1/settings/queues/:id — Delete queue
  fastify.delete(
    '/api/v1/settings/queues/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const queue = await prisma.queue.findFirst({
        where: { id, tenantId },
        include: { _count: { select: { tickets: true } } },
      });

      if (!queue) {
        return reply.status(404).send({ error: 'Queue not found' });
      }

      // Block if tickets are assigned
      if (queue._count.tickets > 0) {
        return reply.status(409).send({
          error: 'Cannot delete queue with assigned tickets',
          ticketCount: queue._count.tickets,
        });
      }

      await prisma.queue.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
