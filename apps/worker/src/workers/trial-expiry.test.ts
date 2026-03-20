import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @meridian/db prisma client
vi.mock('@meridian/db', () => ({
  prisma: {
    tenantSubscription: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    tenant: {
      update: vi.fn(),
    },
  },
}));

// Mock ioredis to prevent real Redis connections in tests
// Must use class syntax — ioredis Redis is used as a constructor
vi.mock('ioredis', () => {
  class RedisMock {
    del = vi.fn().mockResolvedValue(1);
    on = vi.fn();
    connect = vi.fn().mockResolvedValue(undefined);
    quit = vi.fn().mockResolvedValue(undefined);
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue('OK');
  }
  return { Redis: RedisMock };
});

// Mock bullmq Worker and Queue to prevent real connections
// Must use class syntax — both Worker and Queue are used as constructors
vi.mock('bullmq', () => {
  const queueAddMock = vi.fn().mockResolvedValue({ id: 'job-id' });

  class WorkerMock {
    private _handler: (job: unknown) => Promise<void>;
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);

    constructor(_name: string, handler: (job: unknown) => Promise<void>, _opts?: unknown) {
      this._handler = handler;
      WorkerMock.lastHandler = handler;
    }

    static lastHandler: ((job: unknown) => Promise<void>) | undefined;
  }

  class QueueMock {
    add = queueAddMock;
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);

    static addMock = queueAddMock;
  }

  return { Worker: WorkerMock, Queue: QueueMock };
});

// Import mocked prisma after mocks are configured
const { prisma } = await import('@meridian/db');

// Import bullmq to access the QueueMock static addMock spy
const { Queue } = await import('bullmq');
const QueueClass = Queue as unknown as { addMock: ReturnType<typeof vi.fn> };

/**
 * Extracts the Worker handler that was registered during module import.
 * The WorkerMock stores it in a static property.
 */
async function runHandler(): Promise<void> {
  const { Worker } = await import('bullmq');
  const WorkerClass = Worker as unknown as { lastHandler?: (job: unknown) => Promise<void> };
  const handler = WorkerClass.lastHandler;
  if (!handler) throw new Error('Worker handler not set — ensure trial-expiry.ts was imported');
  return handler({});
}

// Trigger worker module import (registers the Worker constructor side-effect)
await import('./trial-expiry.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSub(tenantId: string, trialEnd: Date) {
  return {
    tenantId,
    trialEnd,
    tenant: { name: `Tenant ${tenantId}` },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('trialExpiryWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suspends a tenant whose trial has expired (trialEnd < now)', async () => {
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const expiredSub = makeSub('tenant-expired', pastDate);

    // findMany: first call returns empty (no dunning), second returns expired sub
    vi.mocked(prisma.tenantSubscription.findMany)
      .mockResolvedValueOnce([]) // expiringSoon query
      .mockResolvedValueOnce([expiredSub]); // expired query

    vi.mocked(prisma.tenantSubscription.update).mockResolvedValue({} as never);
    vi.mocked(prisma.tenant.update).mockResolvedValue({} as never);

    await runHandler();

    // TenantSubscription status updated to SUSPENDED
    expect(prisma.tenantSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-expired' },
        data: { status: 'SUSPENDED' },
      }),
    );

    // Tenant status updated to SUSPENDED
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-expired' },
        data: expect.objectContaining({ status: 'SUSPENDED', suspendedAt: expect.any(Date) }),
      }),
    );
  });

  it('sends dunning email for tenant with trial expiring in 2 days', async () => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
    const expiringSub = makeSub('tenant-soon', soon);

    vi.mocked(prisma.tenantSubscription.findMany)
      .mockResolvedValueOnce([expiringSub]) // expiringSoon query
      .mockResolvedValueOnce([]); // expired query (none)

    await runHandler();

    // Should NOT suspend the tenant (no tenant.update or subscription.update for SUSPENDED)
    expect(prisma.tenantSubscription.update).not.toHaveBeenCalled();
    expect(prisma.tenant.update).not.toHaveBeenCalled();

    // Dunning email should be enqueued via emailNotificationQueue.add
    // QueueClass.addMock is the shared mock used by all QueueMock instances
    expect(QueueClass.addMock).toHaveBeenCalledWith(
      'trial-expiring',
      expect.objectContaining({
        tenantId: 'tenant-soon',
        type: 'trial-expiring',
      }),
    );
  });

  it('does not affect tenant with trial ending in 5 days (outside dunning window)', async () => {
    const farFuture = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
    const notYetSub = makeSub('tenant-future', farFuture);

    // 5 days from now is outside the 3-day dunning window — findMany returns empty for both queries
    vi.mocked(prisma.tenantSubscription.findMany)
      .mockResolvedValueOnce([]) // expiringSoon (5 days is > 3 days, not returned)
      .mockResolvedValueOnce([]); // expired (future date, not expired)

    // Verify the sub is indeed outside range — simulate correct DB filtering behavior
    expect(notYetSub.trialEnd.getTime()).toBeGreaterThan(Date.now() + 3 * 24 * 60 * 60 * 1000);

    await runHandler();

    expect(prisma.tenantSubscription.update).not.toHaveBeenCalled();
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('invalidates Redis plan cache when suspending tenant', async () => {
    const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    const expiredSub = makeSub('tenant-cache-test', pastDate);

    vi.mocked(prisma.tenantSubscription.findMany)
      .mockResolvedValueOnce([]) // expiringSoon
      .mockResolvedValueOnce([expiredSub]); // expired

    vi.mocked(prisma.tenantSubscription.update).mockResolvedValue({} as never);
    vi.mocked(prisma.tenant.update).mockResolvedValue({} as never);

    await runHandler();

    // Import the exported redis instance and verify del was called
    const { trialExpiryRedis } = await import('./trial-expiry.js');
    expect(trialExpiryRedis.del).toHaveBeenCalledWith('plan:tenant-cache-test');
  });
});
