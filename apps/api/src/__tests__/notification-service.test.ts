import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockPrisma, mockEmailQueue, mockPushQueue } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      notification: {
        create: fn(),
        findMany: fn(),
        count: fn(),
        update: fn(),
        updateMany: fn(),
      },
      user: {
        findFirst: fn(),
        findMany: fn(),
      },
      $transaction: vi.fn(),
    },
    mockEmailQueue: { add: fn() },
    mockPushQueue: { add: fn() },
  };
});

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));

vi.mock('bullmq', () => {
  return {
    Queue: class MockQueue {
      constructor(name: string) {
        if (name === 'email-notification') return mockEmailQueue as unknown as MockQueue;
        if (name === 'push-notification') return mockPushQueue as unknown as MockQueue;
      }
      add = vi.fn();
    },
  };
});

import {
  notifyUser,
  notifyTicketCreated,
  notifyTicketCommented,
  markAllRead,
} from '../services/notification.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';
const USER_A = 'user-a';
const USER_B = 'user-b';

const baseTicket = {
  id: 'ticket-1',
  ticketNumber: 42,
  title: 'Printer not working',
  assignedToId: USER_B,
  requestedById: USER_A,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.create.mockResolvedValue({});
  mockEmailQueue.add.mockResolvedValue({});
  mockPushQueue.add.mockResolvedValue({});
});

describe('notifyUser', () => {
  it('creates in-app Notification record', async () => {
    await notifyUser({
      tenantId: TENANT_ID,
      userId: USER_A,
      type: 'TICKET_ASSIGNED',
      title: 'You have a new ticket',
      body: 'Printer not working',
      resourceId: 'ticket-1',
      resource: 'ticket',
    });

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        userId: USER_A,
        type: 'TICKET_ASSIGNED',
        title: 'You have a new ticket',
        body: 'Printer not working',
        resourceId: 'ticket-1',
        resource: 'ticket',
      },
    });
  });

  it('enqueues email job when emailData provided', async () => {
    await notifyUser({
      tenantId: TENANT_ID,
      userId: USER_A,
      type: 'TICKET_ASSIGNED',
      title: 'You have a new ticket',
      emailData: {
        to: 'user@example.com',
        templateName: 'ticket-assigned',
        variables: { ticketNumber: '42', ticketTitle: 'Printer', ticketId: 'ticket-1' },
      },
    });

    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', {
      tenantId: TENANT_ID,
      to: 'user@example.com',
      templateName: 'ticket-assigned',
      variables: { ticketNumber: '42', ticketTitle: 'Printer', ticketId: 'ticket-1' },
    });
  });

  it('skips email job when emailData not provided', async () => {
    await notifyUser({
      tenantId: TENANT_ID,
      userId: USER_A,
      type: 'TICKET_ASSIGNED',
      title: 'You have a new ticket',
    });

    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });
});

describe('notifyTicketCreated', () => {
  it('notifies assignee when ticket has assignedToId', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ email: 'assignee@example.com' });

    await notifyTicketCreated(TENANT_ID, baseTicket, USER_A);

    // Should look up assignee email
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: USER_B, tenantId: TENANT_ID },
      select: { email: true },
    });

    // Should create notification for assignee
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_B,
        type: 'TICKET_ASSIGNED',
        title: 'Ticket TKT-42 assigned to you',
        body: 'Printer not working',
        resourceId: 'ticket-1',
        resource: 'ticket',
      }),
    });

    // Should enqueue email with assignee address
    expect(mockEmailQueue.add).toHaveBeenCalledWith('send-email', {
      tenantId: TENANT_ID,
      to: 'assignee@example.com',
      templateName: 'ticket-assigned',
      variables: {
        ticketNumber: '42',
        ticketTitle: 'Printer not working',
        ticketId: 'ticket-1',
      },
    });
  });

  it('does not notify when assignee is the creator', async () => {
    const ticket = { ...baseTicket, assignedToId: USER_A };

    await notifyTicketCreated(TENANT_ID, ticket, USER_A);

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });
});

describe('notifyTicketCommented', () => {
  it('notifies requester on PUBLIC comment', async () => {
    const comment = { id: 'comment-1', visibility: 'PUBLIC' };
    // actor is the assignee (USER_B), so requester (USER_A) should be notified
    mockPrisma.user.findMany.mockResolvedValue([{ id: USER_A, email: 'requester@example.com' }]);

    await notifyTicketCommented(TENANT_ID, { ...baseTicket, assignedToId: null }, comment, USER_B);

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_A,
        type: 'TICKET_COMMENTED',
        title: 'New comment on TKT-42',
      }),
    });
  });

  it('notifies assignee on comment (if not the commenter)', async () => {
    const comment = { id: 'comment-1', visibility: 'INTERNAL' };
    // actor is some other user, assignee should be notified
    // Internal comment: requester should NOT be notified, only assignee
    mockPrisma.user.findMany.mockResolvedValue([{ id: USER_B, email: 'assignee@example.com' }]);

    await notifyTicketCommented(TENANT_ID, baseTicket, comment, USER_A);

    // Assignee (USER_B) should be notified
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_B,
        type: 'TICKET_COMMENTED',
      }),
    });

    // Only assignee notified since it's INTERNAL (requester excluded)
    // and actor is USER_A (the requester), so only USER_B remains
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
  });
});

describe('markAllRead', () => {
  it('marks all unread notifications as read for user', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

    await markAllRead(TENANT_ID, USER_A);

    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, userId: USER_A, isRead: false },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });
});
