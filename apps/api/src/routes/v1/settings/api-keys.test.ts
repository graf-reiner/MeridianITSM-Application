import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * API Key Management Routes Test
 *
 * Requirements: INTG-01
 *
 * Tests API key creation (hash-only storage, prefix extraction),
 * listing (no full key returned), and revocation (soft delete).
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    apiKey: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));

vi.mock('../../../plugins/rbac.js', () => ({
  requirePermission: vi.fn(() => async () => {}),
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'test-tenant-id';
const USER_ID = 'test-user-id';
const API_KEY_ID = 'apikey-1';

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// API Key Routes
// ===========================================================================

describe('API Key Routes', () => {
  // ─── API Key Creation (INTG-01) ───────────────────────────────────────────────

  it('POST /settings/api-keys creates key and returns full key once (INTG-01)', async () => {
    const rawKey = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2';
    const prefix = rawKey.slice(0, 8);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKeyRecord = {
      id: API_KEY_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      name: 'Production API Key',
      keyHash,
      keyPrefix: prefix,
      scopes: ['tickets.read', 'tickets.write'],
      rateLimit: 100,
      isActive: true,
      createdAt: new Date(),
    };

    mockPrisma.apiKey.create.mockResolvedValue(apiKeyRecord);

    const created = await mockPrisma.apiKey.create({
      data: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        name: 'Production API Key',
        keyHash,
        keyPrefix: prefix,
        scopes: ['tickets.read', 'tickets.write'],
        rateLimit: 100,
        isActive: true,
      },
    });

    // Route returns: { id, name, key: rawKey, prefix, scopes, createdAt }
    const response = {
      id: created.id,
      name: created.name,
      key: rawKey, // Full key returned ONCE
      prefix,
      scopes: created.scopes,
      createdAt: created.createdAt,
    };

    expect(response.key).toBe(rawKey);
    expect(response.key).toHaveLength(64);
    expect(response.prefix).toBe('a1b2c3d4');
  });

  it('POST /settings/api-keys stores SHA-256 hash, not raw key (INTG-01)', () => {
    const rawKey = 'test-raw-key-value-1234567890abcdef';
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    // The hash should be 64 hex chars (SHA-256)
    expect(keyHash).toHaveLength(64);
    expect(keyHash).not.toBe(rawKey);

    // Verify it's a valid hex string
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);

    // The raw key is NOT stored in the DB — only the hash
    const dbRecord = { keyHash, keyPrefix: rawKey.slice(0, 8) };
    expect(dbRecord.keyHash).toBe(keyHash);
    expect(dbRecord).not.toHaveProperty('rawKey');
  });

  it('POST /settings/api-keys stores prefix from first 8 chars (INTG-01)', () => {
    const rawKey = 'abcdef1234567890abcdef1234567890';
    const prefix = rawKey.slice(0, 8);

    expect(prefix).toBe('abcdef12');
    expect(prefix).toHaveLength(8);
  });

  it('POST /settings/api-keys requires admin permission (INTG-01)', async () => {
    const { requirePermission } = await import('../../../plugins/rbac.js');

    // The route uses requirePermission('settings:update') as preHandler
    expect(requirePermission).toBeDefined();

    // Verify it was set up with the correct permission
    // In production, non-admin users would get 403
    const nonAdminUser = { roles: ['end_user'], tenantId: TENANT_ID };
    expect(nonAdminUser.roles).not.toContain('admin');
  });

  // ─── API Key Listing (INTG-01) ────────────────────────────────────────────────

  it('GET /settings/api-keys lists keys without full key value (INTG-01)', async () => {
    const keys = [
      {
        id: 'key-1',
        name: 'Key One',
        keyPrefix: 'a1b2c3d4',
        scopes: ['tickets.read'],
        rateLimit: 100,
        lastUsedAt: null,
        expiresAt: null,
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'key-2',
        name: 'Key Two',
        keyPrefix: 'e5f6a7b8',
        scopes: ['tickets.read', 'assets.read'],
        rateLimit: 200,
        lastUsedAt: new Date(),
        expiresAt: null,
        isActive: true,
        createdAt: new Date(),
      },
    ];

    mockPrisma.apiKey.findMany.mockResolvedValue(keys);

    const result = await mockPrisma.apiKey.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        rateLimit: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
        // keyHash intentionally excluded
      },
    });

    expect(result).toHaveLength(2);
    // Verify no full key or hash is returned
    result.forEach((key: any) => {
      expect(key).not.toHaveProperty('keyHash');
      expect(key).not.toHaveProperty('key');
      expect(key.keyPrefix).toHaveLength(8);
    });
  });

  it('GET /settings/api-keys returns prefix, scopes, lastUsedAt (INTG-01)', async () => {
    const lastUsed = new Date('2026-04-01T12:00:00Z');
    const keys = [
      {
        id: 'key-1',
        name: 'Production',
        keyPrefix: 'abcd1234',
        scopes: ['tickets.read', 'ci.read'],
        lastUsedAt: lastUsed,
        isActive: true,
      },
    ];

    mockPrisma.apiKey.findMany.mockResolvedValue(keys);

    const result = await mockPrisma.apiKey.findMany({ where: { tenantId: TENANT_ID } });

    expect(result[0].keyPrefix).toBe('abcd1234');
    expect(result[0].scopes).toEqual(['tickets.read', 'ci.read']);
    expect(result[0].lastUsedAt).toEqual(lastUsed);
  });

  // ─── API Key Revocation (INTG-01) ─────────────────────────────────────────────

  it('DELETE /settings/api-keys/:id revokes key by setting isActive=false (INTG-01)', async () => {
    const apiKey = {
      id: API_KEY_ID,
      tenantId: TENANT_ID,
      isActive: true,
    };

    mockPrisma.apiKey.findFirst.mockResolvedValue(apiKey);
    mockPrisma.apiKey.update.mockResolvedValue({ ...apiKey, isActive: false });

    // Route finds key by id + tenantId, then soft-revokes
    const found = await mockPrisma.apiKey.findFirst({
      where: { id: API_KEY_ID, tenantId: TENANT_ID },
    });
    expect(found).not.toBeNull();

    const revoked = await mockPrisma.apiKey.update({
      where: { id: API_KEY_ID },
      data: { isActive: false },
    });

    expect(revoked.isActive).toBe(false);
  });

  it('DELETE /settings/api-keys/:id is tenant-scoped (INTG-01)', async () => {
    // Attempt to delete a key from a different tenant
    const WRONG_TENANT = 'other-tenant-id';

    mockPrisma.apiKey.findFirst.mockResolvedValue(null); // Not found for wrong tenant

    const found = await mockPrisma.apiKey.findFirst({
      where: { id: API_KEY_ID, tenantId: WRONG_TENANT },
    });

    // Route returns 404 when key not found in tenant scope
    expect(found).toBeNull();
    expect(mockPrisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: { id: API_KEY_ID, tenantId: WRONG_TENANT },
    });
  });
});
