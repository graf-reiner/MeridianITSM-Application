import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';
import { encrypt } from '../../../lib/encryption.js';
import { logAuthEvent } from '../../../lib/auth-audit.js';

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

      if (typeof body.name !== 'string' || body.name.length > 255) {
        return reply.status(400).send({ error: 'name must be a non-empty string (max 255 chars)' });
      }

      if (!['oidc', 'saml'].includes(body.protocol)) {
        return reply.status(400).send({ error: 'protocol must be "oidc" or "saml"' });
      }

      // Validate OIDC URLs
      if (body.protocol === 'oidc') {
        if (body.oidcIssuerUrl) {
          try { new URL(body.oidcIssuerUrl); } catch {
            return reply.status(400).send({ error: 'oidcIssuerUrl must be a valid URL' });
          }
        }
        if (body.oidcDiscoveryUrl) {
          try { new URL(body.oidcDiscoveryUrl); } catch {
            return reply.status(400).send({ error: 'oidcDiscoveryUrl must be a valid URL' });
          }
        }
      }

      // Validate SAML URLs and metadata
      if (body.protocol === 'saml') {
        if (body.samlMetadataUrl) {
          try { new URL(body.samlMetadataUrl); } catch {
            return reply.status(400).send({ error: 'samlMetadataUrl must be a valid URL' });
          }
        }
        if (body.samlMetadataRaw) {
          const trimmed = body.samlMetadataRaw.trim();
          if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<')) {
            return reply.status(400).send({ error: 'samlMetadataRaw must be valid XML' });
          }
        }
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

      const reqUser = request.user as { tenantId: string; userId?: string };
      logAuthEvent({
        tenantId: reqUser.tenantId,
        userId: (reqUser as any).userId,
        eventType: 'SSO_CONNECTION_CREATED',
        resourceId: connection.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? undefined,
        success: true,
        metadata: { name: body.name, protocol: body.protocol },
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

      const reqUser = request.user as { tenantId: string; userId?: string };
      logAuthEvent({
        tenantId: reqUser.tenantId,
        userId: (reqUser as any).userId,
        eventType: 'SSO_CONNECTION_UPDATED',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? undefined,
        success: true,
        metadata: { updatedFields: Object.keys(body) },
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

      const reqUser = request.user as { tenantId: string; userId?: string };
      logAuthEvent({
        tenantId: reqUser.tenantId,
        userId: (reqUser as any).userId,
        eventType: 'SSO_CONNECTION_DELETED',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? undefined,
        success: true,
        metadata: { name: existing.name, protocol: existing.protocol },
      });

      return reply.status(204).send();
    },
  );
}
