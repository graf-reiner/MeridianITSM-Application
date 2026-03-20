import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

  it('rejects request without API key header', async () => {
    // TODO: Register a protected API key route and test it
    // This test will be expanded when API key routes are added
    expect(true).toBe(true); // Placeholder
  });
});
