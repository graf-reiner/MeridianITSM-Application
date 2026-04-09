import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      ticket: {
        count: vi.fn(),
        findMany: vi.fn(),
        groupBy: vi.fn(),
      },
      ticketActivity: {
        findMany: vi.fn(),
      },
      category: {
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));
vi.mock('csv-stringify/sync', () => ({
  stringify: vi.fn((rows: unknown[][], opts: { header: boolean; columns: string[] }) => {
    const header = opts.columns.join(',');
    const body = rows.map((r: unknown[]) => r.join(',')).join('\n');
    return `${header}\n${body}\n`;
  }),
}));
vi.mock('bullmq', () => ({ Queue: vi.fn() }));

// Import after mocks
import { getTicketReport, getSlaComplianceReport, getDashboardStats } from '../services/report.service.js';

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

const TENANT_ID = 'tenant-001';

// ---------------------------------------------------------------------------
// getTicketReport
// ---------------------------------------------------------------------------

describe('getTicketReport', () => {
  const sampleTickets = [
    {
      id: 'tkt-1',
      ticketNumber: 1,
      title: 'Test Ticket',
      status: 'OPEN',
      priority: 'HIGH',
      createdAt: new Date('2026-01-15T10:00:00Z'),
      resolvedAt: null,
      assignedTo: { firstName: 'John', lastName: 'Doe' },
      category: { name: 'Network' },
      queue: { name: 'IT Support' },
    },
    {
      id: 'tkt-2',
      ticketNumber: 2,
      title: 'Another Ticket',
      status: 'RESOLVED',
      priority: 'LOW',
      createdAt: new Date('2026-01-16T12:00:00Z'),
      resolvedAt: new Date('2026-01-17T08:00:00Z'),
      assignedTo: null,
      category: null,
      queue: null,
    },
  ];

  it('returns CSV format with correct headers', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue(sampleTickets);

    const result = await getTicketReport(TENANT_ID, { format: 'csv' });

    expect(result.format).toBe('csv');
    expect(result.count).toBe(2);
    expect(typeof result.data).toBe('string');
    // CSV header should contain expected column names
    const csv = result.data as string;
    expect(csv).toContain('Ticket Number');
    expect(csv).toContain('Title');
    expect(csv).toContain('Status');
    expect(csv).toContain('Priority');
    expect(csv).toContain('Assignee');
    expect(csv).toContain('Category');
    expect(csv).toContain('Created');
    expect(csv).toContain('Resolved');
  });

  it('returns JSON format with ticket data', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue(sampleTickets);

    const result = await getTicketReport(TENANT_ID, { format: 'json' });

    expect(result.format).toBe('json');
    expect(result.count).toBe(2);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toEqual(sampleTickets);
  });

  it('caps results at 5000 records', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([]);

    await getTicketReport(TENANT_ID, { format: 'json' });

    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5000 }),
    );
  });

  it('filters by date range', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([]);

    await getTicketReport(TENANT_ID, {
      format: 'json',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });

    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          createdAt: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-01-31'),
          },
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// getSlaComplianceReport
// ---------------------------------------------------------------------------

