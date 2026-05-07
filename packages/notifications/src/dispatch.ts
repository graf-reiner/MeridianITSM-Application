import { prisma } from '@meridian/db';
import { resolveTenantBaseUrl } from '@meridian/core';
import { redis } from './redis.js';
import { evaluateConditionGroups, type ConditionGroup, type EventContext } from './conditions.js';
import { executeActions, type ActionConfig } from './actions.js';
import type { NotificationTrigger } from './types.js';
import { dispatchWorkflows } from './workflows/dispatch.js';

// Cache tenant identity (name/subdomain/customDomain/cf-apex) per process.
// These rarely change and the dispatcher is hot — avoid a DB hit every event.
const TENANT_CACHE_TTL_MS = 5 * 60 * 1000;
const tenantIdentityCache = new Map<string, { value: { name: string; subdomain: string | null; customDomain: string | null; baseUrl: string }; expiresAt: number }>();

async function loadTenantIdentity(tenantId: string): Promise<{
  name: string;
  subdomain: string | null;
  customDomain: string | null;
  baseUrl: string;
} | null> {
  const cached = tenantIdentityCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        subdomain: true,
        customDomain: true,
        cloudflareDomain: { select: { apex: true } },
      },
    });
    if (!tenant) return null;
    const value = {
      name: tenant.name,
      subdomain: tenant.subdomain,
      customDomain: tenant.customDomain,
      baseUrl: resolveTenantBaseUrl({
        subdomain: tenant.subdomain,
        customDomain: tenant.customDomain,
        cloudflareDomain: tenant.cloudflareDomain,
      }),
    };
    tenantIdentityCache.set(tenantId, { value, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
    return value;
  } catch (err) {
    console.error('[notifications] tenant identity load failed:', err);
    return null;
  }
}

/** Test-only escape hatch — drops the in-memory tenant identity cache. */
export function _resetTenantIdentityCacheForTests(): void {
  tenantIdentityCache.clear();
}

const CACHE_TTL_SECONDS = 60;

interface NotificationRuleRow {
  id: string;
  name: string;
  trigger: string;
  conditionGroups: unknown;
  actions: unknown;
  priority: number;
  stopAfterMatch: boolean;
  scopedQueueId: string | null;
}

function cacheKey(tenantId: string, trigger: string): string {
  return `rules:${tenantId}:${trigger}`;
}

export async function loadRules(
  tenantId: string,
  trigger: string,
): Promise<NotificationRuleRow[]> {
  const key = cacheKey(tenantId, trigger);
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as NotificationRuleRow[];
  } catch (err) {
    console.error('[notifications] redis cache read failed:', err);
  }
  const rules = await prisma.notificationRule.findMany({
    where: { tenantId, trigger, isActive: true },
    select: {
      id: true, name: true, trigger: true, conditionGroups: true, actions: true,
      priority: true, stopAfterMatch: true, scopedQueueId: true,
    },
    orderBy: { priority: 'asc' },
  });
  try {
    await redis.set(key, JSON.stringify(rules), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    console.error('[notifications] redis cache write failed:', err);
  }
  return rules as NotificationRuleRow[];
}

export async function invalidateRulesCache(tenantId: string): Promise<void> {
  try {
    const keys = await redis.keys(`rules:${tenantId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('[notifications] redis cache invalidation failed:', err);
  }
}

export interface DispatchOptions {
  /**
   * Optional legacy-fallback hook. Called in two cases:
   *   1. When no notification rules are defined for the trigger.
   *   2. When rule loading or evaluation throws (DB outage / unexpected
   *      error path) — last-resort so the user still gets notified.
   *
   * apps/api passes its existing per-trigger notify*() functions here;
   * apps/worker passes undefined.
   */
  legacyFallback?: (tenantId: string, trigger: string, ctx: EventContext) => Promise<void>;
}

/**
 * Evaluate notification rules for an event and execute matching actions.
 * Also fires user-built workflows for the trigger.
 * NEVER throws — all errors are caught and logged.
 */
export async function dispatchNotificationEvent(
  tenantId: string,
  trigger: NotificationTrigger | string,
  eventContext: EventContext,
  options?: DispatchOptions,
): Promise<void> {
  eventContext.trigger = trigger as string;

  // Enrich the context with tenant identity + a pre-resolved base URL so
  // every downstream renderer can produce ticket dashboard/portal links
  // honoring the tenant's vanity FQDN. Per-callsite EventContexts no longer
  // need to know any of this.
  const identity = await loadTenantIdentity(tenantId);
  if (identity) {
    if (eventContext.tenantName === undefined) eventContext.tenantName = identity.name;
    if (eventContext.tenantSubdomain === undefined) eventContext.tenantSubdomain = identity.subdomain;
    if (eventContext.tenantCustomDomain === undefined) eventContext.tenantCustomDomain = identity.customDomain;
    if (eventContext.tenantBaseUrl === undefined) eventContext.tenantBaseUrl = identity.baseUrl;
  }

  // Fire workflows alongside notification rules. Independent path: workflows
  // run regardless of whether any rules exist or match. dispatchWorkflows
  // never throws, but wrap defensively anyway.
  try { await dispatchWorkflows(tenantId, trigger as string, eventContext); }
  catch (err) { console.error('[notifications] workflow dispatch failed:', err); }

  try {
    const rules = await loadRules(tenantId, trigger as string);

    if (rules.length === 0) {
      if (options?.legacyFallback) {
        await options.legacyFallback(tenantId, trigger as string, eventContext);
      }
      return;
    }

    for (const rule of rules) {
      try {
        if (rule.scopedQueueId && eventContext.ticket?.queueId !== rule.scopedQueueId) continue;
        const matched = evaluateConditionGroups(rule.conditionGroups as ConditionGroup[] | undefined, eventContext);
        if (!matched) continue;

        const actions = rule.actions as ActionConfig[];
        const results = await executeActions(actions, eventContext, tenantId);

        try {
          await prisma.notificationRuleLog.create({
            data: {
              tenantId, ruleId: rule.id, trigger: trigger as string,
              matched: true,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              eventPayload: eventContext as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              actionsFired: results as any,
            },
          });
        } catch (logErr) {
          console.error('[notifications] failed to log rule execution:', logErr);
        }

        if (rule.stopAfterMatch) break;
      } catch (ruleErr) {
        console.error('[notifications] rule evaluation failed:', rule.id, ruleErr);
        try {
          await prisma.notificationRuleLog.create({
            data: {
              tenantId, ruleId: rule.id, trigger: trigger as string, matched: false,
              error: ruleErr instanceof Error ? ruleErr.message : String(ruleErr),
            },
          });
        } catch (logErr) {
          console.error('[notifications] failed to log rule error:', logErr);
        }
      }
    }
  } catch (err) {
    console.error('[notifications] dispatchNotificationEvent failed:', err);
    if (options?.legacyFallback) {
      try { await options.legacyFallback(tenantId, trigger as string, eventContext); }
      catch (legacyErr) { console.error('[notifications] legacy fallback also failed:', legacyErr); }
    }
  }
}
