import type { FastifyInstance } from 'fastify';

/**
 * External API routes — API key authenticated scope.
 * Agent endpoints and external integrations will be registered here.
 * Requires apiKeyPreHandler (registered on the enclosing scope in server.ts).
 */
export async function externalRoutes(app: FastifyInstance): Promise<void> {
  // Placeholder — agent/external routes registered in later phases
  app.get('/api/external/status', async () => ({
    status: 'ok',
    scope: 'external',
  }));
}
