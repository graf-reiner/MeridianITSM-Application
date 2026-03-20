import type { FastifyInstance } from 'fastify';
import { usersSettingsRoutes } from './users.js';
import { rolesSettingsRoutes } from './roles.js';
import { groupsSettingsRoutes } from './groups.js';
import { queuesSettingsRoutes } from './queues.js';
import { categoriesSettingsRoutes } from './categories.js';

/**
 * Settings routes registrar.
 * Aggregates all settings sub-routes under a single plugin.
 * All sub-routes enforce RBAC via requirePermission().
 */
export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(usersSettingsRoutes);
  await fastify.register(rolesSettingsRoutes);
  await fastify.register(groupsSettingsRoutes);
  await fastify.register(queuesSettingsRoutes);
  await fastify.register(categoriesSettingsRoutes);
}
