import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Admin Agent Management Routes (AGNT-08)
 *
 * JWT-protected, admin-only routes for managing agents and enrollment tokens.
 * Used by the web settings UI (Plan 09).
 *
 * GET    /api/v1/settings/agents            — List agents for tenant
 * GET    /api/v1/settings/agents/tokens     — List enrollment tokens
 * POST   /api/v1/settings/agents/tokens     — Generate new enrollment token
 * DELETE /api/v1/settings/agents/tokens/:id — Revoke enrollment token
 * DELETE /api/v1/settings/agents/:id        — Delete agent
 */
export async function agentSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /api/v1/settings/agents ──────────────────────────────────────────────

  fastify.get(
    '/api/v1/settings/agents',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const agents = await prisma.agent.findMany({
        where: { tenantId },
        orderBy: { lastHeartbeatAt: 'desc' },
        select: {
          id: true,
          hostname: true,
          platform: true,
          status: true,
          lastHeartbeatAt: true,
          agentVersion: true,
          enrolledAt: true,
        },
      });

      // Compute display status — if lastHeartbeatAt > 24h ago and status is ACTIVE, show as STALE
      const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const agentsWithDisplayStatus = agents.map((agent) => ({
        ...agent,
        displayStatus:
          agent.status === 'ACTIVE' &&
          agent.lastHeartbeatAt !== null &&
          agent.lastHeartbeatAt < staleThreshold
            ? 'STALE'
            : agent.status,
      }));

      return reply.send({ agents: agentsWithDisplayStatus });
    },
  );

  // ─── GET /api/v1/settings/agents/tokens ────────────────────────────────────────
  // Must be defined BEFORE /:id to avoid route conflict

  fastify.get(
    '/api/v1/settings/agents/tokens',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const tokens = await prisma.agentEnrollmentToken.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tokenHash: true,
          enrollCount: true,
          maxEnrollments: true,
          expiresAt: true,
          isActive: true,
          createdAt: true,
        },
      });

      // Return prefix (first 8 chars of tokenHash) — never the full hash or raw token
      const tokensWithPrefix = tokens.map(({ tokenHash, ...rest }) => ({
        ...rest,
        prefix: tokenHash.slice(0, 8),
      }));

      return reply.send({ tokens: tokensWithPrefix });
    },
  );

  // ─── POST /api/v1/settings/agents/tokens ───────────────────────────────────────

  fastify.post(
    '/api/v1/settings/agents/tokens',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const body = request.body as {
        maxEnrollments?: number;
        expiresAt?: string;
      };

      // Generate raw token — only returned once
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const token = await prisma.agentEnrollmentToken.create({
        data: {
          tenantId,
          tokenHash,
          maxEnrollments: body.maxEnrollments ?? 1,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          isActive: true,
          enrollCount: 0,
        },
      });

      // Return raw token once — like API key pattern, not stored
      return reply.code(201).send({
        id: token.id,
        token: rawToken,
        expiresAt: token.expiresAt,
        maxEnrollments: token.maxEnrollments,
      });
    },
  );

  // ─── DELETE /api/v1/settings/agents/tokens/:id ─────────────────────────────────

  fastify.delete(
    '/api/v1/settings/agents/tokens/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const token = await prisma.agentEnrollmentToken.findFirst({
        where: { id, tenantId },
      });

      if (!token) {
        return reply.code(404).send({ error: 'Enrollment token not found' });
      }

      await prisma.agentEnrollmentToken.update({
        where: { id },
        data: { isActive: false },
      });

      return reply.send({ ok: true });
    },
  );

  // ─── DELETE /api/v1/settings/agents/:id ────────────────────────────────────────

  fastify.delete(
    '/api/v1/settings/agents/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const agent = await prisma.agent.findFirst({
        where: { id, tenantId },
      });

      if (!agent) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      // Delete cascades InventorySnapshot and MetricSample records via DB FK cascade
      await prisma.agent.delete({
        where: { id },
      });

      return reply.send({ ok: true });
    },
  );
}
