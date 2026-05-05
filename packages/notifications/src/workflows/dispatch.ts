// ─── Workflow Engine — Dispatcher ──────────────────────────────────────────────
// Public surface for firing workflows from event triggers.
// Called by the shared dispatchNotificationEvent so api- AND worker-originated
// events both fire user-built workflows.
//
// Two execution modes, controlled by `WORKFLOW_QUEUE_EXECUTION` env var:
//   • OFF (default) — direct `executeWorkflow()` call, fire-and-forget. The
//     historical behavior; safe rollback for the queue migration.
//   • ON — enqueue a `workflow-execution` BullMQ job consumed by the worker
//     app. Failed jobs retry with exponential backoff (3 attempts). The
//     action-level idempotency from Phase 2 keeps mutation nodes from
//     double-firing across retries.

import { Queue } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '@meridian/core';
import { redis } from '../redis.js';
import { executeWorkflow } from './executor.js';
import type { EventContext } from '../conditions.js';

// Read once at module load so a runtime toggle requires a restart — avoids
// per-event env reads and makes the rollout state observable in `ps`.
const QUEUE_BACKED = (() => {
  const raw = process.env.WORKFLOW_QUEUE_EXECUTION;
  return raw === '1' || raw === 'true';
})();

// Producer-side queue. Lives in this package so dispatch sites in apps/api
// and apps/worker can both produce without depending on apps/worker.
// Worker / consumer is wired in apps/worker/src/workers/workflow-execution.worker.ts.
const workflowExecutionQueue = QUEUE_BACKED
  ? new Queue('workflow-execution', {
      connection: bullmqConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 60 * 60, count: 500 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    })
  : null;

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

      if (workflowExecutionQueue) {
        // Queue-backed: hand off to the worker. Failures retry with exponential
        // backoff (3 attempts). Idempotency guards from Phase 2 protect mutation
        // nodes against double-firing on retry.
        try {
          await workflowExecutionQueue.add('execute', {
            tenantId,
            workflowId: wf.id,
            versionId: wf.currentVersionId,
            trigger,
            eventContext,
          });
        } catch (err) {
          console.error(`[workflow-engine] Enqueue failed for workflow ${wf.id} — falling back to direct execution:`, err);
          void executeWorkflow(tenantId, wf.id, wf.currentVersionId, trigger, eventContext).catch(directErr => {
            console.error(`[workflow-engine] Direct fallback also failed for workflow ${wf.id}:`, directErr);
          });
        }
      } else {
        // Direct mode (default): fire-and-forget, same as historical behavior.
        void executeWorkflow(tenantId, wf.id, wf.currentVersionId, trigger, eventContext).catch(err => {
          console.error(`[workflow-engine] Failed to execute workflow ${wf.id}:`, err);
        });
      }
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
