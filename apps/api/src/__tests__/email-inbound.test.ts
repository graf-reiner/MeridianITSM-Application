import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockRedis, mockPrisma, mockCreateTicket, mockAddComment, mockDecrypt, mockLogEmailActivity, MockImapFlow, mockSimpleParser } = vi.hoisted(() => {
  return {
    mockRedis: {
      sismember: vi.fn(),
      sadd: vi.fn(),
      expire: vi.fn(),
    },
    mockPrisma: {
      ticket: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
      },
      emailAccount: {
        update: vi.fn(),
      },
      emailPollJob: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      ticketAttachment: {
        create: vi.fn(),
      },
    },
    mockCreateTicket: vi.fn(),
    mockAddComment: vi.fn(),
    mockDecrypt: vi.fn(),
    mockLogEmailActivity: vi.fn(),
    MockImapFlow: vi.fn(),
    mockSimpleParser: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/redis.js', () => ({ redis: mockRedis }));
vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));
vi.mock('@meridian/core', () => ({
  decrypt: mockDecrypt,
  uploadFile: vi.fn(),
}));
vi.mock('../services/ticket.service.js', () => ({
  createTicket: mockCreateTicket,
  addComment: mockAddComment,
}));
vi.mock('../services/email-activity.service.js', () => ({
  logEmailActivity: mockLogEmailActivity,
}));
vi.mock('imapflow', () => ({
  ImapFlow: MockImapFlow,
}));
vi.mock('mailparser', () => ({
  simpleParser: mockSimpleParser,
}));

// Import after mocks
import { isDuplicate, markProcessed, findTicketByHeaders, findTicketBySubject, pollMailbox } from '../services/email-inbound.service.js';

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-001';

// ---------------------------------------------------------------------------
// isDuplicate
// ---------------------------------------------------------------------------

describe('isDuplicate', () => {
  it('returns false for new Message-ID and stores it in Redis', async () => {
    mockRedis.sismember.mockResolvedValue(0);

    const result = await isDuplicate(TENANT_ID, '<new@example.com>');

    expect(result).toBe(false);
    expect(mockRedis.sismember).toHaveBeenCalledWith(
      `email:msgids:${TENANT_ID}`,
      '<new@example.com>',
    );
  });

  it('returns true for already-seen Message-ID', async () => {
    mockRedis.sismember.mockResolvedValue(1);

    const result = await isDuplicate(TENANT_ID, '<seen@example.com>');

    expect(result).toBe(true);
    expect(mockRedis.sismember).toHaveBeenCalledWith(
      `email:msgids:${TENANT_ID}`,
      '<seen@example.com>',
    );
  });
});

// ---------------------------------------------------------------------------
// findTicketByHeaders
// ---------------------------------------------------------------------------

