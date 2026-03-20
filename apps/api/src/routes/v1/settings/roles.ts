import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Settings: Role Management Routes (SETT-02)
 *
 * GET   /api/v1/settings/roles       — List all roles (system + custom)
 * POST  /api/v1/settings/roles       — Create custom role
 * PATCH /api/v1/settings/roles/:id   — Update custom role (blocks system roles)
 * DELETE /api/v1/settings/roles/:id  — Delete custom role
 */
export async function rolesSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/roles — List all roles
  fastify.get(
    '/api/v1/settings/roles',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const roles = await prisma.role.findMany({
        where: { tenantId },
        include: {
          _count: { select: { userRoles: true } },
        },
        orderBy: [{ isSystemRole: 'desc' }, { name: 'asc' }],
      });

      return reply.status(200).send(roles);
    },
  );

  // POST /api/v1/settings/roles — Create custom role
  fastify.post(
    '/api/v1/settings/roles',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        name: string;
        permissions: string[];
      };

      if (!body.name || !Array.isArray(body.permissions)) {
        return reply.status(400).send({ error: 'name and permissions array are required' });
      }

      // Generate slug from name
      const slug = body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

      // Check slug uniqueness within tenant
      const existing = await prisma.role.findFirst({ where: { tenantId, slug } });
      if (existing) {
        return reply.status(409).send({ error: 'A role with this name already exists' });
      }

      const role = await prisma.role.create({
        data: {
          tenantId,
          name: body.name,
          slug,
          permissions: body.permissions,
          isSystemRole: false,
        },
      });

      return reply.status(201).send(role);
    },
  );

  // PATCH /api/v1/settings/roles/:id — Update custom role
  fastify.patch(
    '/api/v1/settings/roles/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        permissions?: string[];
      };

      const role = await prisma.role.findFirst({ where: { id, tenantId } });
      if (!role) {
        return reply.status(404).send({ error: 'Role not found' });
      }

      // Block editing system roles
      if (role.isSystemRole) {
        return reply.status(403).send({ error: 'System roles cannot be modified' });
      }

      const updated = await prisma.role.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.permissions !== undefined && { permissions: body.permissions }),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // DELETE /api/v1/settings/roles/:id — Delete custom role
  fastify.delete(
    '/api/v1/settings/roles/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const role = await prisma.role.findFirst({
        where: { id, tenantId },
        include: { _count: { select: { userRoles: true } } },
      });

      if (!role) {
        return reply.status(404).send({ error: 'Role not found' });
      }

      // Block deleting system roles
      if (role.isSystemRole) {
        return reply.status(403).send({ error: 'System roles cannot be deleted' });
      }

      // Block if users are assigned
      if (role._count.userRoles > 0) {
        return reply.status(409).send({
          error: 'Cannot delete role with assigned users',
          assignedUsers: role._count.userRoles,
        });
      }

      await prisma.role.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
