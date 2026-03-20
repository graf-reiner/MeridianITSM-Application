import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Settings: User Group Management Routes (SETT-03)
 *
 * GET    /api/v1/settings/groups                      — List groups with member count
 * POST   /api/v1/settings/groups                      — Create group
 * PATCH  /api/v1/settings/groups/:id                  — Update group
 * DELETE /api/v1/settings/groups/:id                  — Delete group
 * GET    /api/v1/settings/groups/:id/members           — List members
 * POST   /api/v1/settings/groups/:id/members           — Add member
 * DELETE /api/v1/settings/groups/:id/members/:userId   — Remove member
 */
export async function groupsSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/groups — List groups with member count
  fastify.get(
    '/api/v1/settings/groups',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const groups = await prisma.userGroup.findMany({
        where: { tenantId },
        include: {
          _count: { select: { userGroupMembers: true } },
        },
        orderBy: { name: 'asc' },
      });

      return reply.status(200).send(groups);
    },
  );

  // POST /api/v1/settings/groups — Create group
  fastify.post(
    '/api/v1/settings/groups',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        name: string;
        email?: string;
        description?: string;
      };

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required' });
      }

      const group = await prisma.userGroup.create({
        data: {
          tenantId,
          name: body.name,
          email: body.email,
          description: body.description,
        },
      });

      return reply.status(201).send(group);
    },
  );

  // PATCH /api/v1/settings/groups/:id — Update group
  fastify.patch(
    '/api/v1/settings/groups/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        email?: string;
        description?: string;
      };

      const existing = await prisma.userGroup.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Group not found' });
      }

      const updated = await prisma.userGroup.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.email !== undefined && { email: body.email }),
          ...(body.description !== undefined && { description: body.description }),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // DELETE /api/v1/settings/groups/:id — Delete group (cascades UserGroupMember)
  fastify.delete(
    '/api/v1/settings/groups/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const existing = await prisma.userGroup.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Group not found' });
      }

      // Delete members first (cascade)
      await prisma.userGroupMember.deleteMany({ where: { userGroupId: id, tenantId } });
      await prisma.userGroup.delete({ where: { id } });

      return reply.status(204).send();
    },
  );

  // GET /api/v1/settings/groups/:id/members — List members with user details
  fastify.get(
    '/api/v1/settings/groups/:id/members',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const group = await prisma.userGroup.findFirst({ where: { id, tenantId } });
      if (!group) {
        return reply.status(404).send({ error: 'Group not found' });
      }

      const members = await prisma.userGroupMember.findMany({
        where: { userGroupId: id, tenantId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              displayName: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return reply.status(200).send(members);
    },
  );

  // POST /api/v1/settings/groups/:id/members — Add member
  fastify.post(
    '/api/v1/settings/groups/:id/members',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as { userId: string };

      if (!body.userId) {
        return reply.status(400).send({ error: 'userId is required' });
      }

      const group = await prisma.userGroup.findFirst({ where: { id, tenantId } });
      if (!group) {
        return reply.status(404).send({ error: 'Group not found' });
      }

      const userExists = await prisma.user.findFirst({ where: { id: body.userId, tenantId } });
      if (!userExists) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Check if already a member
      const existing = await prisma.userGroupMember.findFirst({
        where: { userGroupId: id, userId: body.userId },
      });
      if (existing) {
        return reply.status(409).send({ error: 'User is already a member of this group' });
      }

      const member = await prisma.userGroupMember.create({
        data: {
          tenantId,
          userGroupId: id,
          userId: body.userId,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return reply.status(201).send(member);
    },
  );

  // DELETE /api/v1/settings/groups/:id/members/:userId — Remove member
  fastify.delete(
    '/api/v1/settings/groups/:id/members/:userId',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id, userId } = request.params as { id: string; userId: string };

      const group = await prisma.userGroup.findFirst({ where: { id, tenantId } });
      if (!group) {
        return reply.status(404).send({ error: 'Group not found' });
      }

      const member = await prisma.userGroupMember.findFirst({
        where: { userGroupId: id, userId, tenantId },
      });
      if (!member) {
        return reply.status(404).send({ error: 'Member not found in this group' });
      }

      await prisma.userGroupMember.delete({ where: { id: member.id } });
      return reply.status(204).send();
    },
  );
}
