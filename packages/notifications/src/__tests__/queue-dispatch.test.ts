// Verifies the WORKFLOW_QUEUE_EXECUTION toggle:
//   • OFF (default) → dispatchWorkflows calls executeWorkflow directly.
//   • ON          → dispatchWorkflows enqueues a workflow-execution job and
//                   does NOT call executeWorkflow inline.
//
// The flag is captured at module load, so each test resets modules and
// re-imports after stubbing the env var.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const executeWorkflowMock = vi.fn(async () => undefined);
const queueAddMock = vi.fn(async () => ({ id: 'job-1' }));
const QueueCtorSpy = vi.fn();

class FakeQueue {
  add = queueAddMock;
  constructor(name: string, opts: unknown) {
    QueueCtorSpy(name, opts);
  }
}

const workflowFindMany = vi.fn();
const redisGet = vi.fn(async () => null);
const redisSet = vi.fn(async () => 'OK');
const redisKeys = vi.fn(async () => []);
const redisDel = vi.fn(async () => 1);

vi.mock('@meridian/db', () => ({
  prisma: {
    workflow: { findMany: (...args: unknown[]) => workflowFindMany(...args) },
  },
}));

vi.mock('../redis.js', () => ({
  redis: {
    get: redisGet, set: redisSet, keys: redisKeys, del: redisDel,
  },
}));

vi.mock('bullmq', () => ({
  Queue: FakeQueue,
}));

vi.mock('../workflows/executor.js', () => ({
  executeWorkflow: (...args: unknown[]) => executeWorkflowMock(...args),
}));

const sampleEventContext = { ticket: { id: 'tk1' } } as any;

beforeEach(() => {
  executeWorkflowMock.mockClear();
  queueAddMock.mockClear();
  QueueCtorSpy.mockClear();
  workflowFindMany.mockReset();
  workflowFindMany.mockResolvedValue([
    { id: 'wf-1', currentVersionId: 'v-1', scopedQueueId: null },
  ]);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('WORKFLOW_QUEUE_EXECUTION = off (default)', () => {
  it('calls executeWorkflow directly and does NOT construct a queue', async () => {
    vi.stubEnv('WORKFLOW_QUEUE_EXECUTION', '');
    const { dispatchWorkflows } = await import('../workflows/dispatch.js');

    await dispatchWorkflows('t1', 'TICKET_CREATED', sampleEventContext);

    // void executeWorkflow runs in the background — wait a tick
    await new Promise(r => setImmediate(r));

    expect(executeWorkflowMock).toHaveBeenCalledTimes(1);
    expect(executeWorkflowMock).toHaveBeenCalledWith(
      't1', 'wf-1', 'v-1', 'TICKET_CREATED', sampleEventContext,
    );
    expect(queueAddMock).not.toHaveBeenCalled();
    expect(QueueCtorSpy).not.toHaveBeenCalled();
  });
});

describe('WORKFLOW_QUEUE_EXECUTION = on', () => {
  it('enqueues a workflow-execution job and skips direct execution', async () => {
    vi.stubEnv('WORKFLOW_QUEUE_EXECUTION', '1');
    const { dispatchWorkflows } = await import('../workflows/dispatch.js');

    await dispatchWorkflows('t1', 'TICKET_CREATED', sampleEventContext);

    expect(QueueCtorSpy).toHaveBeenCalledWith('workflow-execution', expect.objectContaining({
      defaultJobOptions: expect.objectContaining({ attempts: 3 }),
    }));
    expect(queueAddMock).toHaveBeenCalledWith('execute', {
      tenantId: 't1',
      workflowId: 'wf-1',
      versionId: 'v-1',
      trigger: 'TICKET_CREATED',
      eventContext: sampleEventContext,
    });
    expect(executeWorkflowMock).not.toHaveBeenCalled();
  });

  it('falls back to direct execution if enqueue throws', async () => {
    vi.stubEnv('WORKFLOW_QUEUE_EXECUTION', 'true');
    queueAddMock.mockRejectedValueOnce(new Error('redis offline'));

    const { dispatchWorkflows } = await import('../workflows/dispatch.js');

    await dispatchWorkflows('t1', 'TICKET_CREATED', sampleEventContext);

    // Allow the fire-and-forget fallback to run
    await new Promise(r => setImmediate(r));

    expect(queueAddMock).toHaveBeenCalledOnce();
    expect(executeWorkflowMock).toHaveBeenCalledOnce();
  });

  it('honors scopedQueueId — workflow targeting a different queue is skipped', async () => {
    vi.stubEnv('WORKFLOW_QUEUE_EXECUTION', '1');
    workflowFindMany.mockResolvedValue([
      { id: 'wf-1', currentVersionId: 'v-1', scopedQueueId: 'queue-A' },
    ]);

    const { dispatchWorkflows } = await import('../workflows/dispatch.js');

    await dispatchWorkflows('t1', 'TICKET_CREATED', { ticket: { id: 'tk1', queueId: 'queue-B' } as any });

    expect(queueAddMock).not.toHaveBeenCalled();
    expect(executeWorkflowMock).not.toHaveBeenCalled();
  });
});
