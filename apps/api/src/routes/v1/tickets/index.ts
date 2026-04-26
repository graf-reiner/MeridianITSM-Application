import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { prisma } from '@meridian/db';
import { planGate } from '../../../plugins/plan-gate.js';
import { ticketWatcherRoutes } from './watchers.js';
import { ticketBulkRoutes } from './bulk.js';
import { savedViewRoutes } from './saved-views.js';
import { ticketRelationshipRoutes } from './relationships.js';
import { ticketMergeRoutes } from './merge.js';
import { ticketPresenceRoutes } from './presence.js';
import { kbSuggestionRoutes } from './kb-suggestions.js';
import { ticketApprovalRoutes } from './approvals.js';
import { similarTicketRoutes } from './similar.js';
import { ticketClassifyRoutes } from './classify.js';
import { majorIncidentRoutes } from './major-incident.js';
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
import { extractPdfContent } from '../../../services/pdf-extraction.service.js';

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
        assignedGroupId?: unknown;
        requestedById?: unknown;
        slaId?: unknown;
        tags?: unknown;
        source?: unknown;
        isMajorIncident?: unknown;
        majorIncidentCoordinatorId?: unknown;
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
        body.description.length > 5_000_000
      ) {
        return reply.status(400).send({ error: 'description must not exceed 5MB' });
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
          assignedGroupId: typeof body.assignedGroupId === 'string' ? body.assignedGroupId : undefined,
          requestedById: typeof body.requestedById === 'string' ? body.requestedById : undefined,
          slaId: typeof body.slaId === 'string' ? body.slaId : undefined,
          tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
          source: typeof body.source === 'string' ? body.source : 'SERVICE_DESK',
          isMajorIncident: body.isMajorIncident === true ? true : undefined,
          majorIncidentCoordinatorId: typeof body.majorIncidentCoordinatorId === 'string' ? body.majorIncidentCoordinatorId : undefined,
        },
        userId,
      );

      return reply.status(201).send(ticket);
    },
  );

  // ─── GET /api/v1/tickets — List tickets ────────────────────────────────────

  fastify.get('/api/v1/tickets', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string; roles: string[] };
    const tenantId = user.tenantId;
    const isEndUser = (user.roles ?? []).includes('end_user') && !(user.roles ?? []).some((r) => ['admin', 'msp_admin', 'agent'].includes(r));

    const query = request.query as {
      status?: string;
      priority?: string;
      type?: string;
      assignedToId?: string;
      assignedGroupId?: string;
      requestedById?: string;
      categoryId?: string;
      queueId?: string;
      slaId?: string;
      source?: string;
      tags?: string;
      search?: string;
      isMajorIncident?: string;
      dateFrom?: string;
      dateTo?: string;
      updatedFrom?: string;
      updatedTo?: string;
      resolvedFrom?: string;
      resolvedTo?: string;
      closedFrom?: string;
      closedTo?: string;
      sortBy?: string;
      sortDir?: string;
      page?: string;
      pageSize?: string;
    };

    const result = await getTicketList(tenantId, {
      status: query.status,
      priority: query.priority,
      type: query.type,
      assignedToId: query.assignedToId === 'me' ? user.userId : query.assignedToId,
      assignedGroupId: query.assignedGroupId,
      requestedById: isEndUser ? user.userId : (query.requestedById === 'me' ? user.userId : query.requestedById),
      categoryId: query.categoryId,
      queueId: query.queueId,
      slaId: query.slaId,
      source: query.source,
      tags: query.tags ? query.tags.split(',') : undefined,
      search: query.search,
      isMajorIncident: query.isMajorIncident === 'true' ? true : query.isMajorIncident === 'false' ? false : undefined,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      updatedFrom: query.updatedFrom,
      updatedTo: query.updatedTo,
      resolvedFrom: query.resolvedFrom,
      resolvedTo: query.resolvedTo,
      closedFrom: query.closedFrom,
      closedTo: query.closedTo,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
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
      type?: string;
      assignedToId?: string;
      assignedGroupId?: string;
      queueId?: string;
      categoryId?: string;
      slaId?: string;
      slaPolicyId?: string;
      resolution?: string;
      tags?: string[];
      isMajorIncident?: boolean;
      majorIncidentCoordinatorId?: string;
    };

    // Normalize: frontend may send slaPolicyId, API expects slaId
    const updateData = {
      ...body,
      slaId: body.slaId ?? body.slaPolicyId,
    };
    delete (updateData as any).slaPolicyId;

    try {
      const ticket = await updateTicket(tenantId, id, updateData, userId);
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

  // ─── GET /api/v1/tickets/:id/comments — List comments ─────────────────────

  fastify.get('/api/v1/tickets/:id/comments', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;
    const { id } = request.params as { id: string };

    // Verify ticket belongs to tenant
    const ticket = await prisma.ticket.findFirst({ where: { id, tenantId } });
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });

    const comments = await prisma.ticketComment.findMany({
      where: { ticketId: id, tenantId },
      include: {
        author: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      comments: comments.map(c => ({
        id: c.id,
        body: c.content,
        content: c.content,
        visibility: c.visibility,
        author: c.author,
        createdAt: c.createdAt,
        timeSpentMinutes: c.timeSpentMinutes,
      })),
    });
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

  // ─── GET /api/v1/tickets/:id/attachments — List attachments ────────────────

  fastify.get('/api/v1/tickets/:id/attachments', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;
    const { id: ticketId } = request.params as { id: string };

    const attachments = await prisma.ticketAttachment.findMany({
      where: { tenantId, ticketId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return reply.status(200).send({ attachments });
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

    // Extract text from PDF attachments for AI search (fire-and-forget)
    if (file.mimetype === 'application/pdf') {
      extractPdfContent(tenantId, attachment.id, key, file.filename).catch(() => {});
    }

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

    const [rawActivities, total] = await Promise.all([
      prisma.ticketActivity.findMany({
        where: { tenantId, ticketId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          actor: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.ticketActivity.count({ where: { tenantId, ticketId } }),
    ]);

    const activities = rawActivities.map((a) => ({
      id: a.id,
      action: a.activityType,
      actor: a.actor ?? null,
      createdAt: a.createdAt,
      meta: a.metadata ?? null,
      fieldName: a.fieldName ?? null,
      oldValue: a.oldValue ?? null,
      newValue: a.newValue ?? null,
    }));

    return reply.status(200).send({ activities, total, page, pageSize });
  });

  // ─── Ticket → CMDB CI Links ─────────────────────────────────────────────────

  const { listCIsByTicket, createIncidentLink, createProblemLink, deleteIncidentLink, deleteProblemLink } =
    await import('../../../services/cmdb-links.service.js');

  // GET /api/v1/tickets/:id/cmdb-links — list CIs linked to this ticket
  fastify.get('/api/v1/tickets/:id/cmdb-links', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const result = await listCIsByTicket(user.tenantId, id);
    return reply.send(result);
  });

  // POST /api/v1/tickets/:id/cmdb-links — create CI link (auto-detects based on ticket type)
  fastify.post('/api/v1/tickets/:id/cmdb-links', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { ciId?: string; impactRole?: string };
    if (!body.ciId) return reply.status(400).send({ error: 'ciId is required' });

    // Determine whether incident or problem link based on ticket type
    const ticket = await prisma.ticket.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { type: true },
    });
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });

    try {
      const link = ticket.type === 'PROBLEM'
        ? await createProblemLink(user.tenantId, body.ciId, id, body.impactRole)
        : await createIncidentLink(user.tenantId, body.ciId, id, body.impactRole);
      return reply.status(201).send(link);
    } catch (err) {
      return reply.status(409).send({ error: (err as Error).message });
    }
  });

  // DELETE /api/v1/tickets/:id/cmdb-links/:ciId — unlink a CI from ticket
  fastify.delete('/api/v1/tickets/:id/cmdb-links/:ciId', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id, ciId } = request.params as { id: string; ciId: string };

    const ticket = await prisma.ticket.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { type: true },
    });
    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });

    try {
      if (ticket.type === 'PROBLEM') {
        await deleteProblemLink(user.tenantId, ciId, id);
      } else {
        await deleteIncidentLink(user.tenantId, ciId, id);
      }
      return reply.status(204).send();
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message });
    }
  });

  // Register watcher sub-routes
  await ticketWatcherRoutes(fastify);

  // Register bulk operations sub-routes
  await ticketBulkRoutes(fastify);

  // Register saved views sub-routes
  await savedViewRoutes(fastify);

  // Register ticket relationship sub-routes (parent/child, links)
  await ticketRelationshipRoutes(fastify);

  // Register ticket merge sub-routes
  await ticketMergeRoutes(fastify);

  // Register agent presence/collision detection sub-routes
  await ticketPresenceRoutes(fastify);

  // Register KB article suggestion sub-routes
  await kbSuggestionRoutes(fastify);

  // Register ticket approval sub-routes
  await ticketApprovalRoutes(fastify);

  // Register similar ticket suggestion sub-routes
  await similarTicketRoutes(fastify);

  // Register AI ticket classification sub-routes
  await ticketClassifyRoutes(fastify);

  // Register Major Incident promotion / de-escalation sub-routes
  await majorIncidentRoutes(fastify);
}
