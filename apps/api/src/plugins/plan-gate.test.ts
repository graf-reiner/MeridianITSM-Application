import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Mock redis BEFORE importing plan-gate
vi.mock('../lib/redis.js', () => ({
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
  },
}));

// Mock @meridian/db BEFORE importing plan-gate
vi.mock('@meridian/db', () => ({
  prisma: {
    tenantSubscription: {
      findUnique: vi.fn(),
    },
  },
}));

import { planGate, planGatePreHandler } from './plan-gate.js';
import { redis } from '../lib/redis.js';
import { prisma } from '@meridian/db';

// Helper to build a minimal FastifyRequest with a tenantId
function makeRequest(tenantId: string): FastifyRequest {
  return {
    user: { tenantId },
  } as unknown as FastifyRequest;
}

// Helper to build a tracked FastifyReply
function makeReply() {
  const reply = {
    _code: 200,
    _body: undefined as unknown,
    code(c: number) {
      this._code = c;
      return this;
    },
    status(c: number) {
      this._code = c;
      return this;
    },
    send(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return reply;
}

// Default plan data: ACTIVE STARTER with small limits
const STARTER_PLAN = {
  status: 'ACTIVE',
  tier: 'STARTER',
  limitsJson: {
    maxUsers: 5,
    maxAgents: 3,
    maxSites: 1,
    features: ['api_access'],
  },
};

const STARTER_DB_ROW = {
  status: 'ACTIVE',
  plan: {
    name: 'STARTER',
    limitsJson: STARTER_PLAN.limitsJson,
  },
};

function mockRedisCache(data: unknown | null) {
  (redis.get as Mock).mockResolvedValue(data ? JSON.stringify(data) : null);
}

function mockRedisMiss() {
  (redis.get as Mock).mockResolvedValue(null);
  (redis.setex as Mock).mockResolvedValue('OK');
}

function mockDbRow(row: unknown | null) {
  (prisma.tenantSubscription.findUnique as Mock).mockResolvedValue(row);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── planGatePreHandler (global status-only check) ───────────────────────────

describe('planGatePreHandler (global status check)', () => {
  it('passes when status is ACTIVE (cache hit)', async () => {
    mockRedisCache({ status: 'ACTIVE', limitsJson: STARTER_PLAN.limitsJson });
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await planGatePreHandler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(200); // untouched — request passed through
    expect(reply._body).toBeUndefined();
  });

  it('passes when status is TRIALING (cache hit)', async () => {
    mockRedisCache({ status: 'TRIALING', limitsJson: STARTER_PLAN.limitsJson });
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await planGatePreHandler(req, reply as unknown as FastifyReply);
    expect(reply._body).toBeUndefined();
  });

  it('returns 402 SUBSCRIPTION_INACTIVE when status is CANCELED (cache hit)', async () => {
    mockRedisCache({ status: 'CANCELED', limitsJson: STARTER_PLAN.limitsJson });
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await planGatePreHandler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(402);
    expect(reply._body).toMatchObject({ error: 'SUBSCRIPTION_INACTIVE', status: 'CANCELED' });
  });

  it('returns 402 SUBSCRIPTION_INACTIVE when status is SUSPENDED (cache hit)', async () => {
    mockRedisCache({ status: 'SUSPENDED', limitsJson: STARTER_PLAN.limitsJson });
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await planGatePreHandler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(402);
    expect(reply._body).toMatchObject({ error: 'SUBSCRIPTION_INACTIVE', status: 'SUSPENDED' });
  });

  it('returns 402 NO_SUBSCRIPTION when no TenantSubscription found (cache miss + DB miss)', async () => {
    mockRedisMiss();
    mockDbRow(null);
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await planGatePreHandler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(402);
    expect(reply._body).toMatchObject({ error: 'NO_SUBSCRIPTION' });
  });

  it('queries DB and caches in Redis when cache miss', async () => {
    mockRedisMiss();
    mockDbRow(STARTER_DB_ROW);
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await planGatePreHandler(req, reply as unknown as FastifyReply);
    expect(prisma.tenantSubscription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
    );
    expect(redis.setex).toHaveBeenCalledWith(
      'plan:tenant-1',
      60,
      expect.stringContaining('ACTIVE'),
    );
    expect(reply._body).toBeUndefined(); // passed through
  });

  it('uses cached value from Redis when available (no DB call)', async () => {
    mockRedisCache({ status: 'ACTIVE', limitsJson: STARTER_PLAN.limitsJson });
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await planGatePreHandler(req, reply as unknown as FastifyReply);
    expect(prisma.tenantSubscription.findUnique).not.toHaveBeenCalled();
  });
});

// ─── planGate (route-level resource check) ───────────────────────────────────

describe('planGate(resource, countFn) — numeric resources', () => {
  it('passes through when current count is below the limit', async () => {
    mockRedisCache({ status: 'ACTIVE', tier: 'STARTER', limitsJson: STARTER_PLAN.limitsJson });
    const countFn = vi.fn().mockResolvedValue(2); // 2 < 5
    const handler = planGate('users', countFn);
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._body).toBeUndefined();
  });

  it('returns 402 PLAN_LIMIT_EXCEEDED when current count equals the limit', async () => {
    mockRedisCache({ status: 'ACTIVE', tier: 'STARTER', limitsJson: STARTER_PLAN.limitsJson });
    const countFn = vi.fn().mockResolvedValue(5); // 5 >= 5
    const handler = planGate('users', countFn);
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(402);
    expect(reply._body).toMatchObject({
      error: 'PLAN_LIMIT_EXCEEDED',
      limit: 5,
      current: 5,
      feature: 'users',
      upgradeTier: 'PROFESSIONAL',
    });
  });

  it('returns 402 PLAN_LIMIT_EXCEEDED when current count exceeds the limit', async () => {
    mockRedisCache({ status: 'ACTIVE', tier: 'STARTER', limitsJson: STARTER_PLAN.limitsJson });
    const countFn = vi.fn().mockResolvedValue(7); // 7 >= 5
    const handler = planGate('users', countFn);
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(402);
    expect(reply._body).toMatchObject({ error: 'PLAN_LIMIT_EXCEEDED', limit: 5, current: 7 });
  });

  it('passes through when limit is -1 (unlimited)', async () => {
    const unlimitedLimits = { ...STARTER_PLAN.limitsJson, maxUsers: -1 };
    mockRedisCache({ status: 'ACTIVE', tier: 'ENTERPRISE', limitsJson: unlimitedLimits });
    const countFn = vi.fn().mockResolvedValue(9999);
    const handler = planGate('users', countFn);
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._body).toBeUndefined();
  });
});

describe('planGate(resource) — feature flags', () => {
  it('passes through when cmdb is in features array', async () => {
    const cmdbLimits = { ...STARTER_PLAN.limitsJson, features: ['api_access', 'cmdb'] };
    mockRedisCache({ status: 'ACTIVE', tier: 'PROFESSIONAL', limitsJson: cmdbLimits });
    const handler = planGate('cmdb');
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._body).toBeUndefined();
  });

  it('returns 402 PLAN_LIMIT_EXCEEDED when cmdb is NOT in features array', async () => {
    mockRedisCache({ status: 'ACTIVE', tier: 'STARTER', limitsJson: STARTER_PLAN.limitsJson });
    const handler = planGate('cmdb');
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(402);
    expect(reply._body).toMatchObject({
      error: 'PLAN_LIMIT_EXCEEDED',
      feature: 'cmdb',
      upgradeTier: 'PROFESSIONAL',
    });
  });

  it('returns 402 PLAN_LIMIT_EXCEEDED when mobile is NOT in features array', async () => {
    mockRedisCache({ status: 'ACTIVE', tier: 'STARTER', limitsJson: STARTER_PLAN.limitsJson });
    const handler = planGate('mobile');
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(402);
    expect(reply._body).toMatchObject({ error: 'PLAN_LIMIT_EXCEEDED', feature: 'mobile' });
  });
});

