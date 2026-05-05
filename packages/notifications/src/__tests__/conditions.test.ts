import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  evaluateConditionGroups,
  resolveFieldValue,
  renderTemplate,
  type EventContext,
} from '../conditions.js';

const baseTicket = {
  id: 't1',
  ticketNumber: 42,
  title: 'Printer offline',
  type: 'INCIDENT',
  priority: 'HIGH',
  status: 'OPEN',
  queueId: 'q1',
  categoryId: 'c1',
  assignedToId: 'u1',
  assignedGroupId: 'g1',
  requestedById: 'u2',
  slaBreachAt: null as string | null,
  tags: ['urgent'],
  customFields: { vipFlag: true, region: 'EMEA' },
};

const ctx = (overrides: Partial<EventContext> = {}): EventContext => ({
  ticket: { ...baseTicket } as any,
  ...overrides,
});

describe('evaluateCondition — operators', () => {
  it('equals is case-insensitive for strings', () => {
    expect(evaluateCondition({ field: 'priority', operator: 'equals', value: 'high' }, ctx())).toBe(true);
    expect(evaluateCondition({ field: 'priority', operator: 'equals', value: 'LOW' }, ctx())).toBe(false);
  });

  it('not_equals is the inverse of equals', () => {
    expect(evaluateCondition({ field: 'priority', operator: 'not_equals', value: 'low' }, ctx())).toBe(true);
    expect(evaluateCondition({ field: 'priority', operator: 'not_equals', value: 'HIGH' }, ctx())).toBe(false);
  });

  it('in / not_in handle array of values, case-insensitive for strings', () => {
    expect(evaluateCondition({ field: 'priority', operator: 'in', value: ['low', 'high'] }, ctx())).toBe(true);
    expect(evaluateCondition({ field: 'priority', operator: 'in', value: ['low'] }, ctx())).toBe(false);
    expect(evaluateCondition({ field: 'priority', operator: 'not_in', value: ['low'] }, ctx())).toBe(true);
  });

  it('contains is case-insensitive substring match', () => {
    expect(evaluateCondition({ field: 'title', operator: 'contains', value: 'PRINTER' }, ctx())).toBe(true);
    expect(evaluateCondition({ field: 'title', operator: 'contains', value: 'database' }, ctx())).toBe(false);
  });

  it('greater_than / less_than / between only match numbers', () => {
    expect(
      evaluateCondition({ field: 'slaPercentage', operator: 'greater_than', value: 50 }, { slaPercentage: 75 } as any),
    ).toBe(true);
    expect(
      evaluateCondition({ field: 'slaPercentage', operator: 'less_than', value: 50 }, { slaPercentage: 75 } as any),
    ).toBe(false);
    expect(
      evaluateCondition({ field: 'slaPercentage', operator: 'between', value: [60, 90] }, { slaPercentage: 75 } as any),
    ).toBe(true);
    expect(
      evaluateCondition({ field: 'slaPercentage', operator: 'between', value: [60, 70] }, { slaPercentage: 75 } as any),
    ).toBe(false);
  });

  it('is_true / is_false strict-compare booleans', () => {
    expect(
      evaluateCondition({ field: 'customFields.vipFlag', operator: 'is_true', value: null }, ctx()),
    ).toBe(true);
    expect(
      evaluateCondition({ field: 'customFields.vipFlag', operator: 'is_false', value: null }, ctx()),
    ).toBe(false);
  });

  it('before / after compare dates; within_hours bounds the diff', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h ahead
    expect(
      evaluateCondition(
        { field: 'slaBreachAt', operator: 'before', value: future },
        ctx({ ticket: { ...baseTicket, slaBreachAt: past } as any }),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: 'slaBreachAt', operator: 'after', value: future },
        ctx({ ticket: { ...baseTicket, slaBreachAt: past } as any }),
      ),
    ).toBe(false);
    expect(
      evaluateCondition(
        { field: 'slaBreachAt', operator: 'within_hours', value: 2 },
        ctx({ ticket: { ...baseTicket, slaBreachAt: past } as any }),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: 'slaBreachAt', operator: 'within_hours', value: 0.5 },
        ctx({ ticket: { ...baseTicket, slaBreachAt: past } as any }),
      ),
    ).toBe(false);
  });

  it('unknown operators return false (fail closed)', () => {
    expect(evaluateCondition({ field: 'priority', operator: 'made_up', value: 'HIGH' }, ctx())).toBe(false);
  });
});

