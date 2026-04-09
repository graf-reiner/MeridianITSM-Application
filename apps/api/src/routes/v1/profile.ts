import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Self-service profile routes — any authenticated user can read/update their own profile.
 * No RBAC permission required (scoped to own userId from JWT).
 *
 * GET   /api/v1/profile         — Get current user's profile
 * PATCH /api/v1/profile         — Update current user's profile
 */
export async function profileRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/profile — Get own profile
  fastify.get('/api/v1/profile', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId, userId } = user;

    const found = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        phone: true,
        jobTitle: true,
        department: true,
        themePreference: true,
        notificationPreferences: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        site: { select: { id: true, name: true } },
        userRoles: { include: { role: { select: { id: true, name: true, slug: true } } } },
      },
    });

    if (!found) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.status(200).send(found);
  });

  // PATCH /api/v1/profile — Update own profile (limited fields)
  fastify.patch('/api/v1/profile', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId, userId } = user;

    const body = request.body as {
      firstName?: string;
      lastName?: string;
      displayName?: string;
      phone?: string;
      jobTitle?: string;
      department?: string;
      themePreference?: string;
      notificationPreferences?: Record<string, unknown>;
    };

    // Build update data — only allow safe self-service fields
    const data: Record<string, unknown> = {};
    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.displayName !== undefined) data.displayName = body.displayName;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle;
    if (body.department !== undefined) data.department = body.department;
    if (body.themePreference !== undefined) data.themePreference = body.themePreference;
    if (body.notificationPreferences !== undefined) data.notificationPreferences = body.notificationPreferences as never;

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const updated = await prisma.user.update({
      where: { id: userId, tenantId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        phone: true,
        jobTitle: true,
        department: true,
        themePreference: true,
        notificationPreferences: true,
        updatedAt: true,
      },
    });

    return reply.status(200).send(updated);
  });
}
