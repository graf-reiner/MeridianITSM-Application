// Phase 4 — verifies structured fields written to WorkflowExecutionStep
// outputData (durationMs, branchTaken, dedupeSkipped, queueJobId, retryCount)
// and that secrets in node config are masked before persistence.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const stepUpdates: Array<Record<string, unknown>> = [];
const stepCreates: Array<Record<string, unknown>> = [];

let mockGraphJson: { nodes: any[]; edges: any[] } | null = null;

vi.mock('@meridian/db', () => ({
  prisma: {
    workflowExecution: {
      create: vi.fn(async () => ({ id: 'exec-1' })),
      update: vi.fn(async () => ({})),
    },
    workflowExecutionStep: {
      create: vi.fn(async (args: any) => {
        stepCreates.push(args);
        return { id: `step-${stepCreates.length}` };
      }),
      update: vi.fn(async (args: any) => {
        stepUpdates.push(args);
        return {};
      }),
    },
    workflowVersion: {
      findUnique: vi.fn(async () => (mockGraphJson ? { graphJson: mockGraphJson } : null)),
    },
    workflow: {
      findUnique: vi.fn(async () => ({ name: 'Phase 4 Test' })),
    },
  },
}));

vi.mock('../redis.js', () => ({
  redis: {
    get: vi.fn(async () => '0'),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
  },
}));

await import('../workflows/nodes/index.js');
const { executeWorkflow } = await import('../workflows/executor.js');

beforeEach(() => {
  stepUpdates.length = 0;
  stepCreates.length = 0;
  mockGraphJson = null;
});

describe('Step output enrichment (Phase 4.1)', () => {
  it('attaches durationMs to every step under _meta', async () => {
    mockGraphJson = {
      nodes: [
        { id: 'trig', type: 'trigger_ticket_created', position: { x: 0, y: 0 }, data: { label: 'T', config: {} } },
        { id: 'act',  type: 'action_send_in_app',     position: { x: 0, y: 100 }, data: { label: 'A', config: {} } },
      ],
      edges: [{ id: 'e1', source: 'trig', target: 'act' }],
    };

    await executeWorkflow('t1', 'wf-1', 'v-1', 'TICKET_CREATED', { ticket: { id: 'tk1' } as any }, true);

    for (const update of stepUpdates) {
      const meta = (update.data as any).outputData?._meta;
      expect(meta).toBeTruthy();
      expect(typeof meta.durationMs).toBe('number');
      expect(meta.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('records branchTaken on a condition node when nextPort fires', async () => {
    mockGraphJson = {
      nodes: [
        { id: 'trig', type: 'trigger_ticket_created', position: { x: 0, y: 0 }, data: { label: 'T', config: {} } },
        {
          id: 'cond', type: 'condition_field', position: { x: 0, y: 100 },
          data: { label: 'C', config: { field: 'priority', operator: 'equals', value: 'HIGH' } },
        },
        { id: 'a', type: 'action_send_in_app', position: { x: 0, y: 200 }, data: { label: 'A', config: {} } },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'cond' },
        { id: 'e2', source: 'cond', target: 'a', sourceHandle: 'true' },
      ],
    };

    await executeWorkflow('t1', 'wf-1', 'v-1', 'TICKET_CREATED',
      { ticket: { id: 'tk1', priority: 'HIGH' } as any }, true);

    const condUpdate = stepUpdates.find(u => stepCreates.some(c =>
      (c.data as any).nodeId === 'cond' &&
      (c.data as any).nodeType === 'condition_field',
    ) && (u.data as any).outputData?.matched === true);
    expect(condUpdate).toBeTruthy();
    expect((condUpdate!.data as any).outputData._meta.branchTaken).toBe('true');
  });

  it('writes queueJobId + retryCount on the FIRST step only', async () => {
    mockGraphJson = {
      nodes: [
        { id: 'trig', type: 'trigger_ticket_created', position: { x: 0, y: 0 }, data: { label: 'T', config: {} } },
        { id: 'a',    type: 'action_send_in_app',     position: { x: 0, y: 100 }, data: { label: 'A', config: {} } },
      ],
      edges: [{ id: 'e1', source: 'trig', target: 'a' }],
    };

    await executeWorkflow(
      't1', 'wf-1', 'v-1', 'TICKET_CREATED',
      { ticket: { id: 'tk1' } as any }, true,
      { jobId: 'job-XYZ', attemptsMade: 2 },
    );

    const firstMeta = (stepUpdates[0].data as any).outputData._meta;
    const secondMeta = (stepUpdates[1].data as any).outputData._meta;
    expect(firstMeta.queueJobId).toBe('job-XYZ');
    expect(firstMeta.retryCount).toBe(2);
    expect(secondMeta.queueJobId).toBeUndefined();
    expect(secondMeta.retryCount).toBeUndefined();
  });
});

describe('Config secret masking (Phase 4.3)', () => {
  it('masks the secret field of action_webhook_wait before persisting inputData', async () => {
    mockGraphJson = {
      nodes: [
        { id: 'trig', type: 'trigger_ticket_created', position: { x: 0, y: 0 }, data: { label: 'T', config: {} } },
        {
          id: 'wh', type: 'action_webhook_wait', position: { x: 0, y: 100 },
          data: { label: 'WH', config: { url: 'https://example.com', secret: 'super-secret-hmac-key' } },
        },
      ],
      edges: [{ id: 'e1', source: 'trig', target: 'wh' }],
    };

    // Run with isSimulation=true so no real fetch happens — we only care about
    // the inputData stored on the step, which is set BEFORE simulation branches.
    await executeWorkflow('t1', 'wf-1', 'v-1', 'TICKET_CREATED',
      { ticket: { id: 'tk1' } as any }, true);

    const whCreate = stepCreates.find(c => (c.data as any).nodeType === 'action_webhook_wait');
    expect(whCreate).toBeTruthy();
    const inputData = (whCreate!.data as any).inputData;
    expect(inputData.url).toBe('https://example.com');
    expect(inputData.secret).toBe('****');
    expect(inputData.secret).not.toBe('super-secret-hmac-key');
  });
});
