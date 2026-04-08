import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

const VALID_FEATURES = ['knowledge_base', 'service_forms', 'ticket_lookup'] as const;

interface PortalSettings {
  allowPublicPortal: boolean;
  publicPortalFeatures: string[];
}

const DEFAULT_SETTINGS: PortalSettings = {
  allowPublicPortal: false,
  publicPortalFeatures: [],
};

/**
 * Settings: Portal Access Routes
 *
 * GET   /api/v1/settings/portal-access — Get tenant portal access settings
 * PATCH /api/v1/settings/portal-access — Update tenant portal access settings
 */
export async function portalAccessRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/portal-access — Get tenant portal access settings
  fastify.get(
    '/api/v1/settings/portal-access',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };

      const tenant = await prisma.tenant.findFirst({
        where: { id: user.tenantId },
        select: { settings: true, subdomain: true },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      const settings = (tenant.settings as Record<string, unknown>) ?? {};
      const portalSettings: PortalSettings = {
        allowPublicPortal:
          typeof settings.allowPublicPortal === 'boolean'
            ? settings.allowPublicPortal
            : DEFAULT_SETTINGS.allowPublicPortal,
        publicPortalFeatures: Array.isArray(settings.publicPortalFeatures)
          ? settings.publicPortalFeatures
          : DEFAULT_SETTINGS.publicPortalFeatures,
      };

      return reply.send({
        ...portalSettings,
        subdomain: tenant.subdomain ?? null,
      });
    },
  );

  // PATCH /api/v1/settings/portal-access — Update tenant portal access settings
  fastify.patch(
    '/api/v1/settings/portal-access',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const body = request.body as Record<string, unknown>;

      const tenant = await prisma.tenant.findFirst({
        where: { id: user.tenantId },
        select: { id: true, settings: true, subdomain: true },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      const existingSettings = (tenant.settings as Record<string, unknown>) ?? {};

      // Merge portal access fields into tenant settings
      if (typeof body.allowPublicPortal === 'boolean') {
        existingSettings.allowPublicPortal = body.allowPublicPortal;
      }

      if (Array.isArray(body.publicPortalFeatures)) {
        // Validate features — only allow known values
        const validFeatures = (body.publicPortalFeatures as string[]).filter((f) =>
          (VALID_FEATURES as readonly string[]).includes(f),
        );
        existingSettings.publicPortalFeatures = validFeatures;
      }

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { settings: existingSettings as any },
      });

      const portalSettings: PortalSettings = {
        allowPublicPortal:
          typeof existingSettings.allowPublicPortal === 'boolean'
            ? existingSettings.allowPublicPortal
            : DEFAULT_SETTINGS.allowPublicPortal,
        publicPortalFeatures: Array.isArray(existingSettings.publicPortalFeatures)
          ? existingSettings.publicPortalFeatures
          : DEFAULT_SETTINGS.publicPortalFeatures,
      };

      return reply.send({
        ...portalSettings,
        subdomain: tenant.subdomain ?? null,
      });
    },
  );
}
