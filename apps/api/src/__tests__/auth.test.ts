import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../server.js';
import type { FastifyInstance } from 'fastify';

describe('Auth Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/auth/login with invalid credentials returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nonexistent@test.com', password: 'wrongpass', tenantSlug: 'msp-default' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('GET /api/health returns 200', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBeDefined();
  });

  // TODO: Add test with valid credentials once DB is seeded in test setup
  // TODO: Add test verifying JWT payload contains tenantId, userId, roles
});
