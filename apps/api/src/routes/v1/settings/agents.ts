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
          scopes: [],
          maxEnrollments: body.maxEnrollments ?? -1,
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

  // ─── GET /api/v1/settings/agents/:id ───────────────────────────────────────────

  fastify.get(
    '/api/v1/settings/agents/:id',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const agent = await prisma.agent.findFirst({
        where: { id, tenantId },
        select: {
          id: true,
          hostname: true,
          platform: true,
          platformVersion: true,
          agentVersion: true,
          status: true,
          lastHeartbeatAt: true,
          enrolledAt: true,
          metadata: true,
          inventorySnapshots: {
            orderBy: { collectedAt: 'desc' },
            take: 5,
            select: {
              id: true,
              hostname: true,
              operatingSystem: true,
              osVersion: true,
              cpuModel: true,
              cpuCores: true,
              ramGb: true,
              disks: true,
              networkInterfaces: true,
              installedSoftware: true,
              collectedAt: true,
            },
          },
        },
      });

      if (!agent) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      // Compute display status
      const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const displayStatus =
        agent.status === 'ACTIVE' &&
        agent.lastHeartbeatAt !== null &&
        agent.lastHeartbeatAt < staleThreshold
          ? 'STALE'
          : agent.status;

      return reply.send({ ...agent, displayStatus });
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

  // ─── GET /api/v1/settings/agents/:id/metrics ───────────────────────────────────
  // Returns metric samples for a given agent over the last N hours (default 24, max 168).

  fastify.get(
    '/api/v1/settings/agents/:id/metrics',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id: agentId } = request.params as { id: string };
      const query = request.query as { hours?: string };
      const hours = Math.min(168, Math.max(1, parseInt(query.hours ?? '24', 10)));
      const since = new Date(Date.now() - hours * 3600000);

      // Verify agent belongs to tenant
      const agent = await prisma.agent.findFirst({ where: { id: agentId, tenantId }, select: { id: true } });
      if (!agent) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      const metrics = await prisma.metricSample.findMany({
        where: { tenantId, agentId, timestamp: { gte: since } },
        orderBy: { timestamp: 'asc' },
        select: { metricType: true, metricName: true, value: true, unit: true, timestamp: true },
      });

      return reply.send({ metrics });
    },
  );

  // ─── POST /api/v1/settings/agents/:id/status ───────────────────────────────────
  // Change agent status: ACTIVE, SUSPENDED, or DEREGISTERED.

  fastify.post(
    '/api/v1/settings/agents/:id/status',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };

      if (!['ACTIVE', 'SUSPENDED', 'DEREGISTERED'].includes(status)) {
        return reply.status(400).send({ error: 'Invalid status. Must be ACTIVE, SUSPENDED, or DEREGISTERED.' });
      }

      const existing = await prisma.agent.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } });
      if (!existing) {
        return reply.code(404).send({ error: 'Agent not found' });
      }

      const agent = await prisma.agent.update({
        where: { id, tenantId: user.tenantId },
        data: { status },
      });

      return reply.send(agent);
    },
  );

  // ─── GET /api/v1/settings/agents/:id/inventory ──────────────────────────────
  // Returns the latest inventory snapshot for an agent with all enriched fields.

  fastify.get(
    '/api/v1/settings/agents/:id/inventory',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const snapshot = await prisma.inventorySnapshot.findFirst({
        where: { agentId: id, tenantId },
        orderBy: { collectedAt: 'desc' },
      });

      if (!snapshot) {
        return reply.status(404).send({ error: 'No inventory snapshot found for this agent' });
      }

      return reply.send(snapshot);
    },
  );

  // ─── GET /api/v1/cmdb/cis/:id/inventory ────────────────────────────────────
  // Returns the latest inventory snapshot for a CI (via its linked agent).

  fastify.get(
    '/api/v1/cmdb/cis/:id/inventory',
    { preHandler: [requirePermission('cmdb.view')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const ci = await prisma.cmdbConfigurationItem.findFirst({
        where: { id, tenantId },
        select: { agentId: true },
      });

      if (!ci || !ci.agentId) {
        return reply.status(404).send({ error: 'CI not found or has no linked agent' });
      }

      const snapshot = await prisma.inventorySnapshot.findFirst({
        where: { agentId: ci.agentId, tenantId },
        orderBy: { collectedAt: 'desc' },
      });

      if (!snapshot) {
        return reply.status(404).send({ error: 'No inventory snapshot found' });
      }

      return reply.send(snapshot);
    },
  );

  // ─── GET /api/v1/settings/agents/policy ───────────────────────────────────────
  // Tenant-level agent-deploy policy flags.
  fastify.get(
    '/api/v1/settings/agents/policy',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenant = await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: {
          agentUpdatePolicy: true,
          agentUpdateWindowStart: true,
          agentUpdateWindowEnd: true,
          agentUpdateWindowDay: true,
          agentDeployRequiresChange: true,
        },
      });
      if (!tenant) return reply.code(404).send({ error: 'Tenant not found' });
      return reply.send(tenant);
    },
  );

  // ─── PATCH /api/v1/settings/agents/policy ─────────────────────────────────────
  fastify.patch(
    '/api/v1/settings/agents/policy',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const body = request.body as {
        agentUpdatePolicy?: 'manual' | 'auto' | 'scheduled';
        agentUpdateWindowStart?: string | null;
        agentUpdateWindowEnd?: string | null;
        agentUpdateWindowDay?: string | null;
        agentDeployRequiresChange?: boolean;
      };

      const data: Record<string, unknown> = {};
      if (body.agentUpdatePolicy !== undefined) {
        if (!['manual', 'auto', 'scheduled'].includes(body.agentUpdatePolicy)) {
          return reply.code(400).send({ error: 'Invalid agentUpdatePolicy' });
        }
        data.agentUpdatePolicy = body.agentUpdatePolicy;
      }
      if (body.agentUpdateWindowStart !== undefined) data.agentUpdateWindowStart = body.agentUpdateWindowStart;
      if (body.agentUpdateWindowEnd !== undefined) data.agentUpdateWindowEnd = body.agentUpdateWindowEnd;
      if (body.agentUpdateWindowDay !== undefined) data.agentUpdateWindowDay = body.agentUpdateWindowDay;
      if (body.agentDeployRequiresChange !== undefined) {
        data.agentDeployRequiresChange = !!body.agentDeployRequiresChange;
      }

      if (Object.keys(data).length === 0) {
        return reply.code(400).send({ error: 'No fields to update' });
      }

      const updated = await prisma.tenant.update({
        where: { id: user.tenantId },
        data,
        select: {
          agentUpdatePolicy: true,
          agentUpdateWindowStart: true,
          agentUpdateWindowEnd: true,
          agentUpdateWindowDay: true,
          agentDeployRequiresChange: true,
        },
      });
      return reply.send(updated);
    },
  );

  // ─── GET /api/v1/settings/agent-updates/deployments ───────────────────────────
  // Paginated deployment history for the tenant.
  fastify.get(
    '/api/v1/settings/agent-updates/deployments',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const q = request.query as { page?: string; pageSize?: string };
      const page = Math.max(1, Number.parseInt(q.page ?? '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(q.pageSize ?? '25', 10) || 25));
      const skip = (page - 1) * pageSize;

      const [total, rows] = await Promise.all([
        prisma.agentUpdateDeployment.count({ where: { tenantId } }),
        prisma.agentUpdateDeployment.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          include: {
            agentUpdate: { select: { version: true } },
            triggeredBy: { select: { email: true, firstName: true, lastName: true } },
            change: { select: { id: true, changeNumber: true, status: true, type: true } },
          },
        }),
      ]);

      return reply.send({
        data: rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          platform: r.platform,
          targetKind: r.targetKind,
          version: r.agentUpdate.version,
          targetCount: r.targetCount,
          successCount: r.successCount,
          errorCount: r.errorCount,
          pendingCount: r.pendingCount,
          awaitingApproval: r.awaitingApproval,
          change: r.change
            ? {
                id: r.change.id,
                changeNumber: r.change.changeNumber,
                status: r.change.status,
                type: r.change.type,
              }
            : null,
          triggeredBy: r.triggeredBy
            ? {
                email: r.triggeredBy.email,
                name: [r.triggeredBy.firstName, r.triggeredBy.lastName].filter(Boolean).join(' '),
              }
            : null,
        })),
        total,
        page,
        pageSize,
      });
    },
  );

  // ─── GET /api/v1/settings/agent-updates/deployments/:id ───────────────────────
  fastify.get(
    '/api/v1/settings/agent-updates/deployments/:id',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const deployment = await prisma.agentUpdateDeployment.findFirst({
        where: { id, tenantId },
        include: {
          agentUpdate: { select: { version: true, platform: true, fileSize: true } },
          triggeredBy: { select: { email: true, firstName: true, lastName: true } },
          change: { select: { id: true, changeNumber: true, status: true, type: true, title: true } },
          targets: {
            orderBy: { createdAt: 'asc' },
            include: {
              agent: {
                select: {
                  id: true,
                  hostname: true,
                  platform: true,
                  agentVersion: true,
                  status: true,
                  lastHeartbeatAt: true,
                },
              },
            },
          },
        },
      });

      if (!deployment) {
        return reply.status(404).send({ error: 'Deployment not found' });
      }

      return reply.send({
        id: deployment.id,
        createdAt: deployment.createdAt,
        platform: deployment.platform,
        targetKind: deployment.targetKind,
        version: deployment.agentUpdate.version,
        fileSize: deployment.agentUpdate.fileSize,
        targetCount: deployment.targetCount,
        successCount: deployment.successCount,
        errorCount: deployment.errorCount,
        pendingCount: deployment.pendingCount,
        awaitingApproval: deployment.awaitingApproval,
        change: deployment.change
          ? {
              id: deployment.change.id,
              changeNumber: deployment.change.changeNumber,
              status: deployment.change.status,
              type: deployment.change.type,
              title: deployment.change.title,
            }
          : null,
        triggeredBy: deployment.triggeredBy
          ? {
              email: deployment.triggeredBy.email,
              name: [deployment.triggeredBy.firstName, deployment.triggeredBy.lastName].filter(Boolean).join(' '),
            }
          : null,
        targets: deployment.targets.map((t) => ({
          id: t.id,
          agentId: t.agentId,
          hostname: t.agent.hostname,
          platform: t.agent.platform,
          agentCurrentVersion: t.agent.agentVersion,
          agentStatus: t.agent.status,
          agentLastHeartbeatAt: t.agent.lastHeartbeatAt,
          fromVersion: t.fromVersion,
          toVersion: t.toVersion,
          status: t.status,
          errorMessage: t.errorMessage,
          startedAt: t.startedAt,
          completedAt: t.completedAt,
        })),
      });
    },
  );

  // ─── GET /api/v1/settings/agents/:id/events ───────────────────────────────────
  // Paginated event log for a single agent.
  fastify.get(
    '/api/v1/settings/agents/:id/events',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };
      const q = request.query as { page?: string; pageSize?: string; level?: string };

      const agent = await prisma.agent.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      const page = Math.max(1, Number.parseInt(q.page ?? '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(q.pageSize ?? '25', 10) || 25));
      const skip = (page - 1) * pageSize;

      const where: Record<string, unknown> = { tenantId, agentId: id };
      if (q.level) {
        const normalized = q.level.toUpperCase();
        if (['INFO', 'WARN', 'ERROR'].includes(normalized)) {
          where.level = normalized;
        }
      }

      const [total, rows] = await Promise.all([
        prisma.agentEventLog.count({ where }),
        prisma.agentEventLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
      ]);

      return reply.send({ data: rows, total, page, pageSize });
    },
  );
}
