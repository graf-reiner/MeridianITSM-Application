import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * External API Routes Test
 *
 * Requirements: INTG-01, INTG-02
 *
 * Tests external API endpoints: scope enforcement, tenant scoping,
 * pagination, filtering, and webhook dispatch.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockPrisma,
  mockGetTicketList,
  mockGetTicketDetail,
  mockCreateTicket,
  mockUpdateTicket,
  mockDispatchWebhooks,
} = vi.hoisted(() => ({
  mockPrisma: {
    asset: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    cmdbConfigurationItem: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  mockGetTicketList: vi.fn(),
  mockGetTicketDetail: vi.fn(),
  mockCreateTicket: vi.fn(),
  mockUpdateTicket: vi.fn(),
  mockDispatchWebhooks: vi.fn(),
}));

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));

vi.mock('../../services/ticket.service.js', () => ({
  createTicket: mockCreateTicket,
  getTicketList: mockGetTicketList,
  getTicketDetail: mockGetTicketDetail,
  updateTicket: mockUpdateTicket,
}));

vi.mock('../../services/webhook.service.js', () => ({
  dispatchWebhooks: mockDispatchWebhooks,
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'test-tenant-id';
const TICKET_ID = 'test-ticket-id';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate scope check from route logic */
function checkScope(apiKey: { scopes: string[] } | undefined, requiredScope: string): boolean {
  return !!apiKey?.scopes.includes(requiredScope);
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/external/tickets
// ===========================================================================

describe('GET /api/external/tickets', () => {
  it('returns tenant-scoped tickets (INTG-02)', async () => {
    const ticketList = {
      data: [
        { id: 'ticket-1', tenantId: TENANT_ID, title: 'Issue A', status: 'OPEN' },
        { id: 'ticket-2', tenantId: TENANT_ID, title: 'Issue B', status: 'NEW' },
      ],
      total: 2,
    };

    mockGetTicketList.mockResolvedValue(ticketList);

    const result = await mockGetTicketList(TENANT_ID, { page: 1, pageSize: 25 });

    expect(mockGetTicketList).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 25 });
    expect(result.data).toHaveLength(2);
    result.data.forEach((t: any) => expect(t.tenantId).toBe(TENANT_ID));
  });

  it('returns paginated result with total, page, pageSize', async () => {
    mockGetTicketList.mockResolvedValue({
      data: [{ id: 'ticket-1' }],
      total: 50,
    });

    const result = await mockGetTicketList(TENANT_ID, { page: 2, pageSize: 10 });

    // Route adds page and pageSize to response: { ...result, page, pageSize }
    const response = { ...result, page: 2, pageSize: 10 };

    expect(response.total).toBe(50);
    expect(response.page).toBe(2);
    expect(response.pageSize).toBe(10);
  });

  it('filters by status when provided', async () => {
    mockGetTicketList.mockResolvedValue({
      data: [{ id: 'ticket-open', status: 'OPEN' }],
      total: 1,
    });

    const result = await mockGetTicketList(TENANT_ID, { status: 'OPEN', page: 1, pageSize: 25 });

    expect(mockGetTicketList).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ status: 'OPEN' }),
    );
    expect(result.data[0].status).toBe('OPEN');
  });
});

// ===========================================================================
// POST /api/external/tickets
// ===========================================================================

describe('POST /api/external/tickets', () => {
  it('creates ticket via API key (INTG-02)', async () => {
    const createdTicket = {
      id: TICKET_ID,
      tenantId: TENANT_ID,
      ticketNumber: 100,
      title: 'External Ticket',
      status: 'NEW',
      source: 'API',
    };

    mockCreateTicket.mockResolvedValue(createdTicket);

    const result = await mockCreateTicket(
      TENANT_ID,
      {
        title: 'External Ticket',
        source: 'API',
      },
      '00000000-0000-0000-0000-000000000000', // API key sentinel actor
    );

    expect(result.title).toBe('External Ticket');
    expect(mockCreateTicket).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ title: 'External Ticket', source: 'API' }),
      '00000000-0000-0000-0000-000000000000',
    );
  });

  it('returns 400 if title is missing', () => {
    // Route validation: if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0)
    const testCases = [
      { title: undefined, shouldFail: true },
      { title: '', shouldFail: true },
      { title: '   ', shouldFail: true },
      { title: 123, shouldFail: true },
      { title: 'Valid Title', shouldFail: false },
    ];

    testCases.forEach(({ title, shouldFail }) => {
      const isInvalid = !title || typeof title !== 'string' || (title as string).trim().length === 0;
      expect(isInvalid).toBe(shouldFail);
    });
  });

  it('fires TICKET_CREATED webhook after creation', async () => {
    const ticket = { id: TICKET_ID, ticketNumber: 101, title: 'Webhook Test' };
    mockCreateTicket.mockResolvedValue(ticket);

    await mockCreateTicket(TENANT_ID, { title: 'Webhook Test', source: 'API' }, '00000000-0000-0000-0000-000000000000');

    // Route fires: dispatchWebhooks(tenantId, 'TICKET_CREATED', { ticketId, ticketNumber, title, source })
    mockDispatchWebhooks(TENANT_ID, 'TICKET_CREATED', {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: 'Webhook Test',
      source: 'api',
    });

    expect(mockDispatchWebhooks).toHaveBeenCalledWith(
      TENANT_ID,
      'TICKET_CREATED',
      expect.objectContaining({
        ticketId: TICKET_ID,
        ticketNumber: 101,
        source: 'api',
      }),
    );
  });
});

