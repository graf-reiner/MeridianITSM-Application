export const PERMISSIONS = {
  // Tickets
  TICKETS_READ: 'tickets.read',
  TICKETS_READ_OWN: 'tickets.read.own',
  TICKETS_CREATE: 'tickets.create',
  TICKETS_UPDATE: 'tickets.update',
  TICKETS_DELETE: 'tickets.delete',
  TICKETS_ALL: 'tickets.*',

  // Users
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  USERS_ALL: 'users.*',

  // Roles
  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',
  ROLES_ALL: 'roles.*',

  // Settings
  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',
  SETTINGS_ALL: 'settings.*',

  // Knowledge
  KNOWLEDGE_READ: 'knowledge.read',
  KNOWLEDGE_CREATE: 'knowledge.create',
  KNOWLEDGE_UPDATE: 'knowledge.update',
  KNOWLEDGE_DELETE: 'knowledge.delete',
  KNOWLEDGE_ALL: 'knowledge.*',

  // Assets
  ASSETS_READ: 'assets.read',
  ASSETS_CREATE: 'assets.create',
  ASSETS_UPDATE: 'assets.update',
  ASSETS_DELETE: 'assets.delete',
  ASSETS_ALL: 'assets.*',

  // CMDB
  CMDB_VIEW: 'cmdb.view',
  CMDB_EDIT: 'cmdb.edit',
  CMDB_DELETE: 'cmdb.delete',
  CMDB_IMPORT: 'cmdb.import',
  CMDB_ALL: 'cmdb.*',

  // Changes
  CHANGES_READ: 'changes.read',
  CHANGES_CREATE: 'changes.create',
  CHANGES_UPDATE: 'changes.update',
  CHANGES_APPROVE: 'changes.approve',
  CHANGES_ALL: 'changes.*',

  // Reports
  REPORTS_READ: 'reports.read',
  REPORTS_CREATE: 'reports.create',
  REPORTS_ALL: 'reports.*',

  // API Keys
  API_KEYS_READ: 'api_keys.read',
  API_KEYS_CREATE: 'api_keys.create',
  API_KEYS_DELETE: 'api_keys.delete',
  API_KEYS_ALL: 'api_keys.*',

  // Agents
  AGENTS_READ: 'agents.read',
  AGENTS_MANAGE: 'agents.manage',
  AGENTS_ALL: 'agents.*',

  // Billing
  BILLING_READ: 'billing.read',
  BILLING_MANAGE: 'billing.manage',
  BILLING_ALL: 'billing.*',

  // Wildcard — grants all permissions
  ALL: '*',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Check if userPermissions satisfies a required permission.
 * Supports wildcard permissions: '*' grants everything, 'tickets.*' grants all ticket permissions.
 *
 * @param userPermissions - Array of permission strings assigned to the user
 * @param required - The specific permission being checked
 * @returns true if user has the required permission (directly or via wildcard)
 */
export function hasPermission(userPermissions: string[], required: string): boolean {
  // Normalize colon-separated permissions to dot-separated (settings:write -> settings.write)
  const normalizedRequired = required.replace(/:/g, '.');

  for (const perm of userPermissions) {
    const normalizedPerm = perm.replace(/:/g, '.');

    // Exact match
    if (normalizedPerm === normalizedRequired) return true;

    // Global wildcard
    if (normalizedPerm === '*') return true;

    // Namespace wildcard: e.g., 'settings.*' matches 'settings.write' and 'settings.update'
    if (normalizedPerm.endsWith('.*')) {
      const namespace = normalizedPerm.slice(0, -2); // Remove '.*'
      if (normalizedRequired.startsWith(namespace + '.')) return true;
    }
  }

  return false;
}
