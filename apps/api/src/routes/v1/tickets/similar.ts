import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Similar Ticket Suggestions REST API routes.
 *
 * GET /api/v1/tickets/:id/similar   — Find similar tickets based on title/description
 * GET /api/v1/tickets/similar?q=... — Find similar tickets by free text (for ticket creation)
 */
export async function similarTicketRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /api/v1/tickets/:id/similar ──────────────────────────────────────

  fastify.get('/api/v1/tickets/:id/similar', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const { limit = '5' } = request.query as { limit?: string };

    const ticket = await prisma.ticket.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, title: true, description: true, tags: true, categoryId: true },
    });

    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });

    const similar = await findSimilarTickets(
      user.tenantId,
      ticket.title,
      ticket.description,
      ticket.tags,
      ticket.categoryId,
      id,
      Number(limit),
    );

    return reply.status(200).send(similar);
  });

  // ─── GET /api/v1/tickets/similar?q=... ────────────────────────────────────

  fastify.get('/api/v1/tickets/similar', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { q, limit = '5', categoryId } = request.query as { q?: string; limit?: string; categoryId?: string };

    if (!q || q.trim().length < 3) {
      return reply.status(200).send([]);
    }

    const similar = await findSimilarTickets(
      user.tenantId,
      q,
      null,
      [],
      categoryId ?? null,
      null,
      Number(limit),
    );

    return reply.status(200).send(similar);
  });
}

/**
 * Find similar tickets using keyword matching + optional category + tag matching.
 */
async function findSimilarTickets(
  tenantId: string,
  title: string,
  description: string | null,
  tags: string[],
  categoryId: string | null,
  excludeTicketId: string | null,
  limit: number,
) {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'not', 'this', 'that', 'from', 'are', 'was', 'has', 'have', 'can', 'will', 'how', 'what', 'when', 'where', 'who', 'why', 'ticket', 'issue', 'problem', 'request', 'help', 'need', 'please']);

  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  if (words.length === 0 && tags.length === 0) return [];

  // Build search conditions
  const searchConditions: unknown[] = [];

  for (const word of words.slice(0, 5)) {
    searchConditions.push(
      { title: { contains: word, mode: 'insensitive' } },
    );
  }

  // Tag matching
  if (tags.length > 0) {
    searchConditions.push({ tags: { hasSome: tags } });
  }

  // Category matching (same category = more likely related)
  if (categoryId) {
    searchConditions.push({ categoryId });
  }

  if (searchConditions.length === 0) return [];

  const where: Record<string, unknown> = {
    tenantId,
    OR: searchConditions,
    status: { notIn: ['CANCELLED'] },
  };

  if (excludeTicketId) {
    where.id = { not: excludeTicketId };
  }

  const tickets = await prisma.ticket.findMany({
    where: where as any,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      priority: true,
      type: true,
      categoryId: true,
      tags: true,
      createdAt: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 2, // Fetch extra to re-rank
  });

  // Simple relevance scoring
  const scored = tickets.map(t => {
    let score = 0;
    const tTitle = t.title.toLowerCase();

    for (const word of words) {
      if (tTitle.includes(word)) score += 2;
    }

    // Category match bonus
    if (categoryId && t.categoryId === categoryId) score += 3;

    // Tag overlap bonus
    if (tags.length > 0) {
      const overlap = t.tags.filter(tag => tags.includes(tag)).length;
      score += overlap * 2;
    }

    // Recent tickets slightly preferred
    const daysSinceCreated = (Date.now() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated < 7) score += 1;

    return { ...t, _score: score };
  });

  // Sort by score descending and return top results
  return scored
    .filter(t => t._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);
}
