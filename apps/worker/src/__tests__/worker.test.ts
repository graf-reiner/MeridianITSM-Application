import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock the Redis connection to avoid requiring a running Redis instance
vi.mock('../queues/connection.js', () => ({
  redisConnection: {
    on: vi.fn(),
    quit: vi.fn(),
    disconnect: vi.fn(),
  },
  bullmqConnection: {
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  },
}));

// Mock BullMQ Queue to avoid Redis connections
vi.mock('bullmq', () => {
  class MockQueue {
    add = vi.fn();
    close = vi.fn();
    constructor(_name: string, _opts?: unknown) {}
  }
  class MockWorker {
    on = vi.fn();
    close = vi.fn();
    constructor(_name: string, _processor: unknown, _opts?: unknown) {}
  }
  return {
    Queue: MockQueue,
    Worker: MockWorker,
  };
});

describe('Worker Tenant Assertion', () => {
  let assertTenantId: (jobId: string | undefined, data: unknown) => asserts data is { tenantId: string };

  beforeAll(async () => {
    const mod = await import('../queues/definitions.js');
    assertTenantId = mod.assertTenantId;
  });

  it('passes when tenantId is present', () => {
    expect(() => assertTenantId('job-1', { tenantId: 'uuid-123' })).not.toThrow();
  });

  it('throws when tenantId is missing', () => {
    expect(() => assertTenantId('job-2', { foo: 'bar' })).toThrow('missing tenantId');
  });

  it('throws when data is null', () => {
    expect(() => assertTenantId('job-3', null)).toThrow('missing tenantId');
  });

  it('throws when data is undefined', () => {
    expect(() => assertTenantId('job-4', undefined)).toThrow('missing tenantId');
  });

  it('throws when tenantId is not a string', () => {
    expect(() => assertTenantId('job-5', { tenantId: 123 })).toThrow('missing tenantId');
  });
});
