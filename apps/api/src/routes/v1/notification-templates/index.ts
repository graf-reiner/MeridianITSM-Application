import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { renderTemplate } from '@meridian/core';
import {
  CHANNELS,
  type TemplateChannel,
  isAdmin,
  validateCreate,
  validateContentShape,
  graphReferencesTemplate,
} from './validation.js';

/**
 * Notification Template REST API.
 *
 * GET    /api/v1/notification-templates            — List (optional ?channel, ?search, ?isActive)
 * GET    /api/v1/notification-templates/:id        — Single
 * POST   /api/v1/notification-templates            — Create (admin)
 * PATCH  /api/v1/notification-templates/:id        — Update (admin)
 * DELETE /api/v1/notification-templates/:id        — Delete (admin); 409 if referenced in workflow graph
 * POST   /api/v1/notification-templates/:id/preview — Render content with sample context
 */
export async function notificationTemplateRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET / — List ──────────────────────────────────────────────────────────
  fastify.get('/api/v1/notification-templates', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { channel, search, isActive } = request.query as {
      channel?: string;
      search?: string;
      isActive?: string;
    };

    const where: Record<string, unknown> = { tenantId: user.tenantId };

    if (channel && CHANNELS.includes(channel as TemplateChannel)) {
      where.channel = channel;
    }
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const templates = await prisma.notificationTemplate.findMany({
      where: where as any,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ channel: 'asc' }, { name: 'asc' }],
    });

    return reply.status(200).send(templates);
  });

  // ─── GET /:id — Single ─────────────────────────────────────────────────────
  fastify.get('/api/v1/notification-templates/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const template = await prisma.notificationTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!template) {
      return reply.status(404).send({ error: 'Notification template not found' });
    }

    return reply.status(200).send(template);
  });

  // ─── POST / — Create ───────────────────────────────────────────────────────
  fastify.post('/api/v1/notification-templates', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    if (!isAdmin(user.roles)) {
      return reply.status(403).send({ error: 'Only admins can create notification templates' });
    }

    const body = request.body as {
      name?: string;
      channel?: string;
      content?: Record<string, unknown>;
      contexts?: string[];
      description?: string;
      isActive?: boolean;
    };

    const validation = validateCreate(body);
    if (!validation.ok) {
      return reply.status(400).send({ error: validation.error });
    }

    const existing = await prisma.notificationTemplate.findFirst({
      where: {
        tenantId: user.tenantId,
        name: body.name!,
        channel: body.channel! as TemplateChannel,
      },
    });
    if (existing) {
      return reply.status(409).send({
        error: `A ${body.channel} template named "${body.name}" already exists`,
      });
    }

    const template = await prisma.notificationTemplate.create({
      data: {
        tenantId: user.tenantId,
        createdById: user.userId,
        name: body.name!,
        description: body.description ?? null,
        channel: body.channel! as TemplateChannel,
        content: body.content! as any,
        contexts: body.contexts ?? [],
        isActive: body.isActive ?? true,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return reply.status(201).send(template);
  });

  // ─── PATCH /:id — Update ───────────────────────────────────────────────────
  fastify.patch('/api/v1/notification-templates/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    if (!isAdmin(user.roles)) {
      return reply.status(403).send({ error: 'Only admins can edit notification templates' });
    }

    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      content?: Record<string, unknown>;
      contexts?: string[];
      description?: string;
      isActive?: boolean;
    };

    const existing = await prisma.notificationTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Notification template not found' });
    }

    // Channel is immutable — prevents stale content-shape mismatches
    if ((body as { channel?: string }).channel && (body as { channel?: string }).channel !== existing.channel) {
      return reply.status(400).send({ error: 'channel cannot be changed after creation' });
    }

    if (body.content !== undefined) {
      const contentCheck = validateContentShape(existing.channel as TemplateChannel, body.content);
      if (!contentCheck.ok) {
        return reply.status(400).send({ error: contentCheck.error });
      }
    }

    if (body.name !== undefined && body.name !== existing.name) {
      const dup = await prisma.notificationTemplate.findFirst({
        where: {
          tenantId: user.tenantId,
          name: body.name,
          channel: existing.channel,
          NOT: { id },
        },
      });
      if (dup) {
        return reply.status(409).send({
          error: `A ${existing.channel} template named "${body.name}" already exists`,
        });
      }
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.content !== undefined) updates.content = body.content;
    if (body.contexts !== undefined) updates.contexts = body.contexts;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const updated = await prisma.notificationTemplate.update({
      where: { id },
      data: updates,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return reply.status(200).send(updated);
  });

  // ─── DELETE /:id — Delete (block if referenced) ────────────────────────────
  fastify.delete('/api/v1/notification-templates/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    if (!isAdmin(user.roles)) {
      return reply.status(403).send({ error: 'Only admins can delete notification templates' });
    }

    const { id } = request.params as { id: string };

    const existing = await prisma.notificationTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Notification template not found' });
    }

    const references = await findWorkflowsReferencingTemplate(user.tenantId, id);
    if (references.length > 0) {
      return reply.status(409).send({
        error: 'Template is still referenced by one or more workflows',
        workflows: references,
      });
    }

    await prisma.notificationTemplate.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ─── POST /:id/preview — Render with sample context ────────────────────────
  fastify.post('/api/v1/notification-templates/:id/preview', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const { sampleContext } = request.body as { sampleContext?: Record<string, unknown> };

    const template = await prisma.notificationTemplate.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!template) {
      return reply.status(404).send({ error: 'Notification template not found' });
    }

    const ctx = sampleContext ?? buildSampleContext();
    const content = template.content as Record<string, unknown>;
    const rendered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(content)) {
      rendered[key] = typeof value === 'string' ? renderTemplate(value, ctx) : value;
    }

    return reply.status(200).send({ rendered });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Scan tenant's workflow versions for any node config that references the given templateId.
 * Returns list of referencing workflows. Tenant-scoped.
 */
async function findWorkflowsReferencingTemplate(
  tenantId: string,
  templateId: string,
): Promise<Array<{ id: string; name: string }>> {
  const workflows = await prisma.workflow.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      currentVersionId: true,
    },
  });

  const results: Array<{ id: string; name: string }> = [];
  for (const wf of workflows) {
    if (!wf.currentVersionId) continue;
    // Scope via parent workflow (already filtered to tenant)
    const version = await prisma.workflowVersion.findFirst({
      where: { id: wf.currentVersionId, workflowId: wf.id },
      select: { graphJson: true },
    });
    if (!version) continue;
    if (graphReferencesTemplate(version.graphJson, templateId)) {
      results.push({ id: wf.id, name: wf.name });
    }
  }
  return results;
}

function buildSampleContext(): Record<string, unknown> {
  return {
    ticket: {
      number: 'T-12345',
      title: 'Sample ticket',
      description: 'Example description',
      status: 'Open',
      priority: 'High',
      type: 'Incident',
      category: 'Network',
      queue: 'Tier 1',
      tags: 'urgent',
      createdAt: new Date().toISOString(),
      resolvedAt: '',
    },
    requester: {
      firstName: 'Sam',
      lastName: 'Requester',
      displayName: 'Sam Requester',
      email: 'sam@example.com',
    },
    assignee: {
      firstName: 'Alex',
      lastName: 'Assignee',
      displayName: 'Alex Assignee',
      email: 'alex@example.com',
    },
    tenant: { name: 'Acme Corp', subdomain: 'acme' },
    now: {
      iso: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toISOString().slice(11, 16),
    },
  };
}
