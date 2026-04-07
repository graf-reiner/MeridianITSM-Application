import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Knowledge Base article suggestions for tickets.
 *
 * GET /api/v1/tickets/:id/kb-suggestions — Suggest KB articles based on ticket content
 * GET /api/v1/tickets/kb-suggest?q=...   — Suggest KB articles based on free text (for ticket creation)
 */
export async function kbSuggestionRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /api/v1/tickets/:id/kb-suggestions ───────────────────────────────

  fastify.get('/api/v1/tickets/:id/kb-suggestions', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const { limit = '5' } = request.query as { limit?: string };

    const ticket = await prisma.ticket.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { title: true, description: true, tags: true },
    });

    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    const suggestions = await searchArticles(
      user.tenantId,
      ticket.title,
      ticket.description,
      ticket.tags,
      Number(limit),
    );

    return reply.status(200).send(suggestions);
  });

  // ─── GET /api/v1/tickets/kb-suggest?q=... ─────────────────────────────────

  fastify.get('/api/v1/tickets/kb-suggest', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { q, limit = '5' } = request.query as { q?: string; limit?: string };

    if (!q || q.trim().length < 3) {
      return reply.status(200).send([]);
    }

    const suggestions = await searchArticles(
      user.tenantId,
      q,
      null,
      [],
      Number(limit),
    );

    return reply.status(200).send(suggestions);
  });
}

/**
 * Search for published KB articles matching ticket content.
 * Uses PostgreSQL full-text search via ILIKE + tag matching.
 */
async function searchArticles(
  tenantId: string,
  title: string,
  description: string | null,
  tags: string[],
  limit: number,
) {
  // Extract significant words from title (3+ chars, skip common words)
  const stopWords = new Set(['the', 'and', 'for', 'with', 'not', 'this', 'that', 'from', 'are', 'was', 'has', 'have', 'can', 'will', 'how', 'what', 'when', 'where', 'who', 'why']);
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  if (words.length === 0 && tags.length === 0) {
    return [];
  }

  // Build OR conditions for word matching
  const searchConditions: unknown[] = [];

  for (const word of words.slice(0, 5)) { // Max 5 keywords
    searchConditions.push(
      { title: { contains: word, mode: 'insensitive' } },
      { summary: { contains: word, mode: 'insensitive' } },
      { content: { contains: word, mode: 'insensitive' } },
    );
  }

  // Tag matching
  if (tags.length > 0) {
    searchConditions.push({ tags: { hasSome: tags } });
  }

  if (searchConditions.length === 0) return [];

  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      tenantId,
      status: 'PUBLISHED',
      OR: searchConditions as any,
    },
    select: {
      id: true,
      articleNumber: true,
      title: true,
      summary: true,
      tags: true,
      viewCount: true,
      helpfulCount: true,
    },
    orderBy: [{ helpfulCount: 'desc' }, { viewCount: 'desc' }],
    take: limit,
  });

  return articles;
}
