// ─── Workflow Execution Worker ──────────────────────────────────────────────
// Pulls jobs off the workflow-execution queue. Each job carries the trigger
// context for one matched workflow; the worker invokes the in-package
// `executeWorkflow` walker, which records the WorkflowExecution row and
// per-node steps in the database.
//
// Producer side: `packages/notifications/src/workflows/dispatch.ts` enqueues
// here when WORKFLOW_QUEUE_EXECUTION is set; otherwise it calls executeWorkflow
// directly. Either way, the executor body is identical.
//
// Retry safety: BullMQ retries with exponential backoff (3 attempts). The
// action-level idempotency guards from Phase 2 (action_change_status,
// action_update_field, etc.) keep mutation nodes from double-firing on retry.

import { Worker, type Job } from 'bullmq';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';
import { executeWorkflow, type EventContext } from '@meridian/notifications';

interface WorkflowExecutionJobData {
  tenantId: string;
  workflowId: string;
  versionId: string;
  trigger: string;
  eventContext: EventContext;
  isSimulation?: boolean;
}

export const workflowExecutionWorker = new Worker<WorkflowExecutionJobData>(
  QUEUE_NAMES.WORKFLOW_EXECUTION,
  async (job: Job<WorkflowExecutionJobData>) => {
    const { tenantId, workflowId, versionId, trigger, eventContext, isSimulation } = job.data;
    if (!tenantId || !workflowId || !versionId || !trigger) {
      throw new Error(
        `[workflow-execution] Job ${job.id} missing required fields (tenantId/workflowId/versionId/trigger) — refusing to process`,
      );
    }
    await executeWorkflow(
      tenantId,
      workflowId,
      versionId,
      trigger,
      eventContext,
      isSimulation ?? false,
      { jobId: job.id, attemptsMade: job.attemptsMade },
    );
  },
  {
    connection: bullmqConnection,
    concurrency: 10,
  },
);

workflowExecutionWorker.on('failed', (job, err) => {
  console.error(
    `[workflow-execution] Job ${job?.id} (workflow ${job?.data?.workflowId ?? 'unknown'}, attempt ${job?.attemptsMade ?? '?'}) failed: ${err.message}`,
  );
});
