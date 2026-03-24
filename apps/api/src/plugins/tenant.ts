import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Tenant injection preHandler.
 * Extracts tenantId from the verified JWT claims (set by authPreHandler).
 * Looks up the tenant in the DB (using raw prisma — Tenant is a global model).
 * Sets request.tenant, request.tenantId, and request.currentUser.
 */
export async function tenantPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { tenantId, userId } = request.user;

  if (!tenantId) {
    return reply.code(401).send({ error: 'Missing tenantId in token' });
  }

  // Tenant is a global model — use raw prisma (not tenant-scoped)
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
  });

  if (!tenant || tenant.status !== 'ACTIVE') {
    return reply.code(403).send({ error: 'Tenant not found or suspended' });
  }

  // Load the full user record with role information
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!user) {
    return reply.code(401).send({ error: 'User not found' });
  }

  // Extract role slugs and flatten all permission arrays from assigned roles
  const roleSlugs = user.userRoles.map((ur) => ur.role.slug);
  const permissions = user.userRoles.flatMap((ur) => {
    const perms = ur.role.permissions;
    return Array.isArray(perms) ? (perms as string[]) : [];
  });

  request.tenant = tenant;
  request.tenantId = tenantId;
  request.currentUser = { ...user, roles: permissions, roleSlugs };
}
