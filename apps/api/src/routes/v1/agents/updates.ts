import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@meridian/db';
import { getFileObject } from '../../../services/storage.service.js';

/**
 * Resolve agent from Authorization: AgentKey <key> header.
 * Returns the agent record or sends 401 and returns null.
 */
async function resolveAgentForDownload(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers['authorization'];
  const headerStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;

  if (!headerStr?.startsWith('AgentKey ')) {
    await reply.code(401).send({ error: 'AgentKey required' });
    return null;
  }

  const agentKey = headerStr.slice(9).trim();
  if (!agentKey) {
    await reply.code(401).send({ error: 'AgentKey required' });
    return null;
  }

  const agent = await prisma.agent.findFirst({
    where: { agentKey },
  });

  if (!agent || agent.status === ('DEREGISTERED' as never)) {
    await reply.code(401).send({ error: 'Invalid or inactive agent key' });
    return null;
  }

  return agent;
}

/**
 * Resolve admin session from JWT (request.user populated by authPreHandler).
 * For agent update routes that are registered outside the protected scope,
 * we manually verify the JWT token.
 */
async function resolveAdminSession(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    // Fall back to cookie-based auth
    try {
      const cookieHeader = request.headers.cookie;
      if (!cookieHeader) {
        await reply.code(401).send({ error: 'Unauthorized' });
        return null;
      }

      const match = cookieHeader.match(/(?:^|;\s*)meridian_session=([^;]*)/);
      if (!match) {
        await reply.code(401).send({ error: 'Unauthorized' });
        return null;
      }

      const token = decodeURIComponent(match[1]);
      const decoded = request.server.jwt.verify(token);
      request.user = decoded as any;
    } catch {
      await reply.code(401).send({ error: 'Unauthorized' });
      return null;
    }
  }

  const user = request.user as {
    userId?: string;
    role?: string;
    systemRole?: string;
    roles?: string[];
  } | undefined;
  if (!user?.userId) {
    await reply.code(401).send({ error: 'Unauthorized' });
    return null;
  }

  // JWT payload shape: { roles: string[] } (case-preserved names like "Admin",
  // "MSP Admin"). Also tolerate older single-role fields.
  const roleNames = [
    ...(user.roles ?? []),
    user.role ?? '',
    user.systemRole ?? '',
  ].map((r) => r.toLowerCase());
  const isAdmin = roleNames.some((r) =>
    ['admin', 'msp admin', 'msp_admin'].includes(r),
  );
  if (!isAdmin) {
    await reply.code(403).send({ error: 'Admin access required' });
    return null;
  }

  return user as { userId: string; role?: string; roles?: string[] };
}

/**
 * Agent Update Package Routes
 *
 * Uploading is owner-admin only (see apps/owner/src/app/api/agent-updates/route.ts).
 * Tenant admins can list/deploy/download, and agents can fetch the latest per-platform.
 *
 * GET  /api/v1/agents/updates/:platform — Download latest update for platform (agent key auth)
 * POST /api/v1/agents/updates/deploy    — Force-deploy update to agents (admin auth)
 * GET  /api/v1/agents/updates           — List update packages, optional ?platform filter (admin auth)
 * GET  /api/v1/agents/updates/:id/download — Admin redirect to signed URL for a package
 */
