import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock functions (available inside vi.mock factories)
// ---------------------------------------------------------------------------

const { mockPrismaObj, mockTx } = vi.hoisted(() => {
  const fn = () => ({
    mockResolvedValue: function(val: unknown) { (this as any)._resolved = val; return this; },
    mockImplementation: function(impl: unknown) { (this as any)._impl = impl; return this; },
  });

  // We return plain objects here - actual vi.fn() calls happen at top level
  return { mockPrismaObj: {}, mockTx: {} };
});

// ---------------------------------------------------------------------------
// Create mock fns at module level (outside factory)
// ---------------------------------------------------------------------------

const txTicketCreate = vi.fn();
const txTicketUpdate = vi.fn();
const txTicketFindFirst = vi.fn();
const txActivityCreate = vi.fn();
const txCommentCreate = vi.fn();
const txQueueFindFirst = vi.fn();
const txSlaFindFirst = vi.fn();
const txExecuteRaw = vi.fn();
const txQueryRaw = vi.fn();

const prismaTicketFindFirst = vi.fn();
const prismaTicketFindMany = vi.fn();
const prismaTicketCount = vi.fn();
const prismaTicketUpdate = vi.fn();
const prismaSlaFindFirst = vi.fn();
const prismaTransaction = vi.fn();

// Assemble mock tx object (used as callback arg in $transaction)
Object.assign(mockTx, {
  ticket: { create: txTicketCreate, update: txTicketUpdate, findFirst: txTicketFindFirst },
  ticketActivity: { create: txActivityCreate },
  ticketComment: { create: txCommentCreate },
  queue: { findFirst: txQueueFindFirst },
  sLA: { findFirst: txSlaFindFirst },
  $executeRaw: txExecuteRaw,
  $queryRaw: txQueryRaw,
});

// Assemble mock prisma
Object.assign(mockPrismaObj, {
  ticket: { findFirst: prismaTicketFindFirst, findMany: prismaTicketFindMany, count: prismaTicketCount, update: prismaTicketUpdate },
  sLA: { findFirst: prismaSlaFindFirst },
  $transaction: prismaTransaction,
});

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock('@meridian/db', () => ({ prisma: mockPrismaObj }));

vi.mock('../services/sla.service.js', () => ({
  calculateBreachAt: vi.fn(),
  getResolutionMinutes: vi.fn(),
}));

vi.mock('../services/notification-rules.service.js', () => ({
  dispatchNotificationEvent: vi.fn(),
}));

vi.mock('../workers/sla-monitor.worker.js', () => ({
  clearSlaAlerts: vi.fn().mockResolvedValue(undefined),
}));

// Import service under test
import { createTicket, updateTicket, addComment } from '../services/ticket.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'test-tenant-id';
const ACTOR_ID = 'test-actor-id';
const TICKET_ID = 'test-ticket-id';

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default $transaction: invoke the callback with mockTx
  prismaTransaction.mockImplementation(
    (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
  );
});

// ---------------------------------------------------------------------------
// ALLOWED_TRANSITIONS (tested indirectly via updateTicket)
// ---------------------------------------------------------------------------

