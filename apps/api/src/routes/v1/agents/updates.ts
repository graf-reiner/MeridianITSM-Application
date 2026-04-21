import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@meridian/db';
import { getFileSignedUrl } from '../../../services/storage.service.js';

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

  const user = request.user as { userId?: string; role?: string; systemRole?: string } | undefined;
  if (!user?.userId) {
    await reply.code(401).send({ error: 'Unauthorized' });
    return null;
  }

  const role = user.systemRole ?? user.role;
  if (role !== 'admin' && role !== 'msp_admin') {
    await reply.code(403).send({ error: 'Admin access required' });
    return null;
  }

  return user as { userId: string; role: string };
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

    if (!latest) {
      return reply.code(404).send({ error: 'No update available for this platform' });
    }

    // If we have a storage key, generate a fresh signed URL and redirect
    if (latest.storageKey) {
      const signedUrl = await getFileSignedUrl(latest.storageKey, 3600);
      return reply.redirect(signedUrl, 302);
    }

    // Otherwise redirect to the stored download URL
    return reply.redirect(latest.downloadUrl, 302);
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

    // Build the download URL — prefer signed URL from storage, fall back to downloadUrl
    let forceUpdateUrl: string;
    if (agentUpdate.storageKey) {
      forceUpdateUrl = await getFileSignedUrl(agentUpdate.storageKey, 86400); // 24 hours
    } else {
      forceUpdateUrl = agentUpdate.downloadUrl;
    }

    // Build the where clause for agents to update
    const whereClause: Record<string, unknown> = {
      platform: normalizedPlatform,
      status: { not: 'DEREGISTERED' },
    };

    if (agentIds && agentIds !== 'all') {
      whereClause.id = { in: agentIds };
    }

    const result = await prisma.agent.updateMany({
      where: whereClause as any,
      data: {
        forceUpdateUrl,
      },
    });

    return reply.code(200).send({ deployed: result.count });
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

    if (!update) {
      return reply.code(404).send({ error: 'Update package not found' });
    }

    if (update.storageKey) {
      const signedUrl = await getFileSignedUrl(update.storageKey, 3600);
      return reply.redirect(signedUrl, 302);
    }

    return reply.redirect(update.downloadUrl, 302);
  });
}
