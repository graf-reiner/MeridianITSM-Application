// ─── Notification Rules — Core Dispatch Engine ──────────────────────────────
// Loads matching rules from Redis cache (or DB fallback), evaluates conditions,
// executes actions, and logs results. Falls back to legacy notification
// functions when no rules are defined for a trigger.

import { prisma } from '@meridian/db';
import { redis } from '../lib/redis.js';
import { evaluateConditionGroups, type EventContext, type ConditionGroup } from './notification-rules-conditions.js';
import { executeActions, type ActionConfig } from './notification-rules-actions.js';
import {
  notifyTicketCreated,
  notifyTicketAssigned,
  notifyTicketCommented,
  notifyTicketResolved,
  notifyTicketUpdated,
  notifyMajorIncidentDeclared,
} from './notification.service.js';

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Rule Loading with Redis Cache ───────────────────────────────────────────

const CACHE_TTL_SECONDS = 60;

function cacheKey(tenantId: string, trigger: string): string {
  return `rules:${tenantId}:${trigger}`;
}

/**
 * Load active rules for a tenant + trigger from Redis cache, falling back to DB.
 * Rules are sorted by priority ASC (lower number = higher priority).
 */
export async function loadRules(
  tenantId: string,
  trigger: string,
): Promise<NotificationRuleRow[]> {
  const key = cacheKey(tenantId, trigger);

  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as NotificationRuleRow[];
    }
  } catch (err) {
    console.error('[notification-rules] Redis cache read failed:', err);
  }

  // Cache miss — query the database
  const rules = await prisma.notificationRule.findMany({
    where: {
      tenantId,
      trigger,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      trigger: true,
      conditionGroups: true,
      actions: true,
      priority: true,
      stopAfterMatch: true,
      scopedQueueId: true,
    },
    orderBy: { priority: 'asc' },
  });

  // Cache the result
  try {
    await redis.set(key, JSON.stringify(rules), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    console.error('[notification-rules] Redis cache write failed:', err);
  }

  return rules as NotificationRuleRow[];
}

/**
 * Invalidate all cached rules for a tenant (all triggers).
 * Called when rules are created, updated, or deleted.
 */
export async function invalidateRulesCache(tenantId: string): Promise<void> {
  try {
    const keys = await redis.keys(`rules:${tenantId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('[notification-rules] Redis cache invalidation failed:', err);
  }
}

// ─── Legacy Notification Fallback ────────────────────────────────────────────

async function fireLegacyNotification(
  tenantId: string,
  trigger: string,
  context: EventContext,
): Promise<void> {
  switch (trigger) {
    case 'TICKET_CREATED':
      if (context.ticket && context.actorId) {
        await notifyTicketCreated(tenantId, context.ticket as any, context.actorId);
      }
      break;
    case 'TICKET_ASSIGNED':
      if (context.ticket && context.newAssignedToId && context.actorId) {
        await notifyTicketAssigned(tenantId, context.ticket as any, context.newAssignedToId, context.actorId);
      }
      break;
    case 'TICKET_COMMENTED':
      if (context.ticket && context.comment && context.actorId) {
        await notifyTicketCommented(tenantId, context.ticket as any, context.comment as any, context.actorId);
      }
      break;
    case 'TICKET_RESOLVED':
      if (context.ticket && context.actorId) {
        await notifyTicketResolved(tenantId, context.ticket as any, context.actorId);
      }
      break;
    case 'TICKET_UPDATED':
      if (context.ticket && context.changedFields && context.actorId) {
        await notifyTicketUpdated(tenantId, context.ticket as any, context.changedFields, context.actorId);
      }
      break;
    case 'MAJOR_INCIDENT_DECLARED':
      if (context.ticket && context.coordinatorId && context.actorId) {
        await notifyMajorIncidentDeclared(tenantId, context.ticket as any, context.coordinatorId, context.actorId);
      }
      break;
    default:
      // No legacy behavior for other triggers
      break;
  }
}

// ─── Main Dispatch Function ──────────────────────────────────────────────────

/**
 * Fire-and-forget notification dispatch. Loads matching rules, evaluates
 * conditions, executes actions, and logs results. Falls back to legacy
 * notification functions when no rules exist for the trigger.
 *
 * NEVER throws — all errors are caught and logged.
 */
export async function dispatchNotificationEvent(
  tenantId: string,
  trigger: string,
  eventContext: EventContext,
): Promise<void> {
  // Dispatch matching workflows (new workflow engine — coexists with legacy rules)
  try {
    const { dispatchWorkflows } = await import('./workflow-engine/index.js');
    await dispatchWorkflows(tenantId, trigger, eventContext);
  } catch (err) {
    console.error('[notification-rules] Workflow dispatch failed (non-fatal):', err);
  }

  try {
    const rules = await loadRules(tenantId, trigger);

    // No rules defined → fall back to legacy notification behavior
    if (rules.length === 0) {
      await fireLegacyNotification(tenantId, trigger, eventContext);
      return;
    }

    // Evaluate each rule in priority order
    for (const rule of rules) {
      try {
        // Scope check: if rule is scoped to a queue, skip if ticket is in a different queue
        if (rule.scopedQueueId && eventContext.ticket?.queueId !== rule.scopedQueueId) {
          continue;
        }

        const conditionGroups = rule.conditionGroups as ConditionGroup[] | undefined;
        const matched = evaluateConditionGroups(conditionGroups, eventContext);

        if (matched) {
          const actions = rule.actions as ActionConfig[];
          const results = await executeActions(actions, eventContext, tenantId);

          // Log the rule execution
          try {
            await prisma.notificationRuleLog.create({
              data: {
                tenantId,
                ruleId: rule.id,
                trigger,
                matched: true,
                eventPayload: eventContext as any,
                actionsFired: results as any,
              },
            });
          } catch (logErr) {
            console.error('[notification-rules] Failed to log rule execution:', logErr);
          }

          // If stopAfterMatch is set, do not evaluate further rules
          if (rule.stopAfterMatch) {
            break;
          }
        }
      } catch (ruleErr) {
        console.error('[notification-rules] Rule evaluation failed:', rule.id, ruleErr);

        // Log the error
        try {
          await prisma.notificationRuleLog.create({
            data: {
              tenantId,
              ruleId: rule.id,
              trigger,
              matched: false,
              error: ruleErr instanceof Error ? ruleErr.message : String(ruleErr),
            },
          });
        } catch (logErr) {
          console.error('[notification-rules] Failed to log rule error:', logErr);
        }
      }
    }
  } catch (err) {
    console.error('[notification-rules] dispatchNotificationEvent failed:', err);
    // Last resort: try legacy notification so user still gets notified
    try {
      await fireLegacyNotification(tenantId, trigger, eventContext);
    } catch (legacyErr) {
      console.error('[notification-rules] Legacy fallback also failed:', legacyErr);
    }
  }
}
