import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Settings: Authentication Policy Routes
 *
 * GET   /api/v1/settings/auth-policy — Get tenant auth settings
 * PATCH /api/v1/settings/auth-policy — Update tenant auth settings
 */
export async function authPolicyRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/auth-policy — Get tenant auth settings
  fastify.get(
    '/api/v1/settings/auth-policy',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };

      let settings = await prisma.tenantAuthSettings.findUnique({
        where: { tenantId: user.tenantId },
      });

      // Create default settings if none exist
      if (!settings) {
        settings = await prisma.tenantAuthSettings.create({
          data: { tenantId: user.tenantId },
        });
      }

      return reply.send(settings);
    },
  );

  // PATCH /api/v1/settings/auth-policy — Update tenant auth settings
  fastify.patch(
    '/api/v1/settings/auth-policy',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const body = request.body as Record<string, unknown>;

      // Whitelist allowed fields to prevent unexpected data
      const allowedFields = [
        'allowLocalAuth',
        'allowOidcSso',
        'allowSamlSso',
        'enforceSso',
        'mfaPolicy',
        'mfaGracePeriodDays',
        'allowedMfaTypes',
        'sessionMaxAgeMins',
        'sessionIdleTimeoutMins',
        'passwordMinLength',
        'passwordRequireUpper',
        'passwordRequireLower',
        'passwordRequireNumber',
        'passwordRequireSymbol',
        'passwordMaxAgeDays',
      ];

      const updateData: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (body[key] !== undefined) {
          updateData[key] = body[key];
        }
      }

      const settings = await prisma.tenantAuthSettings.upsert({
        where: { tenantId: user.tenantId },
        create: { tenantId: user.tenantId, ...updateData },
        update: updateData,
      });

      return reply.send(settings);
    },
  );
}
