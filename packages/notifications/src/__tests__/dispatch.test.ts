import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────
// `dispatchNotificationEvent` calls into prisma + redis + the workflow
// dispatcher. Mock all three so the test can drive rule loading deterministically.

const ruleFindMany = vi.fn();
const ruleLogCreate = vi.fn();
const tenantFindUnique = vi.fn();
const workflowFindMany = vi.fn();
const redisGet = vi.fn();
const redisSet = vi.fn();
const redisKeys = vi.fn();
const redisDel = vi.fn();
const dispatchWorkflowsMock = vi.fn();

vi.mock('@meridian/db', () => ({
  prisma: {
    notificationRule: { findMany: (...args: unknown[]) => ruleFindMany(...args) },
    notificationRuleLog: { create: (...args: unknown[]) => ruleLogCreate(...args) },
    tenant: { findUnique: (...args: unknown[]) => tenantFindUnique(...args) },
    workflow: { findMany: (...args: unknown[]) => workflowFindMany(...args) },
  },
}));

vi.mock('../redis.js', () => ({
  redis: {
    get: (...args: unknown[]) => redisGet(...args),
    set: (...args: unknown[]) => redisSet(...args),
    keys: (...args: unknown[]) => redisKeys(...args),
    del: (...args: unknown[]) => redisDel(...args),
  },
}));

vi.mock('../workflows/dispatch.js', () => ({
  dispatchWorkflows: (...args: unknown[]) => dispatchWorkflowsMock(...args),
}));

// Action executors call the queue + DB. The dispatcher only invokes
// executeActions for matching rules; mock the whole module so we can capture
// calls without touching BullMQ or Prisma.
const executeActionsMock = vi.fn(async () => [{ type: 'in_app', success: true }]);
vi.mock('../actions.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../actions.js')>();
  return {
    ...original,
    executeActions: (...args: unknown[]) => executeActionsMock(...args),
  };
});

// Import under test AFTER all mocks are declared.
const { dispatchNotificationEvent } = await import('../dispatch.js');
const { _resetTenantIdentityCacheForTests } = await import('../dispatch.js');

beforeEach(() => {
  vi.clearAllMocks();
  redisGet.mockResolvedValue(null);
  redisSet.mockResolvedValue('OK');
  ruleLogCreate.mockResolvedValue({});
  workflowFindMany.mockResolvedValue([]);
  tenantFindUnique.mockResolvedValue({
    name: 'Acme', subdomain: 'acme', customDomain: null,
  });
  _resetTenantIdentityCacheForTests();
});

describe('dispatchNotificationEvent — rule path', () => {
  it('runs legacyFallback when no rules exist for the trigger', async () => {
    ruleFindMany.mockResolvedValue([]);
    const legacyFallback = vi.fn();

    await dispatchNotificationEvent('t1', 'TICKET_CREATED', { ticket: { id: 'tk1' } as any }, { legacyFallback });

    expect(legacyFallback).toHaveBeenCalledOnce();
    expect(executeActionsMock).not.toHaveBeenCalled();
  });

  it('runs matching rules and calls executeActions', async () => {
    ruleFindMany.mockResolvedValue([
      {
        id: 'r1', name: 'High prio',
        trigger: 'TICKET_CREATED',
        conditionGroups: [{ conditions: [{ field: 'priority', operator: 'equals', value: 'HIGH' }] }],
        actions: [{ type: 'in_app', recipients: ['assignee'] }],
        priority: 1, stopAfterMatch: false, scopedQueueId: null,
      },
    ]);

    await dispatchNotificationEvent(
      't1', 'TICKET_CREATED',
      { ticket: { id: 'tk1', priority: 'HIGH', status: 'OPEN' } as any },
    );

    expect(executeActionsMock).toHaveBeenCalledOnce();
    expect(ruleLogCreate).toHaveBeenCalledOnce();
  });

  it('skips rules whose conditions do not match', async () => {
    ruleFindMany.mockResolvedValue([
      {
        id: 'r1', name: 'Low prio',
        trigger: 'TICKET_CREATED',
        conditionGroups: [{ conditions: [{ field: 'priority', operator: 'equals', value: 'LOW' }] }],
        actions: [{ type: 'in_app' }],
        priority: 1, stopAfterMatch: false, scopedQueueId: null,
      },
    ]);

    await dispatchNotificationEvent(
      't1', 'TICKET_CREATED',
      { ticket: { id: 'tk1', priority: 'HIGH' } as any },
    );

    expect(executeActionsMock).not.toHaveBeenCalled();
  });

  it('skips rule when scopedQueueId mismatches the event queue', async () => {
    ruleFindMany.mockResolvedValue([
      {
        id: 'r1', name: 'Q-scoped',
        trigger: 'TICKET_CREATED',
        conditionGroups: [],
        actions: [{ type: 'in_app' }],
        priority: 1, stopAfterMatch: false, scopedQueueId: 'queue-A',
      },
    ]);

    await dispatchNotificationEvent(
      't1', 'TICKET_CREATED',
      { ticket: { id: 'tk1', queueId: 'queue-B' } as any },
    );

    expect(executeActionsMock).not.toHaveBeenCalled();
  });

  it('halts after a matched rule with stopAfterMatch=true', async () => {
    ruleFindMany.mockResolvedValue([
      {
        id: 'first', name: 'First (stop)',
        trigger: 'TICKET_CREATED',
        conditionGroups: [],
        actions: [{ type: 'in_app' }],
        priority: 1, stopAfterMatch: true, scopedQueueId: null,
      },
      {
        id: 'second', name: 'Second',
        trigger: 'TICKET_CREATED',
        conditionGroups: [],
        actions: [{ type: 'in_app' }],
        priority: 2, stopAfterMatch: false, scopedQueueId: null,
      },
    ]);

    await dispatchNotificationEvent('t1', 'TICKET_CREATED', { ticket: { id: 'tk1' } as any });

    expect(executeActionsMock).toHaveBeenCalledOnce();
  });

  it('always fires workflows alongside rules — independent path', async () => {
    ruleFindMany.mockResolvedValue([]); // No rules, but workflows still must dispatch

    await dispatchNotificationEvent('t1', 'TICKET_CREATED', { ticket: { id: 'tk1' } as any });

    expect(dispatchWorkflowsMock).toHaveBeenCalledOnce();
  });

  it('enriches event context with tenant identity before evaluation', async () => {
    ruleFindMany.mockResolvedValue([]);
    const eventCtx = { ticket: { id: 'tk1' } as any };

    await dispatchNotificationEvent('t1', 'TICKET_CREATED', eventCtx);

    expect((eventCtx as any).tenantName).toBe('Acme');
    expect((eventCtx as any).tenantBaseUrl).toBeTruthy();
  });
});
