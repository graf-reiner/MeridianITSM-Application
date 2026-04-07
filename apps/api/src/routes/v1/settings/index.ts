import type { FastifyInstance } from 'fastify';
import { usersSettingsRoutes } from './users.js';
import { rolesSettingsRoutes } from './roles.js';
import { groupsSettingsRoutes } from './groups.js';
import { queuesSettingsRoutes } from './queues.js';
import { categoriesSettingsRoutes } from './categories.js';
import { sitesSettingsRoutes } from './sites.js';
import { vendorsSettingsRoutes } from './vendors.js';
import { businessUnitsSettingsRoutes } from './business-units.js';
import { contractsSettingsRoutes } from './contracts.js';
import { brandingSettingsRoutes } from './branding.js';
import { logsSettingsRoutes } from './logs.js';
import { agentSettingsRoutes } from './agents.js';
import { apiKeySettingsRoutes } from './api-keys.js';
import { alertChannelRoutes } from './alerts.js';
import { tagsSettingsRoutes } from './tags.js';
import { ssoSettingsRoutes } from './sso.js';
import { authPolicyRoutes } from './auth-policy.js';
import { federationRoutes } from './federation.js';
import { emailActivityRoutes } from './email-activity.js';
import { notificationRulesRoutes } from './notification-rules.js';
import { notificationRulesYamlRoutes } from './notification-rules-yaml.js';
import { aiSettingsRoutes } from './ai.js';
import { requiredFieldsRoutes } from './required-fields.js';

/**
 * Settings routes registrar.
 * Aggregates all settings sub-routes under a single plugin.
 * All sub-routes enforce RBAC via requirePermission().
 *
 * Covers:
 *   SETT-01: User management
 *   SETT-02: Role management
 *   SETT-03: Group management
 *   SETT-04: Queue management
 *   SETT-06: Category management
 *   SETT-07: Site management
 *   SETT-08: Vendor management
 *   SETT-09: Business unit management
 *   SETT-10: Contract management
 *   SETT-11: Branding (logo upload, colors)
 *   SETT-12: System log viewer (SSE + recent)
 *   AGNT-08: Agent management (list agents, generate/revoke tokens, delete agents)
 *   INTG-01: API key management (create, list, revoke)
 *   INTG-06: Alert channel management (email, Slack, Teams)
 */
export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(usersSettingsRoutes);
  await fastify.register(rolesSettingsRoutes);
  await fastify.register(groupsSettingsRoutes);
  await fastify.register(queuesSettingsRoutes);
  await fastify.register(categoriesSettingsRoutes);
  await fastify.register(sitesSettingsRoutes);
  await fastify.register(vendorsSettingsRoutes);
  await fastify.register(businessUnitsSettingsRoutes);
  await fastify.register(contractsSettingsRoutes);
  await fastify.register(brandingSettingsRoutes);
  await fastify.register(logsSettingsRoutes);
  await fastify.register(agentSettingsRoutes);
  await fastify.register(apiKeySettingsRoutes);
  await fastify.register(alertChannelRoutes);
  await fastify.register(tagsSettingsRoutes);
  await fastify.register(ssoSettingsRoutes);
  await fastify.register(authPolicyRoutes);
  await fastify.register(federationRoutes);
  await fastify.register(emailActivityRoutes);
  await fastify.register(notificationRulesYamlRoutes);
  await fastify.register(notificationRulesRoutes);
  await fastify.register(aiSettingsRoutes);
  await fastify.register(requiredFieldsRoutes);
}
