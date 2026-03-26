import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { hash } from '@node-rs/bcrypt';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Settings: User Management Routes (SETT-01)
 *
 * GET  /api/v1/settings/users             — List users (paginated, searchable)
 * GET  /api/v1/settings/users/:id         — Get user detail
 * POST /api/v1/settings/users             — Create user
 * PATCH /api/v1/settings/users/:id        — Update user
 * POST /api/v1/settings/users/:id/reset-password — Admin password reset
 * POST /api/v1/settings/users/:id/disable — Disable user
 * POST /api/v1/settings/users/:id/enable  — Enable user
 */
export async function usersSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/users — List users
  fastify.get(
    '/api/v1/settings/users',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const query = request.query as {
        search?: string;
        status?: string;
        page?: string;
        limit?: string;
      };

      const page = parseInt(query.page ?? '1', 10);
      const limit = Math.min(parseInt(query.limit ?? '25', 10), 100);
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = { tenantId };

      if (query.search) {
        where.OR = [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      if (query.status) {
        where.status = query.status;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            displayName: true,
            phone: true,
            jobTitle: true,
            department: true,
            status: true,
            siteId: true,
            createdAt: true,
            updatedAt: true,
            userRoles: {
              include: { role: true },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      return reply.status(200).send({
        data: users,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    },
  );

  // GET /api/v1/settings/users/:id — Get user detail
  fastify.get(
    '/api/v1/settings/users/:id',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const found = await prisma.user.findFirst({
        where: { id, tenantId },
        include: {
          userRoles: {
            include: { role: true },
          },
          userGroupMembers: {
            include: { userGroup: true },
          },
          site: true,
        },
      });

      if (!found) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Exclude passwordHash from response
      const { passwordHash: _, ...safeUser } = found as typeof found & { passwordHash: string };
      return reply.status(200).send(safeUser);
    },
  );

  // POST /api/v1/settings/users — Create user
  fastify.post(
    '/api/v1/settings/users',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        email: string;
        firstName: string;
        lastName: string;
        password: string;
        systemRole?: string;
        customRoleId?: string;
        phone?: string;
        jobTitle?: string;
        department?: string;
        siteId?: string;
      };

      if (!body.email || !body.firstName || !body.lastName || !body.password) {
        return reply.status(400).send({ error: 'email, firstName, lastName, and password are required' });
      }

      // Check email uniqueness within tenant
      const existing = await prisma.user.findFirst({
        where: { tenantId, email: body.email.toLowerCase() },
      });

      if (existing) {
        return reply.status(409).send({ error: 'A user with this email already exists' });
      }

      const passwordHash = await hash(body.password, 12);

      const newUser = await prisma.user.create({
        data: {
          tenantId,
          email: body.email.toLowerCase(),
          firstName: body.firstName,
          lastName: body.lastName,
          passwordHash,
          phone: body.phone,
          jobTitle: body.jobTitle,
          department: body.department,
          siteId: body.siteId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
        },
      });

      return reply.status(201).send(newUser);
    },
  );

  // PATCH /api/v1/settings/users/:id — Update user (no password)
  fastify.patch(
    '/api/v1/settings/users/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        firstName?: string;
        lastName?: string;
        displayName?: string;
        phone?: string;
        jobTitle?: string;
        department?: string;
        siteId?: string;
        status?: string;
      };

      const existing = await prisma.user.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(body.firstName !== undefined && { firstName: body.firstName }),
          ...(body.lastName !== undefined && { lastName: body.lastName }),
          ...(body.displayName !== undefined && { displayName: body.displayName }),
          ...(body.phone !== undefined && { phone: body.phone }),
          ...(body.jobTitle !== undefined && { jobTitle: body.jobTitle }),
          ...(body.department !== undefined && { department: body.department }),
          ...(body.siteId !== undefined && { siteId: body.siteId }),
          ...(body.status !== undefined && { status: body.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          phone: true,
          jobTitle: true,
          department: true,
          status: true,
          updatedAt: true,
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // POST /api/v1/settings/users/:id/reset-password — Admin password reset
  fastify.post(
    '/api/v1/settings/users/:id/reset-password',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as { newPassword: string };

      if (!body.newPassword || body.newPassword.length < 8) {
        return reply.status(400).send({ error: 'newPassword is required and must be at least 8 characters' });
      }

      const existing = await prisma.user.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const passwordHash = await hash(body.newPassword, 12);

      await prisma.user.update({
        where: { id },
        data: { passwordHash },
      });

      return reply.status(200).send({ message: 'Password reset successfully' });
    },
  );

  // POST /api/v1/settings/users/:id/disable — Disable user
  fastify.post(
    '/api/v1/settings/users/:id/disable',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const existing = await prisma.user.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'User not found' });
      }

      await prisma.user.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });

      return reply.status(200).send({ message: 'User disabled' });
    },
  );

  // POST /api/v1/settings/users/:id/enable — Enable user
  fastify.post(
    '/api/v1/settings/users/:id/enable',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const existing = await prisma.user.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'User not found' });
      }

      await prisma.user.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });

      return reply.status(200).send({ message: 'User enabled' });
    },
  );

  // POST /api/v1/settings/users/:id/clear-mfa — Clear all MFA devices for a user (admin action)
  fastify.post(
    '/api/v1/settings/users/:id/clear-mfa',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const existing = await prisma.user.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Delete all MFA devices, challenges, and recovery codes
      await prisma.$transaction([
        prisma.mfaDevice.deleteMany({ where: { userId: id } }),
        prisma.mfaChallenge.deleteMany({ where: { userId: id } }),
        prisma.recoveryCode.deleteMany({ where: { userId: id } }),
      ]);

      return reply.status(200).send({ message: 'MFA cleared for user' });
    },
  );
}
