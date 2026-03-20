import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { prisma } from '@meridian/db';
import { planGate } from '../../../plugins/plan-gate.js';
import {
  createTicket,
  updateTicket,
  addComment,
  getTicketList,
  getTicketDetail,
  assignTicket,
  linkKnowledgeArticle,
  linkCmdbItem,
} from '../../../services/ticket.service.js';
import * as storageService from '../../../services/storage.service.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Ticket management REST API routes.
 *
 * POST   /api/v1/tickets                                    — Create ticket (plan-gated)
 * GET    /api/v1/tickets                                    — List tickets (filterable)
 * GET    /api/v1/tickets/:id                                — Get ticket detail
 * PATCH  /api/v1/tickets/:id                                — Update ticket
 * POST   /api/v1/tickets/:id/comments                       — Add comment
 * POST   /api/v1/tickets/:id/attachments                    — Upload attachment (multipart)
 * GET    /api/v1/tickets/:id/attachments/:attachmentId/url  — Get signed download URL
 * POST   /api/v1/tickets/:id/assign                         — Assign ticket
 * POST   /api/v1/tickets/:id/link-article                   — Link KB article
 * POST   /api/v1/tickets/:id/link-ci                        — Link CMDB CI
 * GET    /api/v1/tickets/:id/activities                     — Get audit trail
 */
