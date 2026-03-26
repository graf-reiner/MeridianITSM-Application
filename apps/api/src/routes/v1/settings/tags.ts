import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Settings: Tag Management Routes
 *
 * GET    /api/v1/settings/tags       — List tags
 * POST   /api/v1/settings/tags       — Create tag
 * PATCH  /api/v1/settings/tags/:id   — Update tag
 * DELETE /api/v1/settings/tags/:id   — Delete tag
 */
export async function tagsSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/tags — List tags
  fastify.get(
    '/api/v1/settings/tags',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const tags = await prisma.tag.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
      });

      return reply.status(200).send(tags);
    },
  );

  // POST /api/v1/settings/tags — Create tag
  fastify.post(
    '/api/v1/settings/tags',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        name: string;
        color?: string;
      };

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required' });
      }

      try {
        const tag = await prisma.tag.create({
          data: {
            tenantId,
            name: body.name.trim(),
            color: body.color ?? '#6b7280',
          },
        });

        return reply.status(201).send(tag);
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          return reply.status(409).send({ error: 'A tag with this name already exists' });
        }
        throw err;
      }
    },
  );

  // PATCH /api/v1/settings/tags/:id — Update tag
  fastify.patch(
    '/api/v1/settings/tags/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        color?: string;
      };

      const existing = await prisma.tag.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Tag not found' });
      }

      try {
        const updated = await prisma.tag.update({
          where: { id },
          data: {
            ...(body.name !== undefined && { name: body.name.trim() }),
            ...(body.color !== undefined && { color: body.color }),
          },
        });

        return reply.status(200).send(updated);
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          return reply.status(409).send({ error: 'A tag with this name already exists' });
        }
        throw err;
      }
    },
  );

  // DELETE /api/v1/settings/tags/:id — Delete tag
  fastify.delete(
    '/api/v1/settings/tags/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const tag = await prisma.tag.findFirst({ where: { id, tenantId } });
      if (!tag) {
        return reply.status(404).send({ error: 'Tag not found' });
      }

      await prisma.tag.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
