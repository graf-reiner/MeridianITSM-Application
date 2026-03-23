import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * API Key Management Routes (INTG-01)
 *
 * JWT-protected, admin-only routes for managing API keys.
 * API keys use SHA-256 hashing — the raw key is only returned once at creation.
 *
 * POST   /api/v1/settings/api-keys     — Create API key (returns full key once)
 * GET    /api/v1/settings/api-keys     — List API keys (never returns full key)
 * DELETE /api/v1/settings/api-keys/:id — Revoke API key
 */
export async function apiKeySettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── POST /api/v1/settings/api-keys ───────────────────────────────────────────

  fastify.post(
    '/api/v1/settings/api-keys',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;

      const body = request.body as {
        name?: string;
        scopes?: string[];
        expiresAt?: string;
        rateLimit?: number;
      };

      if (!body.name) {
        return reply.code(400).send({ error: 'name is required' });
      }

      if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
        return reply.code(400).send({ error: 'scopes is required and must be a non-empty array' });
      }

      // Generate raw key — only returned once, never stored
      const rawKey = randomBytes(32).toString('hex');
      const prefix = rawKey.slice(0, 8);
      const keyHash = createHash('sha256').update(rawKey).digest('hex');

      const apiKey = await prisma.apiKey.create({
        data: {
          tenantId,
          userId,
          name: body.name,
          keyHash,
          keyPrefix: prefix,
          scopes: body.scopes,
          rateLimit: body.rateLimit ?? 100,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          isActive: true,
        },
      });

      // Return full raw key once — consumer must store it; it cannot be recovered
      return reply.code(201).send({
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        prefix,
        scopes: apiKey.scopes,
        createdAt: apiKey.createdAt,
      });
    },
  );

  // ─── GET /api/v1/settings/api-keys ────────────────────────────────────────────

  fastify.get(
    '/api/v1/settings/api-keys',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const apiKeys = await prisma.apiKey.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          rateLimit: true,
          lastUsedAt: true,
          expiresAt: true,
          isActive: true,
          createdAt: true,
          // keyHash is intentionally excluded — never returned after creation
        },
      });

      return reply.send({ apiKeys });
    },
  );

  // ─── DELETE /api/v1/settings/api-keys/:id ─────────────────────────────────────

  fastify.delete(
    '/api/v1/settings/api-keys/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const apiKey = await prisma.apiKey.findFirst({
        where: { id, tenantId },
      });

      if (!apiKey) {
        return reply.code(404).send({ error: 'API key not found' });
      }

      // Soft-revoke — preserves audit trail, consistent with apiKeyPreHandler checking isActive
      await prisma.apiKey.update({
        where: { id },
        data: { isActive: false },
      });

      return reply.send({ ok: true });
    },
  );
}