describe('planGate — subscription status checks', () => {
  it('returns 402 SUBSCRIPTION_INACTIVE when status is CANCELED', async () => {
    mockRedisCache({ status: 'CANCELED', tier: 'STARTER', limitsJson: STARTER_PLAN.limitsJson });
    const handler = planGate('users', vi.fn().mockResolvedValue(1));
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(402);
    expect(reply._body).toMatchObject({ error: 'SUBSCRIPTION_INACTIVE', status: 'CANCELED' });
  });

  it('returns 402 SUBSCRIPTION_INACTIVE when status is SUSPENDED', async () => {
    mockRedisCache({ status: 'SUSPENDED', tier: 'STARTER', limitsJson: STARTER_PLAN.limitsJson });
    const handler = planGate('users', vi.fn().mockResolvedValue(1));
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(402);
    expect(reply._body).toMatchObject({ error: 'SUBSCRIPTION_INACTIVE', status: 'SUSPENDED' });
  });

  it('passes through when status is ACTIVE', async () => {
    mockRedisCache({ status: 'ACTIVE', tier: 'STARTER', limitsJson: STARTER_PLAN.limitsJson });
    const countFn = vi.fn().mockResolvedValue(1);
    const handler = planGate('users', countFn);
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._body).toBeUndefined();
  });

  it('passes through when status is TRIALING', async () => {
    mockRedisCache({ status: 'TRIALING', tier: 'STARTER', limitsJson: STARTER_PLAN.limitsJson });
    const countFn = vi.fn().mockResolvedValue(1);
    const handler = planGate('users', countFn);
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._body).toBeUndefined();
  });

  it('returns 402 NO_SUBSCRIPTION when no TenantSubscription found', async () => {
    mockRedisMiss();
    mockDbRow(null);
    const handler = planGate('users', vi.fn().mockResolvedValue(1));
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(402);
    expect(reply._body).toMatchObject({ error: 'NO_SUBSCRIPTION' });
  });
});

