import type { FastifyRequest, FastifyReply } from 'fastify';

const COOKIE_NAME = 'meridian_session';

/**
 * JWT authentication preHandler.
 * Checks Authorization header first, then falls back to meridian_session cookie.
 * On success, request.user is populated by @fastify/jwt.
 * On failure, replies 401 Unauthorized.
 */
export async function authPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // Try standard Authorization: Bearer header first
    await request.jwtVerify();
  } catch {
    // Fall back to cookie-based auth (browser sessions via Next.js proxy)
    try {
      const cookieHeader = request.headers.cookie;
      if (!cookieHeader) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
      if (!match) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const token = decodeURIComponent(match[1]);
      // Manually verify and populate request.user
      const decoded = request.server.jwt.verify(token);
      request.user = decoded as any;
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  }
}
