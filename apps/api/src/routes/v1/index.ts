import type { FastifyInstance } from 'fastify';

/**
 * V1 API routes — protected scope (requires JWT + tenant + RBAC).
 * Feature routes will be registered here in Phase 2+.
 */
export async function v1Routes(app: FastifyInstance): Promise<void> {
  // Placeholder — feature routes registered in later phases
  app.get('/api/v1/status', async () => ({
    status: 'ok',
    version: 'v1',
  }));
}
