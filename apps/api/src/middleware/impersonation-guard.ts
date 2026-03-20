import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Fastify preHandler that blocks all mutating HTTP methods (POST, PUT, PATCH, DELETE)
 * when the request is part of a read-only impersonation session.
 *
 * An impersonation session is identified by:
 * - request.user.readOnly === true
 * - request.user.impersonatedBy being set (non-empty string)
 *
 * GET requests are always allowed through regardless of impersonation status.
 * Must be registered AFTER authPreHandler so request.user is populated.
 */
export async function blockImpersonationWrites(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const method = request.method.toUpperCase();

  // Only block mutating methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return;
  }

  const user = request.user as { readOnly?: boolean; impersonatedBy?: string } | undefined;

  if (user?.readOnly === true || (user?.impersonatedBy && user.impersonatedBy.length > 0)) {
    return reply.code(403).send({
      error: 'READ_ONLY_SESSION',
      message: 'Impersonation sessions are read-only. Exit impersonation to make changes.',
    });
  }
}
