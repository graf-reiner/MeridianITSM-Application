import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// Mock @meridian/db prisma client
vi.mock('@meridian/db', () => ({
  prisma: {
    stripeWebhookEvent: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    tenantSubscription: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock ioredis to prevent real Redis connections in tests
// Must use class syntax (not vi.fn) because ioredis Redis is used as constructor
vi.mock('ioredis', () => {
  class RedisMock {
    del = vi.fn().mockResolvedValue(1);
    on = vi.fn();
    connect = vi.fn().mockResolvedValue(undefined);
    quit = vi.fn().mockResolvedValue(undefined);
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue('OK');
    setex = vi.fn().mockResolvedValue('OK');
  }
  return { Redis: RedisMock };
});

// Mock bullmq Worker and Queue to prevent real connections
// Must use class syntax (not vi.fn) because both are used as constructors
vi.mock('bullmq', () => {
  class WorkerMock {
    private _handler: (job: unknown) => Promise<void>;
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);

    constructor(_name: string, handler: (job: unknown) => Promise<void>, _opts?: unknown) {
      this._handler = handler;
      // Store handler on the class so tests can access it
      WorkerMock.lastHandler = handler;
    }

    static lastHandler: ((job: unknown) => Promise<void>) | undefined;
  }

  class QueueMock {
    add = vi.fn().mockResolvedValue({ id: 'job-id' });
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  }

  return { Worker: WorkerMock, Queue: QueueMock };
});

// We need to import after mocks are set up
const { prisma } = await import('@meridian/db');

// Helper to create a fake BullMQ job
function makeJob(data: {
  eventId: string;
  eventType: string;
  payload: { data: { object: Record<string, unknown> } };
}): Job {
  return {
    id: 'test-job-id',
    data,
    log: vi.fn(),
    updateProgress: vi.fn(),
  } as unknown as Job;
}

// Extract the handler function from the WorkerMock static property
// We need to test the handler logic directly
async function runHandler(job: Job): Promise<void> {
  const { Worker } = await import('bullmq');
  // Access the static lastHandler which is set by the WorkerMock constructor
  const WorkerClass = Worker as unknown as { lastHandler?: (job: Job) => Promise<void> };
  const handler = WorkerClass.lastHandler;
  if (!handler) throw new Error('Worker handler not set — ensure stripe-webhook.ts was imported');
  return handler(job);
}

describe('stripeWebhookWorker — idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips already-processed event (processedAt is set)', async () => {
    vi.mocked(prisma.stripeWebhookEvent.findUnique).mockResolvedValueOnce({
      id: 'evt-uuid',
      stripeEventId: 'evt_already_processed',
      eventType: 'customer.subscription.updated',
      payload: null,
      receivedAt: new Date(),
      processedAt: new Date(), // Already processed
      errorMessage: null,
      createdAt: new Date(),
    });

    // Import the module to trigger Worker instantiation
    await import('./stripe-webhook.js');

    const job = makeJob({
      eventId: 'evt_already_processed',
      eventType: 'customer.subscription.updated',
      payload: { data: { object: {} } },
    });

    await runHandler(job);

    // Should NOT upsert, update, or process further
    expect(prisma.stripeWebhookEvent.upsert).not.toHaveBeenCalled();
    expect(prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
  });

  it('processes a new event: upserts, calls handler, marks processedAt', async () => {
    vi.mocked(prisma.stripeWebhookEvent.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.stripeWebhookEvent.upsert).mockResolvedValueOnce({
      id: 'evt-uuid',
      stripeEventId: 'evt_new',
      eventType: 'customer.subscription.updated',
      payload: null,
      receivedAt: new Date(),
      processedAt: null,
      errorMessage: null,
      createdAt: new Date(),
    });
    vi.mocked(prisma.tenantSubscription.findFirst).mockResolvedValueOnce({
      id: 'sub-uuid',
      tenantId: 'tenant-123',
      planId: 'plan-uuid',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      status: 'TRIALING',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.tenantSubscription.update).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.stripeWebhookEvent.update).mockResolvedValueOnce({} as never);

    await import('./stripe-webhook.js');

    const job = makeJob({
      eventId: 'evt_new',
      eventType: 'customer.subscription.updated',
      payload: {
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            cancel_at_period_end: false,
          },
        },
      },
    });

    await runHandler(job);

    expect(prisma.stripeWebhookEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeEventId: 'evt_new' },
      }),
    );
    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processedAt: expect.any(Date) }),
      }),
    );
  });
});

