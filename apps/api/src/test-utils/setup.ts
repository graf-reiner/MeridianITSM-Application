import { vi } from 'vitest';

/**
 * Shared test utilities for MeridianITSM API tests.
 * Provides mock Prisma client, test context factory, and mock Redis.
 */

// ---------------------------------------------------------------------------
// Mock Prisma client
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = ReturnType<typeof vi.fn>;

export const mockPrisma: Record<string, Record<string, AnyFn> | AnyFn> = {
  ticket: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  ticketComment: {
    create: vi.fn(),
  },
  ticketActivity: {
    create: vi.fn(),
  },
  notification: {
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  knowledgeArticle: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test context factory
// ---------------------------------------------------------------------------

export interface TestContext {
  tenantId: string;
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    systemRole: string;
  };
}

export function createTestContext(overrides: Partial<TestContext> = {}): TestContext {
  return {
    tenantId: 'test-tenant-id',
    userId: 'test-user-id',
    user: {
      id: 'test-user-id',
      email: 'admin@test.local',
      firstName: 'Test',
      lastName: 'Admin',
      systemRole: 'admin',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Redis client
// ---------------------------------------------------------------------------

export const mockRedis: Record<string, AnyFn> = {
  sismember: vi.fn(),
  sadd: vi.fn(),
  expire: vi.fn(),
};