describe('planGate — Redis cache behavior', () => {
  it('uses cached value from Redis when available (no DB call)', async () => {
    mockRedisCache({ status: 'ACTIVE', tier: 'STARTER', limitsJson: STARTER_PLAN.limitsJson });
    const handler = planGate('users', vi.fn().mockResolvedValue(1));
    const req = makeRequest('tenant-cache');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(redis.get).toHaveBeenCalledWith('plan:tenant-cache');
    expect(prisma.tenantSubscription.findUnique).not.toHaveBeenCalled();
  });

  it('queries DB and caches in Redis on cache miss', async () => {
    mockRedisMiss();
    mockDbRow(STARTER_DB_ROW);
    const handler = planGate('users', vi.fn().mockResolvedValue(1));
    const req = makeRequest('tenant-miss');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(redis.get).toHaveBeenCalledWith('plan:tenant-miss');
    expect(prisma.tenantSubscription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-miss' } }),
    );
    expect(redis.setex).toHaveBeenCalledWith('plan:tenant-miss', 60, expect.any(String));
  });
});

describe('planGate — 402 response body structure', () => {
  it('includes limit, current, feature, upgradeTier in the 402 body', async () => {
    mockRedisCache({ status: 'ACTIVE', tier: 'STARTER', limitsJson: STARTER_PLAN.limitsJson });
    const countFn = vi.fn().mockResolvedValue(3); // 3 >= maxAgents(3)
    const handler = planGate('agents', countFn);
    const req = makeRequest('tenant-1');
    const reply = makeReply();
    await handler(req, reply as unknown as FastifyReply);
    expect(reply._code).toBe(402);
    const body = reply._body as Record<string, unknown>;
    expect(body.error).toBe('PLAN_LIMIT_EXCEEDED');
    expect(body.limit).toBe(3);
    expect(body.current).toBe(3);
    expect(body.feature).toBe('agents');
    expect(body.upgradeTier).toBe('PROFESSIONAL');
  });
});