describe('stripeWebhookWorker — event routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockFoundSubscription = {
    id: 'sub-uuid',
    tenantId: 'tenant-456',
    planId: 'plan-uuid',
    stripeCustomerId: 'cus_456',
    stripeSubscriptionId: 'sub_456',
    status: 'ACTIVE',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    trialStart: null,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function setupBaseIdempotencyMocks() {
    vi.mocked(prisma.stripeWebhookEvent.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.stripeWebhookEvent.upsert).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.stripeWebhookEvent.update).mockResolvedValueOnce({} as never);
  }

  it('customer.subscription.updated routes to handleSubscriptionUpsert and sets status ACTIVE', async () => {
    setupBaseIdempotencyMocks();
    vi.mocked(prisma.tenantSubscription.findFirst).mockResolvedValueOnce(mockFoundSubscription as never);
    vi.mocked(prisma.tenantSubscription.update).mockResolvedValueOnce({} as never);

    await import('./stripe-webhook.js');

    const job = makeJob({
      eventId: 'evt_sub_updated',
      eventType: 'customer.subscription.updated',
      payload: {
        data: {
          object: {
            id: 'sub_456',
            customer: 'cus_456',
            status: 'active',
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            cancel_at_period_end: false,
          },
        },
      },
    });

    await runHandler(job);

    expect(prisma.tenantSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('customer.subscription.deleted sets status to CANCELED', async () => {
    setupBaseIdempotencyMocks();
    vi.mocked(prisma.tenantSubscription.findFirst).mockResolvedValueOnce(mockFoundSubscription as never);
    vi.mocked(prisma.tenantSubscription.update).mockResolvedValueOnce({} as never);

    await import('./stripe-webhook.js');

    const job = makeJob({
      eventId: 'evt_sub_deleted',
      eventType: 'customer.subscription.deleted',
      payload: {
        data: {
          object: {
            customer: 'cus_456',
          },
        },
      },
    });

    await runHandler(job);

    expect(prisma.tenantSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELED' }),
      }),
    );
  });

  it('invoice.payment_failed sets status to PAST_DUE', async () => {
    setupBaseIdempotencyMocks();
    vi.mocked(prisma.tenantSubscription.findFirst).mockResolvedValueOnce(mockFoundSubscription as never);
    vi.mocked(prisma.tenantSubscription.update).mockResolvedValueOnce({} as never);

    await import('./stripe-webhook.js');

    const job = makeJob({
      eventId: 'evt_payment_failed',
      eventType: 'invoice.payment_failed',
      payload: {
        data: {
          object: {
            customer: 'cus_456',
          },
        },
      },
    });

    await runHandler(job);

    expect(prisma.tenantSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAST_DUE' }),
      }),
    );
  });

  it('invoice.payment_succeeded sets status to ACTIVE', async () => {
    setupBaseIdempotencyMocks();
    vi.mocked(prisma.tenantSubscription.findFirst).mockResolvedValueOnce(mockFoundSubscription as never);
    vi.mocked(prisma.tenantSubscription.update).mockResolvedValueOnce({} as never);

    await import('./stripe-webhook.js');

    const job = makeJob({
      eventId: 'evt_payment_succeeded',
      eventType: 'invoice.payment_succeeded',
      payload: {
        data: {
          object: {
            customer: 'cus_456',
          },
        },
      },
    });

    await runHandler(job);

    expect(prisma.tenantSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('invalidates Redis plan cache key after subscription status change', async () => {
    setupBaseIdempotencyMocks();
    vi.mocked(prisma.tenantSubscription.findFirst).mockResolvedValueOnce(mockFoundSubscription as never);
    vi.mocked(prisma.tenantSubscription.update).mockResolvedValueOnce({} as never);

    const { stripeWebhookRedis } = await import('./stripe-webhook.js');

    const job = makeJob({
      eventId: 'evt_cache_invalidate',
      eventType: 'invoice.payment_failed',
      payload: {
        data: {
          object: {
            customer: 'cus_456',
          },
        },
      },
    });

    await runHandler(job);

    expect(stripeWebhookRedis.del).toHaveBeenCalledWith('plan:tenant-456');
  });

  it('saves errorMessage on stripeWebhookEvent when handler throws', async () => {
    setupBaseIdempotencyMocks();
    // Make findFirst throw an error to simulate handler failure
    vi.mocked(prisma.tenantSubscription.findFirst).mockRejectedValueOnce(
      new Error('DB connection lost'),
    );
    vi.mocked(prisma.stripeWebhookEvent.update).mockResolvedValue({} as never);

    await import('./stripe-webhook.js');

    const job = makeJob({
      eventId: 'evt_error',
      eventType: 'invoice.payment_failed',
      payload: {
        data: {
          object: {
            customer: 'cus_error',
          },
        },
      },
    });

    await expect(runHandler(job)).rejects.toThrow('DB connection lost');

    expect(prisma.stripeWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorMessage: 'DB connection lost' }),
      }),
    );
  });
});
