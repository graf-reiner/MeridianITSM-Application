import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * CSAT Survey REST API routes.
 *
 * Survey Templates (admin):
 *   GET    /api/v1/surveys/templates          — List survey templates
 *   POST   /api/v1/surveys/templates          — Create template
 *   PATCH  /api/v1/surveys/templates/:id      — Update template
 *   DELETE /api/v1/surveys/templates/:id      — Delete template
 *
 * Survey Responses:
 *   GET    /api/v1/surveys/ticket/:ticketId   — Get survey for a ticket (returns template + existing response)
 *   POST   /api/v1/surveys/respond            — Submit a survey response
 *
 * Reports:
 *   GET    /api/v1/surveys/stats              — CSAT aggregate stats
 */
export async function surveyRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /api/v1/surveys/templates — List templates ────────────────────────

  fastify.get('/api/v1/surveys/templates', async (request, reply) => {
    const user = request.user as { tenantId: string };

    const templates = await prisma.surveyTemplate.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return reply.status(200).send(templates);
  });

  // ─── POST /api/v1/surveys/templates — Create template ─────────────────────

  fastify.post('/api/v1/surveys/templates', async (request, reply) => {
    const user = request.user as { tenantId: string; roles: string[] };
    const body = request.body as {
      name: string;
      description?: string;
      questions: Array<{ id: string; type: string; label: string; required?: boolean; options?: unknown }>;
      isDefault?: boolean;
      trigger?: string;
    };

    if (!body.name || !body.questions || !Array.isArray(body.questions)) {
      return reply.status(400).send({ error: 'name and questions array are required' });
    }

    if (body.questions.length < 1 || body.questions.length > 5) {
      return reply.status(400).send({ error: 'Between 1 and 5 questions required' });
    }

    // If setting as default, unset current default
    if (body.isDefault) {
      await prisma.surveyTemplate.updateMany({
        where: { tenantId: user.tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.surveyTemplate.create({
      data: {
        tenantId: user.tenantId,
        name: body.name,
        description: body.description ?? null,
        questions: body.questions as any,
        isDefault: body.isDefault ?? false,
        trigger: body.trigger ?? 'RESOLVED',
      },
    });

    return reply.status(201).send(template);
  });

  // ─── PATCH /api/v1/surveys/templates/:id — Update template ────────────────

  fastify.patch('/api/v1/surveys/templates/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      description?: string;
      questions?: unknown[];
      isDefault?: boolean;
      isActive?: boolean;
      trigger?: string;
    };

    const existing = await prisma.surveyTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    if (body.isDefault) {
      await prisma.surveyTemplate.updateMany({
        where: { tenantId: user.tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.questions !== undefined) updates.questions = body.questions;
    if (body.isDefault !== undefined) updates.isDefault = body.isDefault;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.trigger !== undefined) updates.trigger = body.trigger;

    const template = await prisma.surveyTemplate.update({
      where: { id },
      data: updates,
    });

    return reply.status(200).send(template);
  });

  // ─── DELETE /api/v1/surveys/templates/:id ──────────────────────────────────

  fastify.delete('/api/v1/surveys/templates/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const existing = await prisma.surveyTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Template not found' });
    }

    await prisma.surveyTemplate.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ─── GET /api/v1/surveys/ticket/:ticketId — Get survey for ticket ─────────

  fastify.get('/api/v1/surveys/ticket/:ticketId', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { ticketId } = request.params as { ticketId: string };

    // Check if already responded
    const existingResponse = await prisma.surveyResponse.findUnique({
      where: { ticketId },
    });

    if (existingResponse) {
      return reply.status(200).send({ alreadyResponded: true, response: existingResponse });
    }

    // Get the default active template
    const template = await prisma.surveyTemplate.findFirst({
      where: { tenantId: user.tenantId, isDefault: true, isActive: true },
    });

    if (!template) {
      return reply.status(200).send({ available: false });
    }

    return reply.status(200).send({ available: true, template });
  });

  // ─── POST /api/v1/surveys/respond — Submit survey ─────────────────────────

  fastify.post('/api/v1/surveys/respond', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const body = request.body as {
      ticketId: string;
      templateId: string;
      answers: Array<{ questionId: string; value: unknown }>;
    };

    if (!body.ticketId || !body.templateId || !body.answers) {
      return reply.status(400).send({ error: 'ticketId, templateId, and answers are required' });
    }

    // Check not already responded
    const existing = await prisma.surveyResponse.findUnique({
      where: { ticketId: body.ticketId },
    });
    if (existing) {
      return reply.status(409).send({ error: 'Survey already submitted for this ticket' });
    }

    // Verify ticket belongs to tenant and user is the requester
    const ticket = await prisma.ticket.findFirst({
      where: { id: body.ticketId, tenantId: user.tenantId },
      select: { id: true, requestedById: true },
    });
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    // Extract overall rating from answers (first rating-type question)
    const template = await prisma.surveyTemplate.findFirst({
      where: { id: body.templateId, tenantId: user.tenantId },
    });
    let rating: number | null = null;
    let comment: string | null = null;

    if (template) {
      const questions = template.questions as Array<{ id: string; type: string }>;
      for (const q of questions) {
        const answer = body.answers.find(a => a.questionId === q.id);
        if (!answer) continue;
        if (q.type === 'rating' && rating === null && typeof answer.value === 'number') {
          rating = answer.value;
        }
        if (q.type === 'text' && comment === null && typeof answer.value === 'string') {
          comment = answer.value;
        }
      }
    }

    const response = await prisma.surveyResponse.create({
      data: {
        tenantId: user.tenantId,
        templateId: body.templateId,
        ticketId: body.ticketId,
        userId: user.userId,
        answers: body.answers as any,
        rating,
        comment,
      },
    });

    return reply.status(201).send(response);
  });

  // ─── GET /api/v1/surveys/stats — Aggregate CSAT stats ─────────────────────

  fastify.get('/api/v1/surveys/stats', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { days = '30' } = request.query as { days?: string };

    const since = new Date();
    since.setDate(since.getDate() - Number(days));

    const responses = await prisma.surveyResponse.findMany({
      where: {
        tenantId: user.tenantId,
        createdAt: { gte: since },
        rating: { not: null },
      },
      select: { rating: true },
    });

    const total = responses.length;
    const avgRating = total > 0
      ? responses.reduce((sum, r) => sum + (r.rating ?? 0), 0) / total
      : null;

    const satisfied = responses.filter(r => (r.rating ?? 0) >= 4).length;
    const csatPercentage = total > 0 ? Math.round((satisfied / total) * 100) : null;

    // Rating distribution
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of responses) {
      if (r.rating && r.rating >= 1 && r.rating <= 5) {
        distribution[r.rating]++;
      }
    }

    return reply.status(200).send({
      totalResponses: total,
      averageRating: avgRating ? Math.round(avgRating * 100) / 100 : null,
      csatPercentage, // % of 4+ ratings
      distribution,
      periodDays: Number(days),
    });
  });
}
