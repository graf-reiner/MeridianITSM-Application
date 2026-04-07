import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Escalation Policy REST API routes.
 *
 * GET    /api/v1/escalation-policies          — List policies
 * POST   /api/v1/escalation-policies          — Create policy
 * GET    /api/v1/escalation-policies/:id      — Get policy detail
 * PATCH  /api/v1/escalation-policies/:id      — Update policy
 * DELETE /api/v1/escalation-policies/:id      — Delete policy
 */
export async function escalationPolicyRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.get('/api/v1/escalation-policies', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const policies = await prisma.escalationPolicy.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: 'asc' },
    });
    return reply.status(200).send(policies);
  });

  fastify.get('/api/v1/escalation-policies/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const policy = await prisma.escalationPolicy.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!policy) return reply.status(404).send({ error: 'Policy not found' });
    return reply.status(200).send(policy);
  });

  fastify.post('/api/v1/escalation-policies', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const body = request.body as {
      name: string;
      levels: Array<{
        level: number;
        afterMinutes: number;
        action: 'notify' | 'reassign' | 'escalate_queue';
        targetUserId?: string;
        targetQueueId?: string;
        notifyRoles?: string[];
      }>;
    };

    if (!body.name || !body.levels || !Array.isArray(body.levels)) {
      return reply.status(400).send({ error: 'name and levels array are required' });
    }

    const policy = await prisma.escalationPolicy.create({
      data: {
        tenantId: user.tenantId,
        name: body.name,
        levels: body.levels as any,
      },
    });

    return reply.status(201).send(policy);
  });

  fastify.patch('/api/v1/escalation-policies/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      levels?: unknown[];
      isActive?: boolean;
    };

    const existing = await prisma.escalationPolicy.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Policy not found' });

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.levels !== undefined) updates.levels = body.levels;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const policy = await prisma.escalationPolicy.update({ where: { id }, data: updates });
    return reply.status(200).send(policy);
  });

  fastify.delete('/api/v1/escalation-policies/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const existing = await prisma.escalationPolicy.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Policy not found' });

    await prisma.escalationPolicy.delete({ where: { id } });
    return reply.status(204).send();
  });
}
