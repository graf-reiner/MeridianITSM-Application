import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import multipart from '@fastify/multipart';
import { prisma } from '@meridian/db';
import { uploadFile, getFileSignedUrl } from '../../../services/storage.service.js';

const MAX_PACKAGE_SIZE = 200 * 1024 * 1024; // 200 MB

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
 * POST /api/v1/agents/updates/upload    — Upload agent update package (admin auth)
 * GET  /api/v1/agents/updates/:platform — Download latest update for platform (agent key auth)
 * POST /api/v1/agents/updates/deploy    — Force-deploy update to agents (admin auth)
 * GET  /api/v1/agents/updates           — List all update packages (admin auth)
 */
export default async function agentUpdateRoutes(app: FastifyInstance): Promise<void> {
  // Register multipart in this scoped plugin ONLY — avoids breaking JSON routes globally
  await app.register(multipart, {
    limits: {
      fileSize: MAX_PACKAGE_SIZE,
    },
  });

  // ─── POST /api/v1/agents/updates/upload ─────────────────────────────────────
  // Admin auth. Accepts multipart upload of agent package.
  app.post('/api/v1/agents/updates/upload', async (request, reply) => {
    const admin = await resolveAdminSession(request, reply);
    if (!admin) return;

    let fileData: Buffer | null = null;
    let version = '';
    let platform = '';
    let releaseNotes = '';
    let originalFilename = 'agent-package';
    let contentType = 'application/octet-stream';

    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      // Extract form fields from the multipart data
      version = (data.fields.version as any)?.value ?? '';
      platform = (data.fields.platform as any)?.value ?? '';
      releaseNotes = (data.fields.releaseNotes as any)?.value ?? '';

      if (!version || !platform) {
        return reply.code(400).send({ error: 'version and platform are required fields' });
      }

      // Validate platform
      const validPlatforms = ['WINDOWS', 'LINUX', 'MACOS'];
      platform = platform.toUpperCase();
      if (!validPlatforms.includes(platform)) {
        return reply.code(400).send({
          error: `Invalid platform. Expected one of: ${validPlatforms.join(', ')}`,
        });
      }

      originalFilename = data.filename ?? 'agent-package';
      contentType = data.mimetype ?? 'application/octet-stream';

      // Read file data into buffer
      const chunks: Buffer[] = [];
      let totalSize = 0;

      for await (const chunk of data.file) {
        totalSize += chunk.length;
        if (totalSize > MAX_PACKAGE_SIZE) {
          return reply.code(413).send({ error: `File too large. Maximum size is ${MAX_PACKAGE_SIZE / 1024 / 1024}MB.` });
        }
        chunks.push(chunk);
      }

      fileData = Buffer.concat(chunks);
    } catch {
      return reply.code(400).send({ error: 'Failed to process file upload' });
    }

    if (!fileData || fileData.length === 0) {
      return reply.code(400).send({ error: 'No file data received' });
    }

    // Compute SHA-256 checksum
    const checksum = createHash('sha256').update(fileData).digest('hex');

    // Determine file extension from original filename
    const ext = originalFilename.includes('.')
      ? originalFilename.split('.').pop()
      : 'bin';

    // Store in MinIO under agent-updates path
    const storageKey = `agent-updates/${platform.toLowerCase()}/${version}/agent-${platform.toLowerCase()}-${version}.${ext}`;
    await uploadFile(fileData, storageKey, contentType);

    // Generate a signed download URL
    const downloadUrl = await getFileSignedUrl(storageKey, 86400); // 24 hours

    // Upsert the AgentUpdate record
    const record = await prisma.agentUpdate.upsert({
      where: {
        version_platform: { version, platform: platform as any },
      },
      create: {
        version,
        platform: platform as any,
        downloadUrl,
        checksum,
        fileSize: fileData.length,
        releaseNotes: releaseNotes || null,
        storageKey,
        uploadedBy: admin.userId,
      },
      update: {
        downloadUrl,
        checksum,
        fileSize: fileData.length,
        releaseNotes: releaseNotes || null,
        storageKey,
        uploadedBy: admin.userId,
      },
    });

    return reply.code(200).send({
      id: record.id,
      version: record.version,
      platform: record.platform,
      checksum: record.checksum,
      fileSize: record.fileSize,
    });
  });

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
      return reply.redirect(302, signedUrl);
    }

    // Otherwise redirect to the stored download URL
    return reply.redirect(302, latest.downloadUrl);
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
  // Admin auth. Lists all uploaded update packages (newest first).
  app.get('/api/v1/agents/updates', async (request, reply) => {
    const admin = await resolveAdminSession(request, reply);
    if (!admin) return;

    const updates = await prisma.agentUpdate.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return reply.code(200).send(updates);
  });
}
