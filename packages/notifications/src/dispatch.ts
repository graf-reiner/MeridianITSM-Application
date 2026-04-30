import { prisma } from '@meridian/db';
import { redis } from './redis.js';
import { evaluateConditionGroups, type ConditionGroup, type EventContext } from './conditions.js';
import { executeActions, type ActionConfig } from './actions.js';
import type { NotificationTrigger } from './types.js';

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
 * NEVER throws — all errors are caught and logged.
 *
 * NOTE: This shared dispatcher only fires NotificationRule actions. The
 * workflow engine still lives in apps/api/src/services/workflow-engine and
 * is fired by callers BEFORE delegating here. A future task (Phase 1.5)
 * will move workflow dispatch into this package so worker-originated events
 * also fire user-built workflows.
 */
export async function dispatchNotificationEvent(
  tenantId: string,
  trigger: NotificationTrigger | string,
  eventContext: EventContext,
  options?: DispatchOptions,
): Promise<void> {
  eventContext.trigger = trigger as string;

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