describe('getSlaComplianceReport', () => {
  it('calculates correct compliance rate', async () => {
    // 4 tickets with SLA, 1 breached (resolved after slaBreachAt)
    const tickets = [
      {
        priority: 'HIGH',
        createdAt: new Date('2026-01-10T08:00:00Z'),
        resolvedAt: new Date('2026-01-10T09:00:00Z'),
        firstResponseAt: new Date('2026-01-10T08:15:00Z'),
        slaBreachAt: new Date('2026-01-10T12:00:00Z'), // resolved before breach
      },
      {
        priority: 'HIGH',
        createdAt: new Date('2026-01-11T08:00:00Z'),
        resolvedAt: new Date('2026-01-11T14:00:00Z'),
        firstResponseAt: new Date('2026-01-11T08:30:00Z'),
        slaBreachAt: new Date('2026-01-11T12:00:00Z'), // resolved AFTER breach -> breached
      },
      {
        priority: 'MEDIUM',
        createdAt: new Date('2026-01-12T08:00:00Z'),
        resolvedAt: new Date('2026-01-12T10:00:00Z'),
        firstResponseAt: new Date('2026-01-12T08:20:00Z'),
        slaBreachAt: new Date('2026-01-12T16:00:00Z'), // resolved before breach
      },
      {
        priority: 'MEDIUM',
        createdAt: new Date('2026-01-13T08:00:00Z'),
        resolvedAt: new Date('2026-01-13T11:00:00Z'),
        firstResponseAt: null,
        slaBreachAt: new Date('2026-01-13T16:00:00Z'), // resolved before breach
      },
    ];

    mockPrisma.ticket.findMany.mockResolvedValue(tickets);

    const result = await getSlaComplianceReport(TENANT_ID, {});

    // 4 total, 1 breached -> compliance = (4-1)/4 * 100 = 75%
    expect(result.totalWithSla).toBe(4);
    expect(result.breachedCount).toBe(1);
    expect(result.complianceRate).toBe(75);
    expect(result.avgResponseMinutes).toBeTypeOf('number');
    expect(result.avgResolutionMinutes).toBeTypeOf('number');
  });

  it('returns per-priority breakdown', async () => {
    const tickets = [
      {
        priority: 'HIGH',
        createdAt: new Date('2026-01-10T08:00:00Z'),
        resolvedAt: new Date('2026-01-10T09:00:00Z'),
        firstResponseAt: new Date('2026-01-10T08:10:00Z'),
        slaBreachAt: new Date('2026-01-10T12:00:00Z'),
      },
      {
        priority: 'HIGH',
        createdAt: new Date('2026-01-11T08:00:00Z'),
        resolvedAt: new Date('2026-01-11T14:00:00Z'),
        firstResponseAt: new Date('2026-01-11T08:30:00Z'),
        slaBreachAt: new Date('2026-01-11T12:00:00Z'), // breached
      },
      {
        priority: 'LOW',
        createdAt: new Date('2026-01-12T08:00:00Z'),
        resolvedAt: new Date('2026-01-12T10:00:00Z'),
        firstResponseAt: new Date('2026-01-12T08:20:00Z'),
        slaBreachAt: new Date('2026-01-12T16:00:00Z'),
      },
    ];

    mockPrisma.ticket.findMany.mockResolvedValue(tickets);

    const result = await getSlaComplianceReport(TENANT_ID, {});

    expect(result.byPriority).toHaveLength(2); // HIGH and LOW

    const highPriority = result.byPriority.find((p) => p.priority === 'HIGH');
    expect(highPriority).toBeDefined();
    expect(highPriority!.total).toBe(2);
    expect(highPriority!.breached).toBe(1);
    expect(highPriority!.complianceRate).toBe(50);

    const lowPriority = result.byPriority.find((p) => p.priority === 'LOW');
    expect(lowPriority).toBeDefined();
    expect(lowPriority!.total).toBe(1);
    expect(lowPriority!.breached).toBe(0);
    expect(lowPriority!.complianceRate).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// getDashboardStats
// ---------------------------------------------------------------------------

describe('getDashboardStats', () => {
  it('returns total, open, resolved today, and overdue counts', async () => {
    // Mock the 6 parallel calls in order
    mockPrisma.ticket.count
      .mockResolvedValueOnce(150)  // totalTickets
      .mockResolvedValueOnce(42)   // openTickets
      .mockResolvedValueOnce(7)    // resolvedToday
      .mockResolvedValueOnce(3);   // overdueTickets

    mockPrisma.ticket.groupBy.mockResolvedValueOnce([
      { priority: 'HIGH', _count: { _all: 30 } },
      { priority: 'MEDIUM', _count: { _all: 80 } },
      { priority: 'LOW', _count: { _all: 40 } },
    ]);

    mockPrisma.ticketActivity.findMany.mockResolvedValue([
      { id: 'act-1', ticketId: 'tkt-1', actorId: 'u-1', activityType: 'STATUS_CHANGE', fieldName: 'status', oldValue: 'NEW', newValue: 'OPEN', createdAt: new Date() },
    ]);

    // volumeByDay raw query
    mockPrisma.$queryRaw.mockResolvedValue([
      { day: '2026-04-08', count: BigInt(5) },
      { day: '2026-04-09', count: BigInt(3) },
    ]);

    // topCategories groupBy
    mockPrisma.ticket.groupBy.mockResolvedValueOnce([
      { categoryId: 'cat-1', _count: { _all: 25 } },
    ]);

    // category name lookup
    mockPrisma.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Network' },
    ]);

    const result = await getDashboardStats(TENANT_ID);

    expect(result.totalTickets).toBe(150);
    expect(result.openTickets).toBe(42);
    expect(result.resolvedToday).toBe(7);
    expect(result.overdueTickets).toBe(3);
    expect(Array.isArray(result.volumeByDay)).toBe(true);
    expect(Array.isArray(result.volumeByPriority)).toBe(true);
    expect(Array.isArray(result.recentActivity)).toBe(true);
  });
});
