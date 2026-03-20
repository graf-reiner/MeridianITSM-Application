import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Settings: Business Unit Management Routes (SETT-09)
 *
 * GET    /api/v1/settings/business-units       — List business units
 * GET    /api/v1/settings/business-units/:id   — Get detail
 * POST   /api/v1/settings/business-units       — Create
 * PATCH  /api/v1/settings/business-units/:id   — Update
 * DELETE /api/v1/settings/business-units/:id   — Delete
 */
export async function businessUnitsSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/business-units — List
  fastify.get(
    '/api/v1/settings/business-units',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const businessUnits = await prisma.businessUnit.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
      });

      return reply.status(200).send(businessUnits);
    },
  );

  // GET /api/v1/settings/business-units/:id — Get detail
  fastify.get(
    '/api/v1/settings/business-units/:id',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const bu = await prisma.businessUnit.findFirst({
        where: { id, tenantId },
      });

      if (!bu) {
        return reply.status(404).send({ error: 'Business unit not found' });
      }

      return reply.status(200).send(bu);
    },
  );

  // POST /api/v1/settings/business-units — Create
  fastify.post(
    '/api/v1/settings/business-units',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        name: string;
        code?: string;
        managerName?: string;
        managerEmail?: string;
      };

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required' });
      }

      const bu = await prisma.businessUnit.create({
        data: {
          tenantId,
          name: body.name,
          code: body.code,
          managerName: body.managerName,
          managerEmail: body.managerEmail,
        },
      });

      return reply.status(201).send(bu);
    },
  );

  // PATCH /api/v1/settings/business-units/:id — Update
  fastify.patch(
    '/api/v1/settings/business-units/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        code?: string;
        managerName?: string;
        managerEmail?: string;
      };

      const existing = await prisma.businessUnit.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Business unit not found' });
      }

      const updated = await prisma.businessUnit.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.code !== undefined && { code: body.code }),
          ...(body.managerName !== undefined && { managerName: body.managerName }),
          ...(body.managerEmail !== undefined && { managerEmail: body.managerEmail }),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // DELETE /api/v1/settings/business-units/:id — Delete
  fastify.delete(
    '/api/v1/settings/business-units/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const existing = await prisma.businessUnit.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Business unit not found' });
      }

      await prisma.businessUnit.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
