/**
 * Plan configuration constants and types.
 * Used by planGate middleware and usePlan() frontend hook.
 */

/** All resources that can be gated by plan enforcement */
export type PlanResource =
  | 'users'
  | 'agents'
  | 'sites'
  | 'tickets'
  | 'cmdb'
  | 'mobile'
  | 'webhooks'
  | 'api_access'
  | 'scheduled_reports';

/** Shape of the limitsJson field on SubscriptionPlan */
export type PlanLimits = {
  maxUsers: number;
  maxAgents: number;
  maxSites: number;
  features: string[];
};

/** Resources that are checked against a numeric limit (maxUsers, maxAgents, maxSites) */
export const NUMERIC_RESOURCES = ['users', 'agents', 'sites'] as const;
export type NumericResource = (typeof NUMERIC_RESOURCES)[number];

/** Resources that are feature flags — present/absent in the features[] array */
export const FEATURE_RESOURCES = [
  'cmdb',
  'mobile',
  'webhooks',
  'api_access',
  'scheduled_reports',
] as const;
export type FeatureResource = (typeof FEATURE_RESOURCES)[number];

/**
 * Returns true if the given resource is a feature flag (checked against features[]).
 * Returns false for numeric resources (users, agents, sites).
 */
export function isFeatureResource(r: PlanResource): boolean {
  return (FEATURE_RESOURCES as readonly string[]).includes(r);
}

/**
 * Maps a numeric resource name to its corresponding key in PlanLimits.
 * 'users' -> 'maxUsers', 'agents' -> 'maxAgents', 'sites' -> 'maxSites'
 * Returns null for resources with no numeric limit (e.g. 'tickets' — unlimited by design).
 */
export function getLimitKey(resource: PlanResource): keyof PlanLimits | null {
  switch (resource) {
    case 'users':
      return 'maxUsers';
    case 'agents':
      return 'maxAgents';
    case 'sites':
      return 'maxSites';
    default:
      return null;
  }
}