describe('evaluateConditionGroups — group semantics', () => {
  it('empty groups always match', () => {
    expect(evaluateConditionGroups(undefined, ctx())).toBe(true);
    expect(evaluateConditionGroups([], ctx())).toBe(true);
  });

  it('within a group, all conditions must pass (AND)', () => {
    const groups = [{
      conditions: [
        { field: 'priority', operator: 'equals', value: 'HIGH' },
        { field: 'status', operator: 'equals', value: 'OPEN' },
      ],
    }];
    expect(evaluateConditionGroups(groups, ctx())).toBe(true);

    const failingGroup = [{
      conditions: [
        { field: 'priority', operator: 'equals', value: 'HIGH' },
        { field: 'status', operator: 'equals', value: 'CLOSED' },
      ],
    }];
    expect(evaluateConditionGroups(failingGroup, ctx())).toBe(false);
  });

  it('between groups, any group passing is enough (OR)', () => {
    const groups = [
      { conditions: [{ field: 'priority', operator: 'equals', value: 'LOW' }] },
      { conditions: [{ field: 'status', operator: 'equals', value: 'OPEN' }] },
    ];
    expect(evaluateConditionGroups(groups, ctx())).toBe(true);
  });
});

describe('resolveFieldValue — field router', () => {
  it('resolves named ticket fields', () => {
    expect(resolveFieldValue('priority', ctx())).toBe('HIGH');
    expect(resolveFieldValue('status', ctx())).toBe('OPEN');
    expect(resolveFieldValue('queue', ctx())).toBe('q1');
    expect(resolveFieldValue('category', ctx())).toBe('c1');
  });

  it('drills into customFields via dotted path', () => {
    expect(resolveFieldValue('customFields.region', ctx())).toBe('EMEA');
    expect(resolveFieldValue('customFields.missing', ctx())).toBeUndefined();
  });

  it('drills into cert.* for the APM bridge', () => {
    const c = ctx({
      certExpiry: {
        applicationId: 'a1',
        applicationName: 'API',
        ciId: 'ci1',
        ciName: 'web01',
        url: 'https://example.com',
        certificateExpiryDate: '2026-06-01',
        certificateIssuer: 'LE',
        daysUntilExpiry: 14,
        threshold: '14',
      },
    });
    expect(resolveFieldValue('cert.daysUntilExpiry', c)).toBe(14);
    expect(resolveFieldValue('cert.threshold', c)).toBe('14');
  });

  it('drills into origin.* for provenance-aware conditions', () => {
    const c = ctx({
      origin: { type: 'workflow', workflowId: 'wf1', workflowExecutionId: 'ex1' },
    });
    expect(resolveFieldValue('origin.type', c)).toBe('workflow');
    expect(resolveFieldValue('origin.workflowId', c)).toBe('wf1');
    expect(resolveFieldValue('origin.type', ctx())).toBeUndefined();
  });

  it('computes slaStatus from slaBreachAt vs now', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(resolveFieldValue('slaStatus', ctx({ ticket: { ...baseTicket, slaBreachAt: past } as any }))).toBe('BREACHED');
    expect(resolveFieldValue('slaStatus', ctx({ ticket: { ...baseTicket, slaBreachAt: future } as any }))).toBe('OK');
    expect(resolveFieldValue('slaStatus', ctx())).toBeUndefined();
  });
});

describe('renderTemplate — dual-shape context', () => {
  it('exposes flat legacy keys', () => {
    const out = renderTemplate('#{{ticketNumber}} {{ticketTitle}} ({{priority}})', ctx({
      tenantName: 'Acme',
    } as any));
    // ticketNumber renders as the formatted record number (SR-#####)
    expect(out).toContain('SR-');
    expect(out).toContain('Printer offline');
    expect(out).toContain('HIGH');
  });

  it('exposes nested paths including tenant URLs', () => {
    const out = renderTemplate(
      '{{ticket.dashboardUrl}} | {{tenant.name}}',
      ctx({
        tenantName: 'Acme',
        tenantBaseUrl: 'https://acme.example.com',
      } as any),
    );
    expect(out).toContain('https://acme.example.com/dashboard/tickets/t1');
    expect(out).toContain('Acme');
  });
});
