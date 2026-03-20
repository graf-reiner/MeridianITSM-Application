import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Settings: Site Management Routes (SETT-07)
 *
 * GET    /api/v1/settings/sites       — List sites
 * GET    /api/v1/settings/sites/:id   — Get site detail
 * POST   /api/v1/settings/sites       — Create site
 * PATCH  /api/v1/settings/sites/:id   — Update site
 * DELETE /api/v1/settings/sites/:id   — Delete site
 */
export async function sitesSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/sites — List sites
  fastify.get(
    '/api/v1/settings/sites',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const sites = await prisma.site.findMany({
        where: { tenantId },
        include: {
          _count: { select: { users: true, assets: true } },
        },
        orderBy: { name: 'asc' },
      });

      return reply.status(200).send(sites);
    },
  );

  // GET /api/v1/settings/sites/:id — Get site detail
  fastify.get(
    '/api/v1/settings/sites/:id',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const site = await prisma.site.findFirst({
        where: { id, tenantId },
        include: {
          _count: { select: { users: true, assets: true } },
        },
      });

      if (!site) {
        return reply.status(404).send({ error: 'Site not found' });
      }

      return reply.status(200).send(site);
    },
  );

  // POST /api/v1/settings/sites — Create site
  fastify.post(
    '/api/v1/settings/sites',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        name: string;
        address?: string;
        city?: string;
        state?: string;
        country?: string;
        postalCode?: string;
        primaryContactName?: string;
        primaryContactEmail?: string;
        primaryContactPhone?: string;
      };

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required' });
      }

      const site = await prisma.site.create({
        data: {
          tenantId,
          name: body.name,
          address: body.address,
          city: body.city,
          state: body.state,
          country: body.country,
          postalCode: body.postalCode,
          primaryContactName: body.primaryContactName,
          primaryContactEmail: body.primaryContactEmail,
          primaryContactPhone: body.primaryContactPhone,
        },
      });

      return reply.status(201).send(site);
    },
  );

  // PATCH /api/v1/settings/sites/:id — Update site
  fastify.patch(
    '/api/v1/settings/sites/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        address?: string;
        city?: string;
        state?: string;
        country?: string;
        postalCode?: string;
        primaryContactName?: string;
        primaryContactEmail?: string;
        primaryContactPhone?: string;
      };

      const existing = await prisma.site.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Site not found' });
      }

      const updated = await prisma.site.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.address !== undefined && { address: body.address }),
          ...(body.city !== undefined && { city: body.city }),
          ...(body.state !== undefined && { state: body.state }),
          ...(body.country !== undefined && { country: body.country }),
          ...(body.postalCode !== undefined && { postalCode: body.postalCode }),
          ...(body.primaryContactName !== undefined && { primaryContactName: body.primaryContactName }),
          ...(body.primaryContactEmail !== undefined && { primaryContactEmail: body.primaryContactEmail }),
          ...(body.primaryContactPhone !== undefined && { primaryContactPhone: body.primaryContactPhone }),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // DELETE /api/v1/settings/sites/:id — Delete site
  fastify.delete(
    '/api/v1/settings/sites/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const site = await prisma.site.findFirst({
        where: { id, tenantId },
        include: { _count: { select: { users: true, assets: true } } },
      });

      if (!site) {
        return reply.status(404).send({ error: 'Site not found' });
      }

      if (site._count.users > 0 || site._count.assets > 0) {
        return reply.status(409).send({
          error: 'Cannot delete site with assigned users or assets',
          userCount: site._count.users,
          assetCount: site._count.assets,
        });
      }

      await prisma.site.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
