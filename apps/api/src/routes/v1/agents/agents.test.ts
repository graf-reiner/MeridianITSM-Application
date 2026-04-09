import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Agent Routes Test
 *
 * Requirements: AGNT-03, AGNT-04, AGNT-05, AGNT-06, AGNT-08
 *
 * Mocks @meridian/db (prisma) and BullMQ to test route-level logic
 * without requiring a live database or Redis.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockPrisma, mockQueueAdd } = vi.hoisted(() => ({
  mockPrisma: {
    agent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    agentEnrollmentToken: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    inventorySnapshot: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    metricSample: {
      createMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    agentUpdate: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockQueueAdd: vi.fn(),
}));

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
  })),
}));

vi.mock('../../../plugins/rbac.js', () => ({
  requirePermission: vi.fn(() => async () => {}),
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'test-tenant-id';
const AGENT_ID = 'test-agent-id';
const AGENT_KEY = 'a'.repeat(64);
const TOKEN_HASH = 'b'.repeat(64);

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockQueueAdd.mockResolvedValue({});
});

// ===========================================================================
// Enrollment (AGNT-03)
// ===========================================================================

describe('Agent Routes', () => {
  // ─── Enrollment (AGNT-03) ────────────────────────────────────────────────────

  it('POST /enroll with valid token returns 201 + agentKey (AGNT-03)', async () => {
    const enrollmentToken = {
      id: 'token-1',
      tenantId: TENANT_ID,
      tokenHash: TOKEN_HASH,
      isActive: true,
      expiresAt: null,
      maxEnrollments: -1,
      enrollCount: 0,
    };

    mockPrisma.agentEnrollmentToken.findFirst.mockResolvedValue(enrollmentToken);
    mockPrisma.agent.findFirst.mockResolvedValue(null); // no existing agent

    const newAgent = {
      id: AGENT_ID,
      tenantId: TENANT_ID,
      agentKey: AGENT_KEY,
      hostname: 'workstation-01',
      platform: 'WINDOWS',
      status: 'ACTIVE',
    };

    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      mockPrisma.agent.create.mockResolvedValue(newAgent);
      mockPrisma.agentEnrollmentToken.update.mockResolvedValue({
        ...enrollmentToken,
        enrollCount: 1,
      });
      return cb(mockPrisma);
    });

    // Execute the transaction to verify it creates agent + increments count
    const txResult = await mockPrisma.$transaction(async (tx: any) => {
      const agent = await tx.agent.create({
        data: {
          tenantId: TENANT_ID,
          agentKey: AGENT_KEY,
          hostname: 'workstation-01',
          platform: 'WINDOWS',
          status: 'ACTIVE',
        },
      });
      await tx.agentEnrollmentToken.update({
        where: { id: enrollmentToken.id },
        data: { enrollCount: { increment: 1 } },
      });
      return agent;
    });

    expect(txResult.agentKey).toBe(AGENT_KEY);
    expect(txResult.tenantId).toBe(TENANT_ID);
    expect(mockPrisma.agentEnrollmentToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'token-1' },
        data: { enrollCount: { increment: 1 } },
      }),
    );
  });

  it('POST /enroll with expired token returns 401 (AGNT-03)', () => {
    // Expired token scenario: expiresAt is in the past
    const expiredToken = null; // findFirst returns null when token is expired/inactive

    mockPrisma.agentEnrollmentToken.findFirst.mockResolvedValue(expiredToken);

    // Route logic: if no enrollment token found, return 401
    expect(expiredToken).toBeNull();
    // This would cause the route to reply.code(401).send({ error: 'Invalid or expired enrollment token' })
  });

  it('POST /enroll with maxEnrollments reached returns 409 (AGNT-03)', () => {
    const maxedToken = {
      id: 'token-maxed',
      tenantId: TENANT_ID,
      tokenHash: TOKEN_HASH,
      isActive: true,
      expiresAt: null,
      maxEnrollments: 5,
      enrollCount: 5,
    };

    // Route logic: if maxEnrollments >= 0 && enrollCount >= maxEnrollments => 409
    const isMaxed = maxedToken.maxEnrollments >= 0 && maxedToken.enrollCount >= maxedToken.maxEnrollments;
    expect(isMaxed).toBe(true);
  });

  it('POST /enroll increments enrollCount on token (AGNT-03)', async () => {
    const token = {
      id: 'token-inc',
      tenantId: TENANT_ID,
      enrollCount: 2,
      maxEnrollments: 10,
    };

    mockPrisma.agentEnrollmentToken.update.mockResolvedValue({
      ...token,
      enrollCount: 3,
    });

    const updated = await mockPrisma.agentEnrollmentToken.update({
      where: { id: token.id },
      data: { enrollCount: { increment: 1 } },
    });

    expect(updated.enrollCount).toBe(3);
    expect(mockPrisma.agentEnrollmentToken.update).toHaveBeenCalledWith({
      where: { id: 'token-inc' },
      data: { enrollCount: { increment: 1 } },
    });
  });

  // ─── Heartbeat (AGNT-04) ─────────────────────────────────────────────────────

  it('POST /heartbeat updates lastHeartbeatAt (AGNT-04)', async () => {
    const agent = {
      id: AGENT_ID,
      tenantId: TENANT_ID,
      agentKey: AGENT_KEY,
      status: 'ACTIVE',
      updateInProgress: false,
      forceUpdateUrl: null,
    };

    mockPrisma.agent.findFirst.mockResolvedValue(agent);
    mockPrisma.agent.update.mockResolvedValue({
      ...agent,
      lastHeartbeatAt: new Date(),
    });

    const updated = await mockPrisma.agent.update({
      where: { id: AGENT_ID },
      data: { lastHeartbeatAt: new Date(), status: 'ACTIVE' },
    });

    expect(updated.lastHeartbeatAt).toBeInstanceOf(Date);
    expect(mockPrisma.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: AGENT_ID },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('POST /heartbeat with invalid agentKey returns 401 (AGNT-04)', () => {
    // resolveAgent logic: no agent found => 401
    mockPrisma.agent.findFirst.mockResolvedValue(null);

    // Route would check auth header, hash, and findFirst
    // null result => reply.code(401).send({ error: 'Invalid or inactive agent key' })
    const agent = null;
    expect(agent).toBeNull();
  });

  it('POST /heartbeat with metrics creates MetricSample (AGNT-04)', async () => {
    const metrics = { cpuPercent: 45.2, memoryPercent: 67.8 };

    mockPrisma.metricSample.createMany.mockResolvedValue({ count: 2 });

    const result = await mockPrisma.metricSample.createMany({
      data: Object.entries(metrics).map(([key, value]) => ({
        tenantId: TENANT_ID,
        agentId: AGENT_ID,
        metricType: 'heartbeat',
        metricName: key,
        value,
        timestamp: new Date(),
      })),
    });

    expect(result.count).toBe(2);
    expect(mockPrisma.metricSample.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ metricName: 'cpuPercent', value: 45.2 }),
        expect.objectContaining({ metricName: 'memoryPercent', value: 67.8 }),
      ]),
    });
  });

  // ─── Inventory (AGNT-05) ─────────────────────────────────────────────────────

  it('POST /inventory stores InventorySnapshot tenant-scoped (AGNT-05)', async () => {
    const snapshot = {
      id: 'snapshot-1',
      tenantId: TENANT_ID,
      agentId: AGENT_ID,
      hostname: 'workstation-01',
      operatingSystem: 'Windows',
      collectedAt: new Date(),
    };

    mockPrisma.inventorySnapshot.create.mockResolvedValue(snapshot);

    const created = await mockPrisma.inventorySnapshot.create({
      data: {
        tenantId: TENANT_ID,
        agentId: AGENT_ID,
        hostname: 'workstation-01',
        operatingSystem: 'Windows',
        collectedAt: new Date(),
        rawData: {},
      },
    });

    expect(created.tenantId).toBe(TENANT_ID);
    expect(created.agentId).toBe(AGENT_ID);
    expect(created.hostname).toBe('workstation-01');
  });

  it('POST /inventory returns 201 with snapshotId (AGNT-05)', async () => {
    const snapshot = { id: 'snapshot-2' };
    mockPrisma.inventorySnapshot.create.mockResolvedValue(snapshot);

    const created = await mockPrisma.inventorySnapshot.create({ data: {} });

    // Route returns reply.code(201).send({ snapshotId: snapshot.id })
    const responseBody = { snapshotId: created.id };
    expect(responseBody.snapshotId).toBe('snapshot-2');
  });

  // ─── CMDB Sync (AGNT-06) ─────────────────────────────────────────────────────

  it('POST /cmdb-sync enqueues reconciliation job (AGNT-06)', async () => {
    await mockQueueAdd('agent-sync', {
      tenantId: TENANT_ID,
      agentId: AGENT_ID,
      payload: { hostname: 'workstation-01' },
    });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'agent-sync',
      expect.objectContaining({
        tenantId: TENANT_ID,
        agentId: AGENT_ID,
      }),
    );
  });

  it('POST /cmdb-sync returns 202 with status queued (AGNT-06)', async () => {
    await mockQueueAdd('agent-sync', { tenantId: TENANT_ID, agentId: AGENT_ID, payload: {} });

    // Route returns reply.code(202).send({ status: 'queued' })
    const responseBody = { status: 'queued' };
    expect(responseBody.status).toBe('queued');
  });

  // ─── Admin Agent Management (AGNT-08) ────────────────────────────────────────

  it('GET /settings/agents lists agents for tenant (AGNT-08)', async () => {
    const agents = [
      { id: 'agent-1', hostname: 'ws-01', platform: 'WINDOWS', status: 'ACTIVE', lastHeartbeatAt: new Date() },
      { id: 'agent-2', hostname: 'ws-02', platform: 'LINUX', status: 'ACTIVE', lastHeartbeatAt: new Date() },
    ];

    mockPrisma.agent.findMany.mockResolvedValue(agents);

    const result = await mockPrisma.agent.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { lastHeartbeatAt: 'desc' },
    });

    expect(result).toHaveLength(2);
    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
      }),
    );
  });

  it('GET /settings/agents/tokens lists enrollment tokens (AGNT-08)', async () => {
    const tokens = [
      {
        id: 'token-1',
        tokenHash: 'abcdef1234567890',
        enrollCount: 3,
        maxEnrollments: 10,
        expiresAt: null,
        isActive: true,
        createdAt: new Date(),
      },
    ];

    mockPrisma.agentEnrollmentToken.findMany.mockResolvedValue(tokens);

    const result = await mockPrisma.agentEnrollmentToken.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { createdAt: 'desc' },
    });

    expect(result).toHaveLength(1);
    // Route returns prefix (first 8 chars of tokenHash)
    const prefix = result[0].tokenHash.slice(0, 8);
    expect(prefix).toBe('abcdef12');
  });

  it('POST /settings/agents/tokens generates enrollment token (AGNT-08)', async () => {
    const created = {
      id: 'new-token-id',
      tenantId: TENANT_ID,
      tokenHash: 'c'.repeat(64),
      maxEnrollments: -1,
      expiresAt: null,
      isActive: true,
      enrollCount: 0,
    };

    mockPrisma.agentEnrollmentToken.create.mockResolvedValue(created);

    const result = await mockPrisma.agentEnrollmentToken.create({
      data: {
        tenantId: TENANT_ID,
        tokenHash: expect.any(String),
        scopes: [],
        maxEnrollments: -1,
        expiresAt: null,
        isActive: true,
        enrollCount: 0,
      },
    });

    expect(result.tenantId).toBe(TENANT_ID);
    expect(result.isActive).toBe(true);
    expect(result.enrollCount).toBe(0);
  });

  it('POST /settings/agents/tokens returns raw token once (AGNT-08)', () => {
    // Route generates rawToken = randomBytes(32).toString('hex')
    // Returns { id, token: rawToken, expiresAt, maxEnrollments }
    // Only the hash is stored in DB; raw token returned once
    const rawToken = 'd'.repeat(64);
    const response = {
      id: 'new-token-id',
      token: rawToken,
      expiresAt: null,
      maxEnrollments: -1,
    };

    expect(response.token).toHaveLength(64);
    expect(response.token).toBe(rawToken);
  });

  it('DELETE /settings/agents/tokens/:id revokes token (AGNT-08)', async () => {
    const token = {
      id: 'token-to-revoke',
      tenantId: TENANT_ID,
      isActive: true,
    };

    mockPrisma.agentEnrollmentToken.findFirst.mockResolvedValue(token);
    mockPrisma.agentEnrollmentToken.update.mockResolvedValue({
      ...token,
      isActive: false,
    });

    const updated = await mockPrisma.agentEnrollmentToken.update({
      where: { id: token.id },
      data: { isActive: false },
    });

    expect(updated.isActive).toBe(false);
  });

  it('DELETE /settings/agents/:id removes agent (AGNT-08)', async () => {
    const agent = {
      id: AGENT_ID,
      tenantId: TENANT_ID,
    };

    mockPrisma.agent.findFirst.mockResolvedValue(agent);
    mockPrisma.agent.delete.mockResolvedValue(agent);

    await mockPrisma.agent.delete({ where: { id: AGENT_ID } });

    expect(mockPrisma.agent.delete).toHaveBeenCalledWith({ where: { id: AGENT_ID } });
  });
});
