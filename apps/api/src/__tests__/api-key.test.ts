import { describe, it, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../server.js';
import type { FastifyInstance } from 'fastify';

describe('API Key Authentication', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // Real test deferred: requires a protected Fastify route registered behind apiKeyPreHandler,
  // plus a mock prisma.apiKey.findFirst to exercise active / expired / inactive / missing / inactive-tenant paths.
  // Non-trivial test infrastructure — tracked in .planning/STATE.md "Tracked Follow-ups".
  // See apps/api/src/plugins/api-key.ts for the handler under test.
  it.todo('rejects request without API key header — real test tracked in STATE.md Tracked Follow-ups');
  it.todo('rejects request with malformed Authorization header (not ApiKey scheme)');
  it.todo('rejects request with unknown API key');
  it.todo('rejects request with inactive API key');
  it.todo('rejects request with expired API key');
  it.todo('rejects request when the owning tenant is not ACTIVE');
  it.todo('sets request.tenantId and request.apiKey on successful auth');
  it.todo('updates apiKey.lastUsedAt asynchronously without blocking the response');
});
