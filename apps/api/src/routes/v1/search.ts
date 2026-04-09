import type { FastifyInstance } from 'fastify';
import { searchContent, type SearchScope } from '../../services/ai-content-search.js';

/**
 * Global search endpoint.
 *
 * GET /api/v1/search?q=&scope=all|tickets|knowledge_articles|attachments&limit=20
 */
export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/v1/search', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { tenantId } = user;

    const query = request.query as {
      q?: string;
      scope?: string;
      limit?: string;
    };

    const q = query.q?.trim();
    if (!q || q.length < 2) {
      return reply.status(200).send({ results: [], total: 0 });
    }

    const scope = (['all', 'tickets', 'knowledge_articles', 'attachments'].includes(query.scope ?? '')
      ? query.scope
      : 'all') as SearchScope;

    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));

    const result = await searchContent(tenantId, q, scope, limit);
    return reply.status(200).send(result);
  });
}
