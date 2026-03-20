import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * JWT authentication preHandler.
 * Verifies the JWT from the Authorization header.
 * On success, request.user is populated by @fastify/jwt.
 * On failure, replies 401 Unauthorized.
 */
export async function authPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}