describe('ALLOWED_TRANSITIONS', () => {
  function setupExistingTicket(status: string) {
    prismaTicketFindFirst.mockResolvedValue({
      id: TICKET_ID,
      tenantId: TENANT_ID,
      status,
      title: 'Test Ticket',
      description: '',
      priority: 'MEDIUM',
      type: 'INCIDENT',
      assignedToId: null,
      assignedGroupId: null,
      queueId: null,
      categoryId: null,
      slaId: null,
      resolution: null,
      tags: [],
      customFields: null,
      slaBreachAt: null,
      createdAt: new Date(),
    });
    txTicketUpdate.mockResolvedValue({ id: TICKET_ID, status });
    txActivityCreate.mockResolvedValue({});
  }

  it('allows NEW -> OPEN', async () => {
    setupExistingTicket('NEW');
    const result = await updateTicket(TENANT_ID, TICKET_ID, { status: 'OPEN' }, ACTOR_ID);
    expect(result).toBeDefined();
  });

  it('allows NEW -> IN_PROGRESS', async () => {
    setupExistingTicket('NEW');
    const result = await updateTicket(TENANT_ID, TICKET_ID, { status: 'IN_PROGRESS' }, ACTOR_ID);
    expect(result).toBeDefined();
  });

  it('rejects NEW -> RESOLVED (invalid transition)', async () => {
    setupExistingTicket('NEW');
    await expect(
      updateTicket(TENANT_ID, TICKET_ID, { status: 'RESOLVED' }, ACTOR_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects CLOSED -> any (terminal state)', async () => {
    setupExistingTicket('CLOSED');
    await expect(
      updateTicket(TENANT_ID, TICKET_ID, { status: 'OPEN' }, ACTOR_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('allows RESOLVED -> OPEN (reopen)', async () => {
    setupExistingTicket('RESOLVED');
    const result = await updateTicket(TENANT_ID, TICKET_ID, { status: 'OPEN' }, ACTOR_ID);
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createTicket
// ---------------------------------------------------------------------------

describe('createTicket', () => {
  beforeEach(() => {
    txQueryRaw.mockResolvedValue([{ next: BigInt(42) }]);
    txExecuteRaw.mockResolvedValue(undefined);
    txTicketCreate.mockResolvedValue({
      id: TICKET_ID,
      tenantId: TENANT_ID,
      ticketNumber: 42,
      title: 'New Ticket',
      type: 'INCIDENT',
      priority: 'MEDIUM',
      status: 'NEW',
      createdAt: new Date(),
    });
    txActivityCreate.mockResolvedValue({});
  });

  it('generates sequential ticket number within transaction', async () => {
    const ticket = await createTicket(TENANT_ID, { title: 'New Ticket' }, ACTOR_ID);

    expect(ticket.ticketNumber).toBe(42);
    expect(txExecuteRaw).toHaveBeenCalled();
    expect(txQueryRaw).toHaveBeenCalled();
    expect(txTicketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          ticketNumber: 42,
          title: 'New Ticket',
        }),
      }),
    );
  });

  it('creates TicketActivity CREATED record', async () => {
    await createTicket(TENANT_ID, { title: 'New Ticket' }, ACTOR_ID);

    expect(txActivityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        ticketId: TICKET_ID,
        actorId: ACTOR_ID,
        activityType: 'CREATED',
        metadata: expect.objectContaining({
          title: 'New Ticket',
        }),
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// updateTicket
// ---------------------------------------------------------------------------

describe('updateTicket', () => {
  const baseTicket = {
    id: TICKET_ID,
    tenantId: TENANT_ID,
    status: 'OPEN',
    title: 'Existing Ticket',
    description: 'Some description',
    priority: 'MEDIUM',
    type: 'INCIDENT',
    assignedToId: null,
    assignedGroupId: null,
    queueId: null,
    categoryId: null,
    slaId: null,
    resolution: null,
    tags: [],
    customFields: null,
    slaBreachAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    prismaTicketFindFirst.mockResolvedValue({ ...baseTicket });
    txTicketUpdate.mockResolvedValue({ ...baseTicket, status: 'RESOLVED' });
    txActivityCreate.mockResolvedValue({});
  });

  it('sets resolvedAt on status change to RESOLVED', async () => {
    await updateTicket(TENANT_ID, TICKET_ID, { status: 'RESOLVED' }, ACTOR_ID);

    expect(txTicketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RESOLVED',
          resolvedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('sets slaPausedAt in customFields on PENDING', async () => {
    txTicketUpdate.mockResolvedValue({ ...baseTicket, status: 'PENDING' });

    await updateTicket(TENANT_ID, TICKET_ID, { status: 'PENDING' }, ACTOR_ID);

    expect(txTicketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          customFields: expect.objectContaining({
            slaPausedAt: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('creates TicketActivity FIELD_CHANGED for each changed field', async () => {
    txTicketUpdate.mockResolvedValue({
      ...baseTicket,
      title: 'Updated Title',
      priority: 'HIGH',
    });

    await updateTicket(
      TENANT_ID,
      TICKET_ID,
      { title: 'Updated Title', priority: 'HIGH' },
      ACTOR_ID,
    );

    const activityCalls = txActivityCreate.mock.calls;
    expect(activityCalls.length).toBe(2);

    const fieldNames = activityCalls.map(
      (call: Array<{ data: { fieldName: string } }>) => call[0].data.fieldName,
    );
    expect(fieldNames).toContain('title');
    expect(fieldNames).toContain('priority');

    expect(activityCalls[0][0]).toEqual({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        ticketId: TICKET_ID,
        actorId: ACTOR_ID,
        activityType: 'FIELD_CHANGED',
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// addComment
// ---------------------------------------------------------------------------

describe('addComment', () => {
  it('sets firstResponseAt on first non-requester comment', async () => {
    const requesterId = 'requester-user-id';
    const agentId = 'agent-user-id';

    txTicketFindFirst.mockResolvedValue({
      id: TICKET_ID,
      firstResponseAt: null,
      requestedById: requesterId,
      assignedToId: agentId,
      ticketNumber: 1,
      title: 'Help me',
    });

    txCommentCreate.mockResolvedValue({
      id: 'comment-1',
      tenantId: TENANT_ID,
      ticketId: TICKET_ID,
      authorId: agentId,
      content: 'On it!',
      visibility: 'PUBLIC',
      author: { id: agentId, firstName: 'Agent', lastName: 'Smith', email: 'agent@test.local' },
    });

    txTicketUpdate.mockResolvedValue({});
    txActivityCreate.mockResolvedValue({});

    await addComment(
      TENANT_ID,
      TICKET_ID,
      { content: 'On it!', visibility: 'PUBLIC' },
      agentId,
    );

    expect(txTicketUpdate).toHaveBeenCalledWith({
      where: { id: TICKET_ID },
      data: { firstResponseAt: expect.any(Date) },
    });
  });
});
