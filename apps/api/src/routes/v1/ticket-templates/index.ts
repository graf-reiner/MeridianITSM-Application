import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Ticket Template (Form-Builder) REST API routes.
 *
 * GET    /api/v1/ticket-templates          — List active templates (for template picker)
 * GET    /api/v1/ticket-templates/all      — List all templates including inactive (admin)
 * GET    /api/v1/ticket-templates/:id      — Get template detail with fields
 * POST   /api/v1/ticket-templates          — Create template
 * PATCH  /api/v1/ticket-templates/:id      — Update template
 * DELETE /api/v1/ticket-templates/:id      — Delete template
 * PATCH  /api/v1/ticket-templates/reorder  — Reorder templates
 */
export async function ticketTemplateRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET active templates (for picker) ────────────────────────────────────

  fastify.get('/api/v1/ticket-templates', async (request, reply) => {
    const user = request.user as { tenantId: string };

    const templates = await prisma.ticketTemplate.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        color: true,
        ticketType: true,
        isDefault: true,
        position: true,
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    return reply.status(200).send(templates);
  });

  // ─── GET all templates (admin) ────────────────────────────────────────────

  fastify.get('/api/v1/ticket-templates/all', async (request, reply) => {
    const user = request.user as { tenantId: string };

    const templates = await prisma.ticketTemplate.findMany({
      where: { tenantId: user.tenantId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    return reply.status(200).send(templates);
  });

  // ─── GET template detail ──────────────────────────────────────────────────

  fastify.get('/api/v1/ticket-templates/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const template = await prisma.ticketTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!template) return reply.status(404).send({ error: 'Template not found' });
    return reply.status(200).send(template);
  });

  // ─── POST create template ────────────────────────────────────────────────

  fastify.post('/api/v1/ticket-templates', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const body = request.body as {
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      ticketType?: string;
      defaultPriority?: string;
      defaultCategoryId?: string;
      defaultQueueId?: string;
      defaultAssigneeId?: string;
      defaultGroupId?: string;
      defaultSlaId?: string;
      defaultTags?: string[];
      fields: unknown[];
      sections?: unknown[];
      titleTemplate?: string;
      descriptionTemplate?: string;
      isDefault?: boolean;
    };

    if (!body.name || !body.fields || !Array.isArray(body.fields)) {
      return reply.status(400).send({ error: 'name and fields array are required' });
    }

    if (body.isDefault) {
      await prisma.ticketTemplate.updateMany({
        where: { tenantId: user.tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const maxPos = await prisma.ticketTemplate.aggregate({
      where: { tenantId: user.tenantId },
      _max: { position: true },
    });

    const template = await prisma.ticketTemplate.create({
      data: {
        tenantId: user.tenantId,
        createdById: user.userId,
        name: body.name,
        description: body.description ?? null,
        icon: body.icon ?? null,
        color: body.color ?? null,
        ticketType: (body.ticketType as any) ?? 'SERVICE_REQUEST',
        defaultPriority: body.defaultPriority as any ?? null,
        defaultCategoryId: body.defaultCategoryId ?? null,
        defaultQueueId: body.defaultQueueId ?? null,
        defaultAssigneeId: body.defaultAssigneeId ?? null,
        defaultGroupId: body.defaultGroupId ?? null,
        defaultSlaId: body.defaultSlaId ?? null,
        defaultTags: body.defaultTags ?? [],
        fields: body.fields as any,
        sections: body.sections as any ?? null,
        titleTemplate: body.titleTemplate ?? null,
        descriptionTemplate: body.descriptionTemplate ?? null,
        isDefault: body.isDefault ?? false,
        position: (maxPos._max.position ?? 0) + 1,
      },
    });

    return reply.status(201).send(template);
  });

  // ─── PATCH update template ───────────────────────────────────────────────

  fastify.patch('/api/v1/ticket-templates/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.ticketTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Template not found' });

    if (body.isDefault) {
      await prisma.ticketTemplate.updateMany({
        where: { tenantId: user.tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const allowedFields = [
      'name', 'description', 'icon', 'color', 'ticketType', 'isActive', 'isDefault',
      'defaultPriority', 'defaultCategoryId', 'defaultQueueId', 'defaultAssigneeId',
      'defaultGroupId', 'defaultSlaId', 'defaultTags', 'fields', 'sections',
      'titleTemplate', 'descriptionTemplate',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    const template = await prisma.ticketTemplate.update({ where: { id }, data: updates });
    return reply.status(200).send(template);
  });

  // ─── DELETE template ─────────────────────────────────────────────────────

  fastify.delete('/api/v1/ticket-templates/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const existing = await prisma.ticketTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Template not found' });

    await prisma.ticketTemplate.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ─── PATCH reorder ───────────────────────────────────────────────────────

  fastify.patch('/api/v1/ticket-templates/reorder', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { templateIds } = request.body as { templateIds: string[] };

    if (!templateIds || !Array.isArray(templateIds)) {
      return reply.status(400).send({ error: 'templateIds array is required' });
    }

    await prisma.$transaction(
      templateIds.map((templateId, index) =>
        prisma.ticketTemplate.updateMany({
          where: { id: templateId, tenantId: user.tenantId },
          data: { position: index },
        }),
      ),
    );

    return reply.status(200).send({ success: true });
  });
}
