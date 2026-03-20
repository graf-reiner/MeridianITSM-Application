import type { FastifyRequest, FastifyReply } from 'fastify';
import { hasPermission } from '../lib/permissions.js';

/**
 * Returns a preHandler function that checks if the current user has the required permission.
 * Requires tenantPreHandler to have run first (sets request.currentUser).
 *
 * @param permission - The permission string to check (supports wildcards via hasPermission)
 */
export function requirePermission(permission: string) {
  return async function rbacPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { currentUser } = request;

    if (!currentUser) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Extract all permissions from user roles
    // In this implementation, roles are stored as slugs in the JWT.
    // The actual permission check uses the roles array set by tenantPreHandler.
    if (!hasPermission(currentUser.roles, permission)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Missing permission: ${permission}`,
      });
    }
  };
}

/**
 * Generic RBAC preHandler that can be added as a hook.
 * Does not enforce specific permissions — used as a placeholder for route-level RBAC.
 * Specific permission enforcement uses requirePermission(permission).
 */
export async function rbacPreHandler(
  _request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  // RBAC is enforced at the route level via requirePermission().
  // This no-op hook is here as a placeholder for future global RBAC logic.
}
