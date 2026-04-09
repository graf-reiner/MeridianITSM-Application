import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../../plugins/rbac.js';
import { prisma } from '@meridian/db';

/**
 * Change Template REST API routes.
 *
 * GET    /api/v1/change-templates          — List active templates
 * POST   /api/v1/change-templates          — Create template
 * PATCH  /api/v1/change-templates/:id      — Update template
 * DELETE /api/v1/change-templates/:id      — Soft-delete (isActive=false)
 */
export async function changeTemplateRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /api/v1/change-templates — List templates ───────────────────────────

  fastify.get(
    '/api/v1/change-templates',
    { preHandler: [requirePermission('changes.view')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const query = request.query as { includeInactive?: string };
      const includeInactive = query.includeInactive === 'true';

      const templates = await prisma.changeTemplate.findMany({
        where: {
          tenantId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: { name: 'asc' },
      });

      return reply.status(200).send(templates);
    },
  );

  // ─── POST /api/v1/change-templates — Create template ─────────────────────────

  fastify.post(
    '/api/v1/change-templates',
    { preHandler: [requirePermission('changes.create')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const body = request.body as Record<string, unknown>;

      if (!body.name || typeof body.name !== 'string' || (body.name as string).trim().length === 0) {
        return reply.status(400).send({ error: 'name is required and must be a non-empty string' });
      }

      const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : undefined);

      try {
        const template = await prisma.changeTemplate.create({
          data: {
            tenantId,
            name: (body.name as string).trim(),
            description: str('description'),
            changeType: (str('changeType') as 'STANDARD' | 'NORMAL' | 'EMERGENCY') ?? 'NORMAL',
            riskLevel: (str('riskLevel') as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
            defaultTitle: str('defaultTitle'),
            defaultDescription: str('defaultDescription'),
            defaultBackoutPlan: str('defaultBackoutPlan'),
            defaultAssigneeId: str('defaultAssigneeId'),
            defaultQueueId: str('defaultQueueId'),
          },
        });

        return reply.status(201).send(template);
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('Unique constraint')) {
          return reply.status(409).send({ error: 'A template with this name already exists' });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── PATCH /api/v1/change-templates/:id — Update template ────────────────────

  fastify.patch(
    '/api/v1/change-templates/:id',
    { preHandler: [requirePermission('changes.create')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as Record<string, unknown>;
      const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : undefined);
      const bool = (k: string) => (typeof body[k] === 'boolean' ? (body[k] as boolean) : undefined);

      // Verify template belongs to this tenant
      const existing = await prisma.changeTemplate.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Template not found' });
      }

      try {
        const updated = await prisma.changeTemplate.update({
          where: { id },
          data: {
            ...(str('name') ? { name: str('name') } : {}),
            ...(str('description') !== undefined ? { description: str('description') } : {}),
            ...(str('changeType') ? { changeType: str('changeType') as 'STANDARD' | 'NORMAL' | 'EMERGENCY' } : {}),
            ...(str('riskLevel') ? { riskLevel: str('riskLevel') as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' } : {}),
            ...(str('defaultTitle') !== undefined ? { defaultTitle: str('defaultTitle') } : {}),
            ...(str('defaultDescription') !== undefined ? { defaultDescription: str('defaultDescription') } : {}),
            ...(str('defaultBackoutPlan') !== undefined ? { defaultBackoutPlan: str('defaultBackoutPlan') } : {}),
            ...(str('defaultAssigneeId') !== undefined ? { defaultAssigneeId: str('defaultAssigneeId') } : {}),
            ...(str('defaultQueueId') !== undefined ? { defaultQueueId: str('defaultQueueId') } : {}),
            ...(bool('isActive') !== undefined ? { isActive: bool('isActive') } : {}),
          },
        });

        return reply.status(200).send(updated);
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('Unique constraint')) {
          return reply.status(409).send({ error: 'A template with this name already exists' });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── DELETE /api/v1/change-templates/:id — Soft-delete template ──────────────

  fastify.delete(
    '/api/v1/change-templates/:id',
    { preHandler: [requirePermission('changes.create')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const existing = await prisma.changeTemplate.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Template not found' });
      }

      await prisma.changeTemplate.update({
        where: { id },
        data: { isActive: false },
      });

      return reply.status(204).send();
    },
  );
}
