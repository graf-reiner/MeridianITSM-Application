import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import { prisma } from '@meridian/db';

/**
 * API key authentication preHandler.
 * Checks the Authorization: ApiKey <key> header.
 * Hashes the key with SHA-256 and looks it up in the ApiKey table.
 * On success, sets request.tenantId and request.apiKey.
 * On failure, replies 401.
 */
export async function apiKeyPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers['authorization'];

  if (!header?.startsWith('ApiKey ')) {
    return reply.code(401).send({ error: 'API key required' });
  }

  const rawKey = header.slice(7).trim();

  if (!rawKey) {
    return reply.code(401).send({ error: 'API key required' });
  }

  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const now = new Date();

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    },
    include: {
      tenant: true,
    },
  });

  if (!apiKey) {
    return reply.code(401).send({ error: 'Invalid or revoked API key' });
  }

  if (apiKey.tenant.status !== 'ACTIVE') {
    return reply.code(401).send({ error: 'Tenant is not active' });
  }

  const scopes = Array.isArray(apiKey.scopes)
    ? (apiKey.scopes as string[])
    : [];

  request.tenantId = apiKey.tenantId;
  request.apiKey = {
    id: apiKey.id,
    scopes,
    tenantId: apiKey.tenantId,
  };

  // Update lastUsedAt asynchronously (don't await — don't block the request)
  prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: now },
    })
    .catch((err: unknown) => {
      console.error('Failed to update apiKey lastUsedAt:', err);
    });
}
