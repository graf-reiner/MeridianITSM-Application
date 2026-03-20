import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { blockImpersonationWrites } from './impersonation-guard.js';

function makeRequest(method: string, user: Record<string, unknown>): FastifyRequest {
  return {
    method,
    user,
  } as unknown as FastifyRequest;
}

function makeReply() {
  const reply = {
    _statusCode: 200,
    _body: null as unknown,
    code(statusCode: number) {
      this._statusCode = statusCode;
      return this;
    },
    send(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return reply as typeof reply & FastifyReply;
}

describe('blockImpersonationWrites', () => {
  it('POST request with readOnly: true user returns 403', async () => {
    const request = makeRequest('POST', { readOnly: true, tenantId: 'tenant-001' });
    const reply = makeReply();

    await blockImpersonationWrites(request, reply);

    expect(reply._statusCode).toBe(403);
    expect((reply._body as { error: string }).error).toBe('READ_ONLY_SESSION');
  });

  it('PUT request with impersonatedBy set returns 403', async () => {
    const request = makeRequest('PUT', { impersonatedBy: 'owner-001', tenantId: 'tenant-001' });
    const reply = makeReply();

    await blockImpersonationWrites(request, reply);

    expect(reply._statusCode).toBe(403);
    expect((reply._body as { error: string }).error).toBe('READ_ONLY_SESSION');
  });

  it('GET request with readOnly: true passes through (no block)', async () => {
    const request = makeRequest('GET', { readOnly: true, tenantId: 'tenant-001' });
    const reply = makeReply();

    await blockImpersonationWrites(request, reply);

    // Should not have set status to 403
    expect(reply._statusCode).toBe(200);
    expect(reply._body).toBeNull();
  });

  it('POST request without readOnly passes through', async () => {
    const request = makeRequest('POST', { tenantId: 'tenant-001', userId: 'user-001' });
    const reply = makeReply();

    await blockImpersonationWrites(request, reply);

    expect(reply._statusCode).toBe(200);
    expect(reply._body).toBeNull();
  });

  it('PATCH request with readOnly: true returns 403', async () => {
    const request = makeRequest('PATCH', { readOnly: true, tenantId: 'tenant-001' });
    const reply = makeReply();

    await blockImpersonationWrites(request, reply);

    expect(reply._statusCode).toBe(403);
  });

  it('DELETE request with impersonatedBy returns 403', async () => {
    const request = makeRequest('DELETE', { impersonatedBy: 'owner-001', tenantId: 'tenant-001' });
    const reply = makeReply();

    await blockImpersonationWrites(request, reply);

    expect(reply._statusCode).toBe(403);
  });
});
