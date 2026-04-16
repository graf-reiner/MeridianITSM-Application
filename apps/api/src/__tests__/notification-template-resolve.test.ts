import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks for Prisma + BullMQ (notification-rules-actions.ts creates
// BullMQ queues at import time; we stub them to avoid a live Redis dep)
// ---------------------------------------------------------------------------

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    notificationTemplate: { findFirst: vi.fn() },
  },
}));

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));

vi.mock('bullmq', () => ({
  Queue: class {
    add = vi.fn();
  },
}));

vi.mock('../services/notification-rules-conditions.js', () => ({
  renderTemplate: (s: string) => s,
}));

// Import under test
import { resolveTemplate } from '../services/notification-rules-actions.js';

const TENANT = '00000000-0000-0000-0000-000000000001';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000ff';
const TPL = '00000000-0000-0000-0000-00000000tpl1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveTemplate', () => {
  it('returns null when templateId is undefined', async () => {
    const result = await resolveTemplate(undefined, TENANT, 'EMAIL');
    expect(result).toBeNull();
    expect(mockPrisma.notificationTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when templateId is an empty string', async () => {
    const result = await resolveTemplate('', TENANT, 'EMAIL');
    expect(result).toBeNull();
    expect(mockPrisma.notificationTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when prisma finds no template (inactive/wrong channel/cross-tenant)', async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue(null);
    const result = await resolveTemplate(TPL, TENANT, 'EMAIL');
    expect(result).toBeNull();
  });

  it('queries prisma with tenantId + channel + isActive scope (tenant isolation)', async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue(null);
    await resolveTemplate(TPL, TENANT, 'TELEGRAM');

    expect(mockPrisma.notificationTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: TPL, tenantId: TENANT, channel: 'TELEGRAM', isActive: true },
      select: { content: true, contexts: true },
    });
  });

  it('cannot resolve a template from another tenant', async () => {
    // Even if the template id is known, a query with the wrong tenantId returns null
    mockPrisma.notificationTemplate.findFirst.mockImplementation(({ where }: { where: { tenantId: string } }) =>
      Promise.resolve(where.tenantId === TENANT ? { content: { message: 'hello' }, contexts: ['ticket'] } : null),
    );

    const ownTenant = await resolveTemplate(TPL, TENANT, 'TELEGRAM');
    expect(ownTenant).toEqual({ content: { message: 'hello' }, contexts: ['ticket'] });

    const otherTenant = await resolveTemplate(TPL, OTHER_TENANT, 'TELEGRAM');
    expect(otherTenant).toBeNull();
  });

  it('returns content and contexts when template is found', async () => {
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue({
      content: { subject: 'hi {{ticket.title}}', htmlBody: '<p>body</p>' },
      contexts: ['ticket', 'requester'],
    });

    const result = await resolveTemplate(TPL, TENANT, 'EMAIL');
    expect(result).toEqual({
      content: { subject: 'hi {{ticket.title}}', htmlBody: '<p>body</p>' },
      contexts: ['ticket', 'requester'],
    });
  });

  it('respects channel discriminator — wrong channel returns null', async () => {
    // If caller passes EMAIL but the template in DB is TELEGRAM, the prisma query
    // filter `channel: 'EMAIL'` returns null. We simulate that here.
    mockPrisma.notificationTemplate.findFirst.mockImplementation(({ where }: { where: { channel: string } }) =>
      Promise.resolve(where.channel === 'TELEGRAM' ? { content: { message: 'hi' }, contexts: [] } : null),
    );

    const matching = await resolveTemplate(TPL, TENANT, 'TELEGRAM');
    expect(matching).not.toBeNull();

    const mismatched = await resolveTemplate(TPL, TENANT, 'EMAIL');
    expect(mismatched).toBeNull();
  });
});
