// Integration tests for the action-level idempotency guard. Verifies that:
//   • a workflow mutation node skips its mutation on the second invocation
//     within the TTL window;
//   • the rule-side mutation actions (escalate, update_field) do the same;
//   • SLA percentage distinguishes mutations so 75 / 90 / breach are NOT
//     coalesced into a single dedupe entry.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const ticketUpdate = vi.fn(async () => ({}));
const activityCreate = vi.fn(async () => ({}));

vi.mock('@meridian/db', () => ({
  prisma: {
    ticket: { update: ticketUpdate, findUnique: vi.fn(async () => ({ customFields: {} })) },
    ticketActivity: { create: activityCreate },
    ticketComment: { create: vi.fn(async () => ({ id: 'c1' })) },
  },
}));

// In-memory Redis mock with SET-NX semantics so we can exercise the dedupe.
const seenKeys = new Set<string>();
vi.mock('../redis.js', () => ({
  redis: {
    set: vi.fn(async (key: string, _value: string, _ex: string, _ttl: number, mode: string) => {
      if (mode === 'NX') {
        if (seenKeys.has(key)) return null;
        seenKeys.add(key);
        return 'OK';
      }
      return 'OK';
    }),
    get: vi.fn(async () => null),
    keys: vi.fn(async () => []),
    del: vi.fn(async () => 1),
  },
}));

await import('../workflows/nodes/index.js');
const { getNodeDefinition } = await import('../workflows/node-registry.js');
const { executeActions } = await import('../actions.js');

beforeEach(() => {
  seenKeys.clear();
  ticketUpdate.mockClear();
  activityCreate.mockClear();
});

const baseExecCtx = {
  tenantId: 't1',
  workflowId: 'wf-1',
  workflowName: 'Test',
  executionId: 'exec-1',
  isSimulation: false,
  recursionDepth: 1,
  variables: {},
  currentNodeId: 'node-1',
  eventContext: {
    ticket: { id: 'tk1', priority: 'HIGH', status: 'OPEN' },
    actorId: 'u1',
    trigger: 'TICKET_UPDATED',
  } as any,
};

describe('Workflow mutation idempotency', () => {
  it('skips action_change_status on second identical run within TTL', async () => {
    const def = getNodeDefinition('action_change_status');
    if (!def?.execute) throw new Error('action_change_status missing');

    const first = await def.execute({ status: 'RESOLVED' }, { ...baseExecCtx });
    const second = await def.execute({ status: 'RESOLVED' }, { ...baseExecCtx });

    expect(ticketUpdate).toHaveBeenCalledTimes(1);
    expect((first.output as any)?.deduped).not.toBe(true);
    expect((second.output as any)?.deduped).toBe(true);
  });

  it('runs action_change_priority twice when SLA percentage differs (75% vs 90%)', async () => {
    const def = getNodeDefinition('action_change_priority');
    if (!def?.execute) throw new Error('action_change_priority missing');

    await def.execute({ priority: 'CRITICAL' }, {
      ...baseExecCtx,
      eventContext: { ...baseExecCtx.eventContext, slaPercentage: 75 },
    });
    await def.execute({ priority: 'CRITICAL' }, {
      ...baseExecCtx,
      eventContext: { ...baseExecCtx.eventContext, slaPercentage: 90 },
    });

    expect(ticketUpdate).toHaveBeenCalledTimes(2);
  });

  it('different planned mutations on the same ticket BOTH fire', async () => {
    const def = getNodeDefinition('action_change_status');
    if (!def?.execute) throw new Error('action_change_status missing');

    await def.execute({ status: 'OPEN' }, { ...baseExecCtx });
    await def.execute({ status: 'RESOLVED' }, { ...baseExecCtx, currentNodeId: 'node-2' });

    expect(ticketUpdate).toHaveBeenCalledTimes(2);
  });
});

describe('Rule mutation idempotency', () => {
  const ruleEventContext = {
    ticket: { id: 'tk2', priority: 'HIGH', status: 'OPEN' },
    actorId: 'u1',
    trigger: 'TICKET_UPDATED',
  } as any;

  it('skips rule_update_field on second identical run within TTL', async () => {
    await executeActions(
      [{ type: 'update_field', field: 'priority', value: 'CRITICAL' }],
      ruleEventContext,
      't1',
    );
    await executeActions(
      [{ type: 'update_field', field: 'priority', value: 'CRITICAL' }],
      ruleEventContext,
      't1',
    );

    expect(ticketUpdate).toHaveBeenCalledTimes(1);
  });

  it('rule_escalate dedupes when target & actor are identical', async () => {
    await executeActions(
      [{ type: 'escalate', queueId: 'q-vip' }],
      ruleEventContext,
      't1',
    );
    await executeActions(
      [{ type: 'escalate', queueId: 'q-vip' }],
      ruleEventContext,
      't1',
    );

    expect(ticketUpdate).toHaveBeenCalledTimes(1);
  });
});