describe('findTicketByHeaders', () => {
  it('matches ticket via In-Reply-To header', async () => {
    const ticket = { id: 'tkt-1', ticketNumber: 10001 };
    mockPrisma.ticket.findFirst.mockResolvedValue(ticket);

    const result = await findTicketByHeaders(TENANT_ID, undefined, '<reply@example.com>');

    expect(result).toEqual(ticket);
    expect(mockPrisma.ticket.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT_ID,
        customFields: {
          path: ['outboundMessageIds'],
          array_contains: '<reply@example.com>',
        },
      },
      select: { id: true, ticketNumber: true },
    });
  });

  it('matches ticket via References header array', async () => {
    const ticket = { id: 'tkt-2', ticketNumber: 10002 };
    // First call (for inReplyTo) returns null, second (first ref) returns ticket
    mockPrisma.ticket.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(ticket);

    const result = await findTicketByHeaders(
      TENANT_ID,
      ['<ref1@example.com>', '<ref2@example.com>'],
      '<nope@example.com>',
    );

    expect(result).toEqual(ticket);
    // First searched In-Reply-To, then first reference
    expect(mockPrisma.ticket.findFirst).toHaveBeenCalledTimes(2);
  });

  it('returns null when no headers match', async () => {
    mockPrisma.ticket.findFirst.mockResolvedValue(null);

    const result = await findTicketByHeaders(TENANT_ID, ['<unknown@example.com>'], '<miss@example.com>');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findTicketBySubject
// ---------------------------------------------------------------------------

describe('findTicketBySubject', () => {
  it('extracts TKT-XXXXX from subject and finds ticket', async () => {
    const ticket = { id: 'tkt-3', ticketNumber: 12345 };
    mockPrisma.ticket.findFirst.mockResolvedValue(ticket);

    const result = await findTicketBySubject(TENANT_ID, 'Re: Issue with TKT-12345 urgent');

    expect(result).toEqual(ticket);
    expect(mockPrisma.ticket.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, ticketNumber: 12345 },
      select: { id: true, ticketNumber: true },
    });
  });

  it('returns null when subject has no ticket reference', async () => {
    const result = await findTicketBySubject(TENANT_ID, 'Hello, I need help');

    expect(result).toBeNull();
    expect(mockPrisma.ticket.findFirst).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pollMailbox
// ---------------------------------------------------------------------------

describe('pollMailbox', () => {
  // Helper to build a mock ImapFlow client
  function buildImapMock(messages: Array<{ uid: number; source: Buffer; }>) {
    const mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
      fetch: vi.fn().mockReturnValue((async function* () {
        for (const msg of messages) {
          yield msg;
        }
      })()),
      messageFlagsAdd: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      mailbox: { uidNext: 100 },
    };
    // Use mockImplementation with a function() constructor so `new ImapFlow()` works
    MockImapFlow.mockImplementation(function(this: any) {
      Object.assign(this, mockClient);
      return this;
    });
    return mockClient;
  }

  // Base account for all pollMailbox tests
  const baseAccount = {
    id: 'acc-1',
    tenantId: TENANT_ID,
    name: 'Support',
    emailAddress: 'support@example.com',
    imapHost: 'imap.example.com',
    imapPort: 993,
    imapSecure: true,
    imapUser: 'support@example.com',
    imapPasswordEnc: 'encrypted-pw',
    lastProcessedUid: 0,
    defaultQueueId: 'queue-1',
    defaultCategoryId: 'cat-1',
    pollInterval: 5,
  } as any;

  it('creates ticket from new unread email', async () => {
    const rawEmail = Buffer.from('Subject: New issue\r\nFrom: user@test.com\r\n\r\nHelp me');
    buildImapMock([{ uid: 1, source: rawEmail }]);

    mockSimpleParser.mockResolvedValue({
      messageId: '<new-msg@test.com>',
      subject: 'New issue',
      text: 'Help me',
      html: false,
      from: { value: [{ address: 'user@test.com' }] },
      inReplyTo: undefined,
      references: undefined,
      attachments: [],
    });

    mockDecrypt.mockReturnValue('decrypted-pw');
    mockRedis.sismember.mockResolvedValue(0); // not duplicate
    mockRedis.sadd.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);

    // No existing ticket found by headers or subject
    mockPrisma.ticket.findFirst.mockResolvedValue(null);
    // User lookup
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

    const createdTicket = { id: 'new-tkt-1', ticketNumber: 10001, customFields: {} };
    mockCreateTicket.mockResolvedValue(createdTicket);
    mockPrisma.ticket.update.mockResolvedValue(createdTicket);
    mockPrisma.emailAccount.update.mockResolvedValue({});
    mockPrisma.emailPollJob.upsert.mockResolvedValue({});

    const result = await pollMailbox(baseAccount);

    expect(result.newTickets).toBe(1);
    expect(result.comments).toBe(0);
    expect(mockCreateTicket).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        title: 'New issue',
        description: 'Help me',
        type: 'INCIDENT',
        priority: 'MEDIUM',
        source: 'EMAIL',
      }),
      null,
    );
  });

  it('appends comment to existing ticket for reply email', async () => {
    const rawEmail = Buffer.from('Subject: Re: TKT-00042\r\nFrom: user@test.com\r\n\r\nUpdate info');
    buildImapMock([{ uid: 5, source: rawEmail }]);

    mockSimpleParser.mockResolvedValue({
      messageId: '<reply-msg@test.com>',
      subject: 'Re: TKT-00042',
      text: 'Update info',
      html: false,
      from: { value: [{ address: 'user@test.com' }] },
      inReplyTo: '<original-msg@test.com>',
      references: ['<original-msg@test.com>'],
      attachments: [],
    });

    mockDecrypt.mockReturnValue('decrypted-pw');
    mockRedis.sismember.mockResolvedValue(0);
    mockRedis.sadd.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);

    // Header-based matching finds existing ticket
    const existingTicket = { id: 'tkt-42', ticketNumber: 42 };
    mockPrisma.ticket.findFirst.mockResolvedValue(existingTicket);
    mockAddComment.mockResolvedValue({});
    mockPrisma.emailAccount.update.mockResolvedValue({});
    mockPrisma.emailPollJob.upsert.mockResolvedValue({});

    const result = await pollMailbox(baseAccount);

    expect(result.comments).toBe(1);
    expect(result.newTickets).toBe(0);
    expect(mockAddComment).toHaveBeenCalledWith(
      TENANT_ID,
      'tkt-42',
      expect.objectContaining({ content: 'Update info', visibility: 'PUBLIC' }),
      null,
    );
  });

  it('skips duplicate Message-ID', async () => {
    const rawEmail = Buffer.from('Subject: Dup\r\nFrom: a@b.com\r\n\r\nbody');
    const mockClient = buildImapMock([{ uid: 10, source: rawEmail }]);

    mockSimpleParser.mockResolvedValue({
      messageId: '<dup@test.com>',
      subject: 'Dup',
      text: 'body',
      html: false,
      from: { value: [{ address: 'a@b.com' }] },
      inReplyTo: undefined,
      references: undefined,
      attachments: [],
    });

    mockDecrypt.mockReturnValue('decrypted-pw');
    mockRedis.sismember.mockResolvedValue(1); // duplicate!
    mockPrisma.emailAccount.update.mockResolvedValue({});
    mockPrisma.emailPollJob.upsert.mockResolvedValue({});

    const result = await pollMailbox(baseAccount);

    expect(result.newTickets).toBe(0);
    expect(result.comments).toBe(0);
    expect(mockCreateTicket).not.toHaveBeenCalled();
    expect(mockAddComment).not.toHaveBeenCalled();
  });
});
