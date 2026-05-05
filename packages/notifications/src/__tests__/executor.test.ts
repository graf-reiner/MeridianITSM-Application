import { describe, it, expect, vi, beforeEach } from 'vitest';

// Captured per-test
const stepCreates: Array<Record<string, unknown>> = [];
const executionCreates: Array<Record<string, unknown>> = [];
const executionUpdates: Array<Record<string, unknown>> = [];

let mockGraphJson: { nodes: any[]; edges: any[] } | null = null;
let mockRecursionDepth = '0';

vi.mock('@meridian/db', () => ({
  prisma: {
    workflowExecution: {
      create: vi.fn(async (args: any) => {
        executionCreates.push(args);
        return { id: 'exec-1' };
      }),
      update: vi.fn(async (args: any) => {
        executionUpdates.push(args);
        return {};
      }),
    },
    workflowExecutionStep: {
      create: vi.fn(async (args: any) => {
        stepCreates.push(args);
        return { id: `step-${stepCreates.length}` };
      }),
      update: vi.fn(async () => ({})),
    },
    workflowVersion: {
      findUnique: vi.fn(async () => (mockGraphJson ? { graphJson: mockGraphJson } : null)),
    },
    workflow: {
      findUnique: vi.fn(async () => ({ name: 'Test Workflow' })),
    },
  },
}));

vi.mock('../redis.js', () => ({
  redis: {
    get: vi.fn(async () => mockRecursionDepth),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
  },
}));

// Side-effect import — registers all built-in nodes
await import('../workflows/nodes/index.js');
const { executeWorkflow } = await import('../workflows/executor.js');

beforeEach(() => {
  stepCreates.length = 0;
  executionCreates.length = 0;
  executionUpdates.length = 0;
  mockRecursionDepth = '0';
  mockGraphJson = null;
});

describe('executeWorkflow — graph walk', () => {
  it('marks execution FAILED when no trigger node exists in graph', async () => {
    mockGraphJson = {
      nodes: [{ id: 'a', type: 'action_send_in_app', position: { x: 0, y: 0 }, data: { label: 'A', config: {} } }],
      edges: [],
    };

    await executeWorkflow('t1', 'wf-1', 'v-1', 'TICKET_CREATED', { ticket: { id: 'tk1' } as any });

    expect(executionUpdates[0]?.data?.status).toBe('FAILED');
    expect(executionUpdates[0]?.data?.error).toContain('No trigger node');
  });

  it('walks a simple linear graph trigger → action', async () => {
    mockGraphJson = {
      nodes: [
        { id: 'trig', type: 'trigger_ticket_created', position: { x: 0, y: 0 }, data: { label: 'T', config: {} } },
        { id: 'act',  type: 'action_send_in_app',     position: { x: 0, y: 100 }, data: { label: 'A', config: { recipients: [] } } },
      ],
      edges: [{ id: 'e1', source: 'trig', target: 'act' }],
    };

    await executeWorkflow('t1', 'wf-1', 'v-1', 'TICKET_CREATED', { ticket: { id: 'tk1' } as any }, true);

    // 1 step for the trigger pass-through, 1 for the action
    expect(stepCreates).toHaveLength(2);
    expect(executionUpdates[0]?.data?.status).toBe('COMPLETED');
  });

  it('follows true/false ports of a condition node', async () => {
    mockGraphJson = {
      nodes: [
        { id: 'trig', type: 'trigger_ticket_created', position: { x: 0, y: 0 }, data: { label: 'T', config: {} } },
        {
          id: 'cond', type: 'condition_field', position: { x: 0, y: 100 },
          data: { label: 'C', config: { field: 'priority', operator: 'equals', value: 'HIGH' } },
        },
        { id: 'true_branch',  type: 'action_send_in_app', position: { x: -100, y: 200 }, data: { label: 'T-branch', config: {} } },
        { id: 'false_branch', type: 'action_send_in_app', position: { x:  100, y: 200 }, data: { label: 'F-branch', config: {} } },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'cond' },
        { id: 'e2', source: 'cond', target: 'true_branch',  sourceHandle: 'true' },
        { id: 'e3', source: 'cond', target: 'false_branch', sourceHandle: 'false' },
      ],
    };

    await executeWorkflow(
      't1', 'wf-1', 'v-1', 'TICKET_CREATED',
      { ticket: { id: 'tk1', priority: 'HIGH' } as any },
      true,
    );

    const visitedIds = stepCreates.map(s => (s.data as any).nodeId);
    expect(visitedIds).toContain('true_branch');
    expect(visitedIds).not.toContain('false_branch');
  });

  it('halts at MAX_RECURSION_DEPTH (=3) without creating an execution', async () => {
    mockRecursionDepth = '3';
    mockGraphJson = {
      nodes: [{ id: 'trig', type: 'trigger_ticket_created', position: { x: 0, y: 0 }, data: { label: 'T', config: {} } }],
      edges: [],
    };

    await executeWorkflow('t1', 'wf-1', 'v-1', 'TICKET_CREATED', { ticket: { id: 'tk1' } as any });

    // No execution row should have been written when depth limit was hit
    expect(executionCreates).toHaveLength(0);
  });

  it('detects cycles and breaks the walk', async () => {
    mockGraphJson = {
      nodes: [
        { id: 'trig', type: 'trigger_ticket_created', position: { x: 0, y: 0 }, data: { label: 'T', config: {} } },
        { id: 'a',    type: 'action_send_in_app',     position: { x: 0, y: 100 }, data: { label: 'A', config: {} } },
      ],
      // Cycle: trig → a → trig
      edges: [
        { id: 'e1', source: 'trig', target: 'a' },
        { id: 'e2', source: 'a',    target: 'trig' },
      ],
    };

    await executeWorkflow('t1', 'wf-1', 'v-1', 'TICKET_CREATED', { ticket: { id: 'tk1' } as any }, true);

    // Each node visited exactly once
    const visited = stepCreates.map(s => (s.data as any).nodeId);
    expect(visited).toHaveLength(2);
    expect(new Set(visited).size).toBe(2);
    expect(executionUpdates[0]?.data?.status).toBe('COMPLETED');
  });
});
