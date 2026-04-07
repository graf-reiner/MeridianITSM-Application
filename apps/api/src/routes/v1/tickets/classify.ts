import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * AI Ticket Classification REST API routes.
 *
 * POST /api/v1/tickets/classify — Suggest category, priority, and queue based on ticket content
 *
 * Uses historical ticket data to find the most common classification for similar content.
 * This is a lightweight, rule-based approach. For full AI classification,
 * integrate with the AI chat infrastructure.
 */
export async function ticketClassifyRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post('/api/v1/tickets/classify', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { title, description } = request.body as { title: string; description?: string };

    if (!title || title.trim().length < 3) {
      return reply.status(400).send({ error: 'title is required (min 3 chars)' });
    }

    // Extract keywords from input
    const stopWords = new Set(['the', 'and', 'for', 'with', 'not', 'this', 'that', 'from', 'are', 'was', 'has', 'have', 'can', 'will', 'how', 'what', 'when', 'where', 'who', 'why', 'ticket', 'issue', 'problem', 'request', 'help', 'need', 'please']);
    const text = `${title} ${description ?? ''}`.toLowerCase();
    const words = text
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.has(w));

    if (words.length === 0) {
      return reply.status(200).send({ suggestions: null });
    }

    // Find similar recent tickets (last 90 days) with resolved/closed status
    const searchConditions = words.slice(0, 5).map(word => ({
      title: { contains: word, mode: 'insensitive' as const },
    }));

    const since = new Date();
    since.setDate(since.getDate() - 90);

    const similarTickets = await prisma.ticket.findMany({
      where: {
        tenantId: user.tenantId,
        OR: searchConditions as any,
        status: { in: ['RESOLVED', 'CLOSED'] },
        createdAt: { gte: since },
      },
      select: {
        categoryId: true,
        priority: true,
        queueId: true,
        type: true,
        category: { select: { id: true, name: true } },
        queue: { select: { id: true, name: true } },
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    if (similarTickets.length === 0) {
      return reply.status(200).send({ suggestions: null, confidence: 'none', sampleSize: 0 });
    }

    // Find most common category
    const categoryCounts = new Map<string, { count: number; name: string }>();
    const priorityCounts = new Map<string, number>();
    const queueCounts = new Map<string, { count: number; name: string }>();
    const typeCounts = new Map<string, number>();

    for (const t of similarTickets) {
      if (t.categoryId && t.category) {
        const existing = categoryCounts.get(t.categoryId) ?? { count: 0, name: t.category.name };
        existing.count++;
        categoryCounts.set(t.categoryId, existing);
      }
      priorityCounts.set(t.priority, (priorityCounts.get(t.priority) ?? 0) + 1);
      if (t.queueId && t.queue) {
        const existing = queueCounts.get(t.queueId) ?? { count: 0, name: t.queue.name };
        existing.count++;
        queueCounts.set(t.queueId, existing);
      }
      typeCounts.set(t.type, (typeCounts.get(t.type) ?? 0) + 1);
    }

    // Find top picks
    const topCategory = [...categoryCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    const topPriority = [...priorityCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const topQueue = [...queueCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    const topType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    const confidence = similarTickets.length >= 10 ? 'high' : similarTickets.length >= 3 ? 'medium' : 'low';

    return reply.status(200).send({
      suggestions: {
        category: topCategory ? { id: topCategory[0], name: topCategory[1].name, matchCount: topCategory[1].count } : null,
        priority: topPriority ? { value: topPriority[0], matchCount: topPriority[1] } : null,
        queue: topQueue ? { id: topQueue[0], name: topQueue[1].name, matchCount: topQueue[1].count } : null,
        type: topType ? { value: topType[0], matchCount: topType[1] } : null,
      },
      confidence,
      sampleSize: similarTickets.length,
    });
  });
}
