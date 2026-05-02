// ─── Workflow Engine — Dispatcher ──────────────────────────────────────────────
// Public surface for firing workflows from event triggers.
// Called by the shared dispatchNotificationEvent so api- AND worker-originated
// events both fire user-built workflows.

import { prisma } from '@meridian/db';
import { redis } from '../redis.js';
import { executeWorkflow } from './executor.js';
import type { EventContext } from '../conditions.js';

const WORKFLOW_CACHE_TTL = 60; // seconds

interface CachedWorkflow {
  id: string;
  currentVersionId: string | null;
  scopedQueueId: string | null;
}

/**
 * Dispatch matching published workflows for a tenant + trigger.
 * Called from the shared dispatchNotificationEvent.
 * Never throws.
 */
export async function dispatchWorkflows(
  tenantId: string,
  trigger: string,
  eventContext: EventContext,
): Promise<void> {
  try {
    const workflows = await loadPublishedWorkflows(tenantId, trigger);

    for (const wf of workflows) {
      // Check queue scope
      if (wf.scopedQueueId && eventContext.ticket?.queueId !== wf.scopedQueueId) {
        continue;
      }

      if (!wf.currentVersionId) continue;

      // Fire-and-forget — don't await, same pattern as existing dispatch
      void executeWorkflow(tenantId, wf.id, wf.currentVersionId, trigger, eventContext).catch(err => {
        console.error(`[workflow-engine] Failed to execute workflow ${wf.id}:`, err);
      });
    }
  } catch (err) {
    console.error('[workflow-engine] dispatchWorkflows failed:', err);
  }
}

/**
 * Load published workflows from Redis cache or database.
 */
async function loadPublishedWorkflows(tenantId: string, trigger: string): Promise<CachedWorkflow[]> {
  const cacheKey = `workflows:${tenantId}:${trigger}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as CachedWorkflow[];
  } catch { /* ignore cache errors */ }

  const workflows = await prisma.workflow.findMany({
    where: {
      tenantId,
      trigger,
      status: 'PUBLISHED',
    },
    select: {
      id: true,
      currentVersionId: true,
      scopedQueueId: true,
    },
  });

  try {
    await redis.set(cacheKey, JSON.stringify(workflows), 'EX', WORKFLOW_CACHE_TTL);
  } catch { /* ignore cache errors */ }

  return workflows;
}

/**
 * Invalidate cached workflows for a tenant (all triggers).
 * Called when workflows are published, disabled, or deleted.
 */
export async function invalidateWorkflowCache(tenantId: string): Promise<void> {
  try {
    const keys = await redis.keys(`workflows:${tenantId}:*`);
    if (keys.length > 0) await redis.del(...keys);
  } catch { /* ignore */ }
}
