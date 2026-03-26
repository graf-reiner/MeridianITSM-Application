import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Settings: Federation Routes
 *
 * GET    /api/v1/settings/users/:userId/federation             — Get user's federated identities & MFA devices
 * DELETE /api/v1/settings/users/:userId/federation/:identityId — Unlink federated identity
 */
export async function federationRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/users/:userId/federation — Get user's federated identities
  fastify.get(
    '/api/v1/settings/users/:userId/federation',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { userId } = request.params as { userId: string };

      // Verify user belongs to this tenant
      const targetUser = await prisma.user.findFirst({
        where: { id: userId, tenantId: user.tenantId },
      });
      if (!targetUser) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const identities = await prisma.federatedIdentity.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      const mfaDevices = await prisma.mfaDevice.findMany({
        where: { userId, status: 'active' },
        select: {
          id: true,
          type: true,
          name: true,
          lastUsedAt: true,
          createdAt: true,
        },
      });

      return reply.send({ identities, mfaDevices });
    },
  );

  // DELETE /api/v1/settings/users/:userId/federation/:identityId — Unlink federated identity
  fastify.delete(
    '/api/v1/settings/users/:userId/federation/:identityId',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { userId, identityId } = request.params as {
        userId: string;
        identityId: string;
      };

      const targetUser = await prisma.user.findFirst({
        where: { id: userId, tenantId: user.tenantId },
      });
      if (!targetUser) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const identity = await prisma.federatedIdentity.findFirst({
        where: { id: identityId, userId },
      });
      if (!identity) {
        return reply.status(404).send({ error: 'Identity not found' });
      }

      await prisma.federatedIdentity.delete({ where: { id: identityId } });
      return reply.status(204).send();
    },
  );
}
