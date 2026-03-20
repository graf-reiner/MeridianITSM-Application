import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../../plugins/rbac.js';
import {
  createArticle,
  updateArticle,
  getArticleList,
  getArticleDetail,
  voteArticle,
  getPublishedArticles,
  deleteArticle,
} from '../../../services/knowledge.service.js';

/**
 * Knowledge base REST API routes.
 *
 * GET    /api/v1/knowledge             — List articles (staff, all statuses)
 * GET    /api/v1/knowledge/published   — List published PUBLIC articles (portal)
 * POST   /api/v1/knowledge             — Create article (requires knowledge:write)
 * GET    /api/v1/knowledge/:id         — Get article detail (increments view count)
 * PATCH  /api/v1/knowledge/:id         — Update article (requires knowledge:write)
 * DELETE /api/v1/knowledge/:id         — Delete article (requires knowledge:write)
 * POST   /api/v1/knowledge/:id/vote    — Vote on article
 */
export async function knowledgeRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /api/v1/knowledge — Staff list (all statuses) ─────────────────────

  fastify.get('/api/v1/knowledge', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;

    const query = request.query as {
      status?: string;
      visibility?: string;
      search?: string;
      tags?: string;
      authorId?: string;
      page?: string;
      pageSize?: string;
    };

    const tags = query.tags
      ? query.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    const result = await getArticleList(tenantId, {
      status: query.status,
      visibility: query.visibility,
      search: query.search,
      tags,
      authorId: query.authorId,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });

    return reply.status(200).send(result);
  });

  // ─── GET /api/v1/knowledge/published — Portal view (PUBLIC + PUBLISHED) ─────

  fastify.get('/api/v1/knowledge/published', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;

    const query = request.query as {
      search?: string;
      tags?: string;
      page?: string;
      pageSize?: string;
    };

    const tags = query.tags
      ? query.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    const result = await getPublishedArticles(tenantId, {
      search: query.search,
      tags,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });

    return reply.status(200).send(result);
  });

  // ─── POST /api/v1/knowledge — Create article ────────────────────────────────

  fastify.post(
    '/api/v1/knowledge',
    { preHandler: [requirePermission('knowledge:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const authorId = user.userId;

      const body = request.body as {
        title: string;
        summary?: string;
        content: string;
        tags?: string[];
        visibility?: 'PUBLIC' | 'INTERNAL';
      };

      // Validate required fields
      if (!body.title || body.title.length < 1 || body.title.length > 500) {
        return reply
          .status(400)
          .send({ error: 'title is required and must be 1-500 characters' });
      }

      if (!body.content || body.content.length < 1) {
        return reply.status(400).send({ error: 'content is required' });
      }

      const article = await createArticle(tenantId, body, authorId);

      return reply.status(201).send(article);
    },
  );

  // ─── GET /api/v1/knowledge/:id — Get article detail ─────────────────────────

  fastify.get('/api/v1/knowledge/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;
    const { id } = request.params as { id: string };

    const article = await getArticleDetail(tenantId, id);

    if (!article) {
      return reply.status(404).send({ error: 'Article not found' });
    }

    return reply.status(200).send(article);
  });

  // ─── PATCH /api/v1/knowledge/:id — Update article ───────────────────────────

  fastify.patch(
    '/api/v1/knowledge/:id',
    { preHandler: [requirePermission('knowledge:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const actorId = user.userId;
      const { id } = request.params as { id: string };

      const body = request.body as {
        title?: string;
        summary?: string;
        content?: string;
        tags?: string[];
        visibility?: 'PUBLIC' | 'INTERNAL';
        status?: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'RETIRED';
      };

      // Validate title length if provided
      if (body.title !== undefined && (body.title.length < 1 || body.title.length > 500)) {
        return reply
          .status(400)
          .send({ error: 'title must be 1-500 characters' });
      }

      try {
        const article = await updateArticle(tenantId, id, body, actorId);

        if (!article) {
          return reply.status(404).send({ error: 'Article not found' });
        }

        return reply.status(200).send(article);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Invalid status transition')) {
          return reply.status(422).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // ─── DELETE /api/v1/knowledge/:id — Delete article ──────────────────────────

  fastify.delete(
    '/api/v1/knowledge/:id',
    { preHandler: [requirePermission('knowledge:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const deleted = await deleteArticle(tenantId, id);

      if (!deleted) {
        return reply.status(404).send({ error: 'Article not found' });
      }

      return reply.status(204).send();
    },
  );

  // ─── POST /api/v1/knowledge/:id/vote — Vote on article ──────────────────────

  fastify.post('/api/v1/knowledge/:id/vote', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;
    const { id } = request.params as { id: string };

    const body = request.body as { helpful: boolean };

    if (typeof body.helpful !== 'boolean') {
      return reply.status(400).send({ error: 'helpful must be a boolean' });
    }

    const helpfulCount = await voteArticle(tenantId, id, body.helpful);

    if (helpfulCount === null) {
      return reply.status(404).send({ error: 'Article not found' });
    }

    return reply.status(200).send({ helpfulCount });
  });
}
