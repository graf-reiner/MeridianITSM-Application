import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@meridian/db', () => ({
  prisma: {
    tenant: {
      findMany: vi.fn(),
    },
    application: {
      findMany: vi.fn(),
    },
    cmdbConfigurationItem: {
      findFirst: vi.fn(),
    },
    cmdbRelationship: {
      findMany: vi.fn(),
    },
    cmdbCiEndpoint: {
      findMany: vi.fn(),
    },
    userGroupMember: {
      findMany: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
  },
}));

// In-memory Redis substitute so we can verify dedup behavior
const redisStore = new Map<string, string>();

vi.mock('ioredis', () => {
  class RedisMock {
    on = vi.fn();
    quit = vi.fn().mockResolvedValue(undefined);
    async get(key: string) {
      return redisStore.get(key) ?? null;
    }
    async set(key: string, value: string, ..._args: unknown[]) {
      redisStore.set(key, value);
      return 'OK';
    }
    async del(key: string) {
      return redisStore.delete(key) ? 1 : 0;
    }
  }
  return { Redis: RedisMock };
});

vi.mock('bullmq', () => {
  class WorkerMock {
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);

    constructor(_name: string, handler: (job: unknown) => Promise<void>, _opts?: unknown) {
      WorkerMock.lastHandler = handler;
    }

    static lastHandler: ((job: unknown) => Promise<void>) | undefined;
  }

  class QueueMock {
    add = vi.fn();
    on = vi.fn();
    close = vi.fn().mockResolvedValue(undefined);
  }

  return { Worker: WorkerMock, Queue: QueueMock };
});

const { prisma } = await import('@meridian/db');

// Trigger worker module import (registers Worker constructor side effect)
await import('./cert-expiry-monitor.js');