export async function ticketRoutes(fastify: FastifyInstance): Promise<void> {
  // Register multipart in this scoped plugin ONLY — avoids breaking JSON routes globally
  await fastify.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
  });

  // ─── POST /api/v1/tickets — Create ticket ──────────────────────────────────

  fastify.post(
    '/api/v1/tickets',
    {
      preHandler: [
        planGate('tickets', async (tid) =>
          prisma.ticket.count({ where: { tenantId: tid } }),
        ),
      ],
    },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const userId = user.userId;

      const body = request.body as {
        title?: unknown;
        description?: unknown;
        type?: unknown;
        priority?: unknown;
        categoryId?: unknown;
        queueId?: unknown;
        assignedToId?: unknown;
        requestedById?: unknown;
        slaId?: unknown;
        tags?: unknown;
      };

      // Validate required fields
      if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
        return reply.status(400).send({ error: 'title is required and must be a non-empty string' });
      }
      if (body.title.length > 500) {
        return reply.status(400).send({ error: 'title must not exceed 500 characters' });
      }
      if (
        body.description !== undefined &&
        body.description !== null &&
        typeof body.description === 'string' &&
        body.description.length > 10000
      ) {
        return reply.status(400).send({ error: 'description must not exceed 10000 characters' });
      }

      const ticket = await createTicket(
        tenantId,
        {
          title: body.title.trim(),
          description: typeof body.description === 'string' ? body.description : undefined,
          type: body.type as 'INCIDENT' | 'SERVICE_REQUEST' | 'PROBLEM' | undefined,
          priority: body.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
          categoryId: typeof body.categoryId === 'string' ? body.categoryId : undefined,
          queueId: typeof body.queueId === 'string' ? body.queueId : undefined,
          assignedToId: typeof body.assignedToId === 'string' ? body.assignedToId : undefined,
          requestedById: typeof body.requestedById === 'string' ? body.requestedById : undefined,
          slaId: typeof body.slaId === 'string' ? body.slaId : undefined,
          tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
        },
        userId,
      );

      return reply.status(201).send(ticket);
    },
  );

  // ─── GET /api/v1/tickets — List tickets ────────────────────────────────────

  fastify.get('/api/v1/tickets', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;

    const query = request.query as {
      status?: string;
      priority?: string;
      assignedToId?: string;
      categoryId?: string;
      queueId?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: string;
      pageSize?: string;
    };

    const result = await getTicketList(tenantId, {
      status: query.status,
      priority: query.priority,
      assignedToId: query.assignedToId,
      categoryId: query.categoryId,
      queueId: query.queueId,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });

    return reply.status(200).send(result);
  });

  // ─── GET /api/v1/tickets/:id — Get ticket detail ───────────────────────────

  fastify.get('/api/v1/tickets/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;
    const { id } = request.params as { id: string };

    const ticket = await getTicketDetail(tenantId, id);

    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    return reply.status(200).send(ticket);
  });

  // ─── PATCH /api/v1/tickets/:id — Update ticket ─────────────────────────────

  fastify.patch('/api/v1/tickets/:id', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const tenantId = user.tenantId;
    const userId = user.userId;
    const { id } = request.params as { id: string };

    const body = request.body as {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      assignedToId?: string;
      queueId?: string;
      categoryId?: string;
      slaId?: string;
      resolution?: string;
      tags?: string[];
    };

    try {
      const ticket = await updateTicket(tenantId, id, body, userId);
      return reply.status(200).send(ticket);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 404) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }
      if (error.statusCode === 400) {
        return reply.status(400).send({ error: error.message });
      }
      throw err;
    }
  });

  // ─── POST /api/v1/tickets/:id/comments — Add comment ──────────────────────

  fastify.post('/api/v1/tickets/:id/comments', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string; roles?: string[] };
    const tenantId = user.tenantId;
    const userId = user.userId;
    const roles = user.roles ?? [];
    const { id } = request.params as { id: string };

    const body = request.body as {
      content?: unknown;
      visibility?: unknown;
      timeSpentMinutes?: unknown;
    };

    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      return reply.status(400).send({ error: 'content is required and must be a non-empty string' });
    }

    if (
      body.timeSpentMinutes !== undefined &&
      body.timeSpentMinutes !== null &&
      (!Number.isInteger(body.timeSpentMinutes) || (body.timeSpentMinutes as number) < 0)
    ) {
      return reply.status(400).send({ error: 'timeSpentMinutes must be a positive integer' });
    }

    // end_user role cannot create INTERNAL comments
    let visibility = (body.visibility as 'PUBLIC' | 'INTERNAL' | undefined) ?? 'PUBLIC';
    if (roles.includes('end_user')) {
      visibility = 'PUBLIC';
    }

    try {
      const comment = await addComment(
        tenantId,
        id,
        {
          content: body.content.trim(),
          visibility,
          timeSpentMinutes:
            typeof body.timeSpentMinutes === 'number'
              ? body.timeSpentMinutes
              : undefined,
        },
        userId,
      );

      return reply.status(201).send(comment);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 404) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }
      throw err;
    }
  });

  // ─── POST /api/v1/tickets/:id/attachments — Upload attachment ──────────────

  fastify.post('/api/v1/tickets/:id/attachments', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const tenantId = user.tenantId;
    const userId = user.userId;
    const { id: ticketId } = request.params as { id: string };

    // Verify ticket exists and belongs to tenant
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      select: { id: true },
    });

    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    const file = await request.file();

    if (!file) {
      return reply.status(400).send({ error: 'No file provided' });
    }

    if (!file.filename) {
      return reply.status(400).send({ error: 'Filename is required' });
    }

    // Read file buffer
    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length > MAX_FILE_SIZE) {
      return reply.status(400).send({ error: 'File exceeds 25MB limit' });
    }

    // Generate storage key
    const safeFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${tenantId}/tickets/${ticketId}/${Date.now()}-${safeFilename}`;

    // Upload to MinIO
    await storageService.uploadFile(buffer, key, file.mimetype);

    // Persist attachment record
    const attachment = await prisma.ticketAttachment.create({
      data: {
        tenantId,
        ticketId,
        uploadedById: userId,
        filename: file.filename,
        mimeType: file.mimetype,
        fileSize: buffer.length,
        storagePath: key,
      },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Log activity
    await prisma.ticketActivity.create({
      data: {
        tenantId,
        ticketId,
        actorId: userId,
        activityType: 'ATTACHMENT_ADDED',
        metadata: {
          filename: file.filename,
          fileSize: buffer.length,
        },
      },
    });

    return reply.status(201).send(attachment);
  });

  // ─── GET /api/v1/tickets/:id/attachments/:attachmentId/url — Signed URL ───

  fastify.get(
    '/api/v1/tickets/:id/attachments/:attachmentId/url',
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id: ticketId, attachmentId } = request.params as {
        id: string;
        attachmentId: string;
      };

      const attachment = await prisma.ticketAttachment.findFirst({
        where: { id: attachmentId, ticketId, tenantId },
        select: { storagePath: true },
      });

      if (!attachment) {
        return reply.status(404).send({ error: 'Attachment not found' });
      }

      const url = await storageService.getFileSignedUrl(attachment.storagePath);

      return reply.status(200).send({ url });
    },
  );

  // ─── POST /api/v1/tickets/:id/assign — Assign ticket ──────────────────────

  fastify.post('/api/v1/tickets/:id/assign', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const tenantId = user.tenantId;
    const userId = user.userId;
    const { id } = request.params as { id: string };

    const body = request.body as { assignedToId?: unknown };

    if (!body.assignedToId || typeof body.assignedToId !== 'string') {
      return reply.status(400).send({ error: 'assignedToId is required' });
    }

    try {
      const ticket = await assignTicket(tenantId, id, body.assignedToId, userId);
      return reply.status(200).send(ticket);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 404) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }
      throw err;
    }
  });

  // ─── POST /api/v1/tickets/:id/link-article — Link KB article ───────────────

  fastify.post('/api/v1/tickets/:id/link-article', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;
    const { id } = request.params as { id: string };

    const body = request.body as { knowledgeArticleId?: unknown };

    if (!body.knowledgeArticleId || typeof body.knowledgeArticleId !== 'string') {
      return reply.status(400).send({ error: 'knowledgeArticleId is required' });
    }

    await linkKnowledgeArticle(tenantId, id, body.knowledgeArticleId);

    return reply.status(201).send({ success: true });
  });

  // ─── POST /api/v1/tickets/:id/link-ci — Link CMDB CI ──────────────────────

  fastify.post('/api/v1/tickets/:id/link-ci', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;
    const { id } = request.params as { id: string };

    const body = request.body as {
      ciId?: unknown;
      linkType?: unknown;
    };

    if (!body.ciId || typeof body.ciId !== 'string') {
      return reply.status(400).send({ error: 'ciId is required' });
    }

    await linkCmdbItem(
      tenantId,
      id,
      body.ciId,
      (body.linkType as 'AFFECTED' | 'RELATED' | 'CAUSED_BY' | undefined) ?? 'AFFECTED',
    );

    return reply.status(201).send({ success: true });
  });

  // ─── GET /api/v1/tickets/:id/activities — Get audit trail ─────────────────

  fastify.get('/api/v1/tickets/:id/activities', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;
    const { id: ticketId } = request.params as { id: string };

    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '50', 10)));
    const skip = (page - 1) * pageSize;

    const [activities, total] = await Promise.all([
      prisma.ticketActivity.findMany({
        where: { tenantId, ticketId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.ticketActivity.count({ where: { tenantId, ticketId } }),
    ]);

    return reply.status(200).send({ data: activities, total, page, pageSize });
  });
}
