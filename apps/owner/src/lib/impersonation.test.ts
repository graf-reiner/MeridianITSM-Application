import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.IMPERSONATION_JWT_SECRET = 'test-impersonation-secret-32-chars-min';
});

describe('Impersonation token', () => {
  it('generateImpersonationToken produces a valid JWT', async () => {
    const { generateImpersonationToken } = await import('./impersonation');
    const token = await generateImpersonationToken('owner-001', 'tenant-001', 'owner@meridian.com');
    expect(token).toBeTruthy();
    // JWT format: three base64url parts separated by dots
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('token payload contains impersonatedBy, tenantId, readOnly: true', async () => {
    const { generateImpersonationToken } = await import('./impersonation');
    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(process.env.IMPERSONATION_JWT_SECRET);

    const token = await generateImpersonationToken('owner-001', 'tenant-001', 'owner@meridian.com');
    const { payload } = await jwtVerify(token, secret);

    expect(payload.impersonatedBy).toBe('owner-001');
    expect(payload.tenantId).toBe('tenant-001');
    expect(payload.readOnly).toBe(true);
  });

  it('token expires in 15 minutes (exp claim)', async () => {
    const { generateImpersonationToken } = await import('./impersonation');
    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(process.env.IMPERSONATION_JWT_SECRET);

    const beforeSign = Math.floor(Date.now() / 1000);
    const token = await generateImpersonationToken('owner-001', 'tenant-001', 'owner@meridian.com');
    const { payload } = await jwtVerify(token, secret);

    expect(payload.exp).toBeDefined();
    // exp should be approximately 15 minutes (900 seconds) from now
    const expectedExp = beforeSign + 15 * 60;
    expect(payload.exp!).toBeGreaterThanOrEqual(expectedExp - 5);
    expect(payload.exp!).toBeLessThanOrEqual(expectedExp + 5);
  });

  it('token can be verified with the same secret', async () => {
    const { generateImpersonationToken } = await import('./impersonation');
    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(process.env.IMPERSONATION_JWT_SECRET);

    const token = await generateImpersonationToken('owner-001', 'tenant-001', 'owner@meridian.com');

    // Should not throw
    const { payload } = await jwtVerify(token, secret);
    expect(payload).toBeTruthy();
  });
});