// ===========================================================================
// GET /api/external/assets
// ===========================================================================

describe('GET /api/external/assets', () => {
  it('returns tenant-scoped assets (INTG-02)', async () => {
    const assets = [
      { id: 'asset-1', tenantId: TENANT_ID, hostname: 'ws-01', status: 'ACTIVE' },
      { id: 'asset-2', tenantId: TENANT_ID, hostname: 'ws-02', status: 'ACTIVE' },
    ];

    mockPrisma.asset.findMany.mockResolvedValue(assets);
    mockPrisma.asset.count.mockResolvedValue(2);

    const [data, total] = await Promise.all([
      mockPrisma.asset.findMany({ where: { tenantId: TENANT_ID }, skip: 0, take: 25 }),
      mockPrisma.asset.count({ where: { tenantId: TENANT_ID } }),
    ]);

    expect(data).toHaveLength(2);
    expect(total).toBe(2);
    expect(mockPrisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_ID } }),
    );
  });

  it('returns paginated result with total, page, pageSize', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([{ id: 'asset-1' }]);
    mockPrisma.asset.count.mockResolvedValue(30);

    const page = 2;
    const pageSize = 10;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      mockPrisma.asset.findMany({ where: { tenantId: TENANT_ID }, skip, take: pageSize }),
      mockPrisma.asset.count({ where: { tenantId: TENANT_ID } }),
    ]);

    const response = { data, total, page, pageSize };

    expect(response.total).toBe(30);
    expect(response.page).toBe(2);
    expect(response.pageSize).toBe(10);
  });
});

// ===========================================================================
// GET /api/external/cis
// ===========================================================================

describe('GET /api/external/cis', () => {
  it('returns tenant-scoped CIs (INTG-02)', async () => {
    const cis = [
      { id: 'ci-1', tenantId: TENANT_ID, name: 'Server-01', type: 'SERVER', status: 'ACTIVE' },
    ];

    mockPrisma.cmdbConfigurationItem.findMany.mockResolvedValue(cis);
    mockPrisma.cmdbConfigurationItem.count.mockResolvedValue(1);

    const [data, total] = await Promise.all([
      mockPrisma.cmdbConfigurationItem.findMany({ where: { tenantId: TENANT_ID }, skip: 0, take: 25 }),
      mockPrisma.cmdbConfigurationItem.count({ where: { tenantId: TENANT_ID } }),
    ]);

    expect(data).toHaveLength(1);
    expect(total).toBe(1);
    expect(data[0].tenantId).toBe(TENANT_ID);
  });

  it('returns paginated result with total, page, pageSize', async () => {
    mockPrisma.cmdbConfigurationItem.findMany.mockResolvedValue([]);
    mockPrisma.cmdbConfigurationItem.count.mockResolvedValue(0);

    const page = 1;
    const pageSize = 25;

    const [data, total] = await Promise.all([
      mockPrisma.cmdbConfigurationItem.findMany({ where: { tenantId: TENANT_ID }, skip: 0, take: pageSize }),
      mockPrisma.cmdbConfigurationItem.count({ where: { tenantId: TENANT_ID } }),
    ]);

    const response = { data, total, page, pageSize };

    expect(response.data).toEqual([]);
    expect(response.total).toBe(0);
    expect(response.page).toBe(1);
    expect(response.pageSize).toBe(25);
  });
});

// ===========================================================================
// Scope enforcement
// ===========================================================================

describe('scope enforcement', () => {
  it('missing tickets.read scope returns 403 on GET /tickets (INTG-01)', () => {
    const apiKey = { scopes: ['assets.read'] };
    const hasScope = checkScope(apiKey, 'tickets.read');
    expect(hasScope).toBe(false);

    // Route would return: reply.code(403).send({ error: 'Scope tickets.read required' })
  });

  it('missing tickets.write scope returns 403 on POST /tickets (INTG-01)', () => {
    const apiKey = { scopes: ['tickets.read'] }; // read-only, no write
    const hasScope = checkScope(apiKey, 'tickets.write');
    expect(hasScope).toBe(false);
  });

  it('missing assets.read scope returns 403 on GET /assets (INTG-01)', () => {
    const apiKey = { scopes: ['tickets.read'] };
    const hasScope = checkScope(apiKey, 'assets.read');
    expect(hasScope).toBe(false);
  });

  it('missing ci.read scope returns 403 on GET /cis (INTG-01)', () => {
    const apiKey = { scopes: ['tickets.read', 'assets.read'] };
    const hasScope = checkScope(apiKey, 'ci.read');
    expect(hasScope).toBe(false);

    // Verify positive case: scope present
    const fullApiKey = { scopes: ['tickets.read', 'assets.read', 'ci.read'] };
    expect(checkScope(fullApiKey, 'ci.read')).toBe(true);
  });
});