async function runHandler() {
  const { Worker } = await import('bullmq');
  const WorkerClass = Worker as unknown as {
    lastHandler?: (job: unknown) => Promise<void>;
  };
  const handler = WorkerClass.lastHandler;
  if (!handler) throw new Error('Worker handler not set');
  return handler({ id: 'test-job' });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const APP_ID = 'app-1';
const PRIMARY_CI = 'ci-primary';
const ENDPOINT_CI = 'ci-endpoint';
const OWNER_USER = 'user-owner';

function setupSingleEndpoint(daysUntilExpiry: number, tenantId = TENANT_A) {
  vi.mocked(prisma.tenant.findMany).mockResolvedValue([
    { id: tenantId, slug: tenantId, status: 'ACTIVE' } as any,
  ]);
  vi.mocked(prisma.application.findMany).mockResolvedValue([
    { id: APP_ID, name: 'Test App', primaryCiId: PRIMARY_CI } as any,
  ]);
  vi.mocked(prisma.cmdbConfigurationItem.findFirst).mockResolvedValue({
    id: PRIMARY_CI,
    businessOwnerId: OWNER_USER,
    technicalOwnerId: null,
    supportGroupId: null,
  } as any);
  vi.mocked(prisma.cmdbRelationship.findMany).mockResolvedValue([
    { sourceId: PRIMARY_CI, targetId: ENDPOINT_CI } as any,
  ]);
  const expiry = new Date(Date.now() + daysUntilExpiry * 86400000);
  vi.mocked(prisma.cmdbCiEndpoint.findMany).mockResolvedValue([
    {
      url: 'https://acme.test',
      certificateExpiryDate: expiry,
      certificateIssuer: "Let's Encrypt",
      ci: { id: ENDPOINT_CI, name: 'acme-cert', isDeleted: false },
    } as any,
  ]);
  vi.mocked(prisma.userGroupMember.findMany).mockResolvedValue([]);
  vi.mocked(prisma.notification.createMany).mockResolvedValue({ count: 1 } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  redisStore.clear();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('cert-expiry-monitor worker', () => {
  it('does not fire when expiry is more than 60 days out', async () => {
    setupSingleEndpoint(90);

    await runHandler();

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(redisStore.size).toBe(0);
  });

  it('fires NOTICE (60) when 50 days remain', async () => {
    setupSingleEndpoint(50);

    await runHandler();

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    expect(redisStore.get(`cert-alert:${TENANT_A}:${ENDPOINT_CI}`)).toBe('60');
  });

  it('fires expired alert when daysUntilExpiry is negative', async () => {
    setupSingleEndpoint(-3);

    await runHandler();

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    expect(redisStore.get(`cert-alert:${TENANT_A}:${ENDPOINT_CI}`)).toBe('expired');
  });

  it('dedup: same threshold does not re-fire on subsequent runs', async () => {
    setupSingleEndpoint(50);

    await runHandler(); // first fire — NOTICE (60)
    await runHandler(); // should be deduped

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it('escalates: progresses 60 → 30 → 14 → 7 → expired across runs', async () => {
    // 50 days → fires '60'
    setupSingleEndpoint(50);
    await runHandler();
    expect(redisStore.get(`cert-alert:${TENANT_A}:${ENDPOINT_CI}`)).toBe('60');

    // 25 days → fires '30'
    setupSingleEndpoint(25);
    await runHandler();
    expect(redisStore.get(`cert-alert:${TENANT_A}:${ENDPOINT_CI}`)).toBe('30');

    // 10 days → fires '14'
    setupSingleEndpoint(10);
    await runHandler();
    expect(redisStore.get(`cert-alert:${TENANT_A}:${ENDPOINT_CI}`)).toBe('14');

    // 3 days → fires '7'
    setupSingleEndpoint(3);
    await runHandler();
    expect(redisStore.get(`cert-alert:${TENANT_A}:${ENDPOINT_CI}`)).toBe('7');

    // -1 day → fires 'expired'
    setupSingleEndpoint(-1);
    await runHandler();
    expect(redisStore.get(`cert-alert:${TENANT_A}:${ENDPOINT_CI}`)).toBe('expired');

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(5);
  });

  it('does NOT re-fire less-severe threshold (e.g. 30 after 14 already fired)', async () => {
    // First fire: 14
    setupSingleEndpoint(10);
    await runHandler();
    expect(redisStore.get(`cert-alert:${TENANT_A}:${ENDPOINT_CI}`)).toBe('14');

    // Now days bumps back up to 25 (cert was renewed partially? testing
    // boundary). Threshold becomes '30' which is LESS severe than '14'.
    // The worker should not re-fire — the last-fired marker stays at '14'.
    setupSingleEndpoint(25);
    await runHandler();
    expect(redisStore.get(`cert-alert:${TENANT_A}:${ENDPOINT_CI}`)).toBe('14');
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it('per-tenant isolation: dedup keys are scoped by tenantId', async () => {
    // Tenant A fires
    setupSingleEndpoint(50, TENANT_A);
    await runHandler();
    expect(redisStore.get(`cert-alert:${TENANT_A}:${ENDPOINT_CI}`)).toBe('60');

    // Tenant B independently fires for the same CI id (different tenants
    // can have the same CI id space — keys must be tenant-scoped)
    setupSingleEndpoint(50, TENANT_B);
    await runHandler();
    expect(redisStore.get(`cert-alert:${TENANT_B}:${ENDPOINT_CI}`)).toBe('60');

    // Both keys exist independently
    expect(redisStore.size).toBe(2);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(2);
  });

  it('skips tenants with no Applications', async () => {
    vi.mocked(prisma.tenant.findMany).mockResolvedValue([
      { id: TENANT_A, slug: TENANT_A, status: 'ACTIVE' } as any,
    ]);
    vi.mocked(prisma.application.findMany).mockResolvedValue([]);

    await runHandler();

    expect(prisma.cmdbConfigurationItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('skips when no recipients are configured (no owners or support group)', async () => {
    setupSingleEndpoint(10);
    // Override owners to all null
    vi.mocked(prisma.cmdbConfigurationItem.findFirst).mockResolvedValue({
      id: PRIMARY_CI,
      businessOwnerId: null,
      technicalOwnerId: null,
      supportGroupId: null,
    } as any);

    await runHandler();

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    // Importantly, the dedup key is also NOT set when no notification is
    // sent — this means once an owner is configured, the alert WILL fire.
    expect(redisStore.size).toBe(0);
  });
});