export default async function agentUpdateRoutes(app: FastifyInstance): Promise<void> {
  // ─── GET /api/v1/agents/updates/:platform ───────────────────────────────────
  // Agent key auth. Redirects to download URL for latest update.
  app.get('/api/v1/agents/updates/:platform', async (request, reply) => {
    const agent = await resolveAgentForDownload(request, reply);
    if (!agent) return;

    const { platform } = request.params as { platform: string };

    // Validate platform
    const validPlatforms = ['WINDOWS', 'LINUX', 'MACOS'];
    const normalizedPlatform = platform.toUpperCase();
    if (!validPlatforms.includes(normalizedPlatform)) {
      return reply.code(400).send({
        error: `Invalid platform. Expected one of: ${validPlatforms.join(', ')}`,
      });
    }

    const latest = await prisma.agentUpdate.findFirst({
      where: { platform: normalizedPlatform as any },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest?.storageKey) {
      return reply.code(404).send({ error: 'No update available for this platform' });
    }

    // Stream the object through this server — MinIO is not publicly routable.
    const { body, contentLength, contentType } = await getFileObject(latest.storageKey);
    const filename = latest.storageKey.split('/').pop() ?? `agent-${latest.version}.bin`;
    reply.header('Content-Type', contentType ?? 'application/octet-stream');
    if (contentLength) reply.header('Content-Length', contentLength);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Cache-Control', 'no-store');
    return reply.send(body);
  });

  // ─── POST /api/v1/agents/updates/deploy ─────────────────────────────────────
  // Admin auth. Sets forceUpdateUrl on specified agents.
  app.post('/api/v1/agents/updates/deploy', async (request, reply) => {
    const admin = await resolveAdminSession(request, reply);
    if (!admin) return;

    const body = request.body as {
      agentIds?: string[] | 'all';
      version?: string;
      platform?: string;
    };

    const { agentIds, version, platform } = body;

    if (!version || !platform) {
      return reply.code(400).send({ error: 'version and platform are required' });
    }

    const normalizedPlatform = platform.toUpperCase();
    const validPlatforms = ['WINDOWS', 'LINUX', 'MACOS'];
    if (!validPlatforms.includes(normalizedPlatform)) {
      return reply.code(400).send({
        error: `Invalid platform. Expected one of: ${validPlatforms.join(', ')}`,
      });
    }

    // Look up the AgentUpdate record
    const agentUpdate = await prisma.agentUpdate.findUnique({
      where: {
        version_platform: { version, platform: normalizedPlatform as any },
      },
    });

    if (!agentUpdate) {
      return reply.code(404).send({ error: 'Agent update not found for this version/platform' });
    }

    // Relative path — the agent's authenticated MeridianApiClient will fetch
    // this against its configured ServerUrl, using AgentKey auth. We can't
    // hand out a direct MinIO URL because MinIO isn't publicly routable.
    const forceUpdateUrl = `api/v1/agents/updates/${normalizedPlatform.toLowerCase()}`;

    // Build the where clause for agents to update. Only deploy to agents in
    // deployable states — ACTIVE (live) and OFFLINE (will pick up on next
    // heartbeat). Skip ENROLLING (not ready) and SUSPENDED (admin-paused).
    const whereClause: Record<string, unknown> = {
      platform: normalizedPlatform,
      status: { in: ['ACTIVE', 'OFFLINE'] },
    };

    if (agentIds && agentIds !== 'all') {
      whereClause.id = { in: agentIds };
    }

    // Resolve tenant from the first agent matching the where clause. Admin JWT
    // gives us admin.userId but not tenantId, so we grab it from the targets.
    // (resolveAdminSession already rejects non-admins.)
    const targetAgents = await prisma.agent.findMany({
      where: whereClause as any,
      select: { id: true, tenantId: true, agentVersion: true },
    });

    if (targetAgents.length === 0) {
      return reply.code(200).send({ deployed: 0, deploymentId: null });
    }

    const tenantId = targetAgents[0].tenantId;
    const targetKind: 'ALL' | 'SINGLE' | 'SELECTION' =
      agentIds === 'all' || !agentIds
        ? 'ALL'
        : Array.isArray(agentIds) && agentIds.length === 1
          ? 'SINGLE'
          : 'SELECTION';
    const now = new Date();

    const { deployment, updatedCount } = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.agent.updateMany({
        where: { id: { in: targetAgents.map((a) => a.id) } },
        data: { forceUpdateUrl, updateStartedAt: now, updateInProgress: true },
      });

      const deploymentRow = await tx.agentUpdateDeployment.create({
        data: {
          tenantId,
          agentUpdateId: agentUpdate.id,
          triggeredById: admin.userId,
          targetKind,
          platform: normalizedPlatform as 'WINDOWS' | 'LINUX' | 'MACOS',
          targetCount: targetAgents.length,
          pendingCount: targetAgents.length,
          successCount: 0,
          errorCount: 0,
        },
      });

      await tx.agentUpdateDeploymentTarget.createMany({
        data: targetAgents.map((a) => ({
          tenantId,
          deploymentId: deploymentRow.id,
          agentId: a.id,
          fromVersion: a.agentVersion ?? null,
          toVersion: agentUpdate.version,
          status: 'PENDING',
        })),
      });

      return { deployment: deploymentRow, updatedCount: updateResult.count };
    });

    return reply.code(200).send({ deployed: updatedCount, deploymentId: deployment.id });
  });

  // ─── GET /api/v1/agents/updates ─────────────────────────────────────────────
  // Admin auth. Lists uploaded update packages (newest first). Optional ?platform=WINDOWS|LINUX|MACOS.
  app.get('/api/v1/agents/updates', async (request, reply) => {
    const admin = await resolveAdminSession(request, reply);
    if (!admin) return;

    const { platform } = request.query as { platform?: string };
    const where: { platform?: 'WINDOWS' | 'LINUX' | 'MACOS' } = {};
    if (platform) {
      const normalized = platform.toUpperCase();
      const validPlatforms = ['WINDOWS', 'LINUX', 'MACOS'];
      if (!validPlatforms.includes(normalized)) {
        return reply.code(400).send({
          error: `Invalid platform. Expected one of: ${validPlatforms.join(', ')}`,
        });
      }
      where.platform = normalized as 'WINDOWS' | 'LINUX' | 'MACOS';
    }

    const updates = await prisma.agentUpdate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return reply.code(200).send(updates);
  });

  // ─── GET /api/v1/agents/updates/:id/download ────────────────────────────────
  // Admin auth. Redirects to a fresh signed URL for the given update package.
  // Used by the admin UI "Download" links next to the Upload form.
  app.get('/api/v1/agents/updates/:id/download', async (request, reply) => {
    const admin = await resolveAdminSession(request, reply);
    if (!admin) return;

    const { id } = request.params as { id: string };

    const update = await prisma.agentUpdate.findUnique({
      where: { id },
    });

    if (!update?.storageKey) {
      return reply.code(404).send({ error: 'Update package not found' });
    }

    const { body, contentLength, contentType } = await getFileObject(update.storageKey);
    const filename = update.storageKey.split('/').pop() ?? `agent-${update.version}.bin`;
    reply.header('Content-Type', contentType ?? 'application/octet-stream');
    if (contentLength) reply.header('Content-Length', contentLength);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Cache-Control', 'no-store');
    return reply.send(body);
  });
}
