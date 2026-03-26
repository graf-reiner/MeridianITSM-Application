import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';
import { encrypt } from '../../../lib/encryption.js';

/**
 * Settings: SSO Connection Management Routes
 *
 * GET    /api/v1/settings/sso       — List SSO connections for tenant
 * POST   /api/v1/settings/sso       — Create SSO connection
 * PATCH  /api/v1/settings/sso/:id   — Update SSO connection
 * DELETE /api/v1/settings/sso/:id   — Delete SSO connection
 */
export async function ssoSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/sso — List SSO connections
  fastify.get(
    '/api/v1/settings/sso',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };

      const connections = await prisma.ssoConnection.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          protocol: true,
          status: true,
          oidcClientId: true,
          oidcIssuerUrl: true,
          oidcDiscoveryUrl: true,
          samlMetadataUrl: true,
          samlEntityId: true,
          autoProvision: true,
          defaultRole: true,
          forceMfa: true,
          createdAt: true,
          updatedAt: true,
          // Do NOT return oidcClientSecret or samlMetadataRaw
        },
      });

      return reply.status(200).send(connections);
    },
  );

  // POST /api/v1/settings/sso — Create SSO connection
  fastify.post(
    '/api/v1/settings/sso',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const body = request.body as {
        name: string;
        protocol: string;
        oidcClientId?: string;
        oidcClientSecret?: string;
        oidcIssuerUrl?: string;
        oidcDiscoveryUrl?: string;
        samlMetadataUrl?: string;
        samlMetadataRaw?: string;
        autoProvision?: boolean;
        defaultRole?: string;
        forceMfa?: boolean;
      };

      if (!body.name || !body.protocol) {
        return reply.status(400).send({ error: 'name and protocol are required' });
      }

      if (!['oidc', 'saml'].includes(body.protocol)) {
        return reply.status(400).send({ error: 'protocol must be "oidc" or "saml"' });
      }

      const connection = await prisma.ssoConnection.create({
        data: {
          tenantId: user.tenantId,
          name: body.name,
          protocol: body.protocol,
          status: 'active',
          oidcClientId: body.oidcClientId,
          oidcClientSecret: body.oidcClientSecret ? encrypt(body.oidcClientSecret) : undefined,
          oidcIssuerUrl: body.oidcIssuerUrl,
          oidcDiscoveryUrl: body.oidcDiscoveryUrl,
          samlMetadataUrl: body.samlMetadataUrl,
          samlMetadataRaw: body.samlMetadataRaw,
          autoProvision: body.autoProvision ?? true,
          defaultRole: body.defaultRole ?? 'agent',
          forceMfa: body.forceMfa ?? false,
        },
      });

      return reply.status(201).send(connection);
    },
  );

  // PATCH /api/v1/settings/sso/:id — Update SSO connection
  fastify.patch(
    '/api/v1/settings/sso/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        status?: string;
        oidcClientId?: string;
        oidcClientSecret?: string;
        oidcIssuerUrl?: string;
        oidcDiscoveryUrl?: string;
        autoProvision?: boolean;
        defaultRole?: string;
        forceMfa?: boolean;
      };

      const existing = await prisma.ssoConnection.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'SSO connection not found' });
      }

      const updated = await prisma.ssoConnection.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.oidcClientId !== undefined && { oidcClientId: body.oidcClientId }),
          ...(body.oidcClientSecret !== undefined && {
            oidcClientSecret: encrypt(body.oidcClientSecret),
          }),
          ...(body.oidcIssuerUrl !== undefined && { oidcIssuerUrl: body.oidcIssuerUrl }),
          ...(body.oidcDiscoveryUrl !== undefined && { oidcDiscoveryUrl: body.oidcDiscoveryUrl }),
          ...(body.autoProvision !== undefined && { autoProvision: body.autoProvision }),
          ...(body.defaultRole !== undefined && { defaultRole: body.defaultRole }),
          ...(body.forceMfa !== undefined && { forceMfa: body.forceMfa }),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // DELETE /api/v1/settings/sso/:id — Delete SSO connection
  fastify.delete(
    '/api/v1/settings/sso/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };

      const existing = await prisma.ssoConnection.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'SSO connection not found' });
      }

      await prisma.ssoConnection.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
