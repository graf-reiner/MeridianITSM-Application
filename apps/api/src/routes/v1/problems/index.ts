import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Problem Management Routes
 *
 * GET    /api/v1/problems                        — List problem tickets with incident counts
 * GET    /api/v1/problems/:id                    — Problem detail with linked incidents, CIs, root cause
 * PATCH  /api/v1/problems/:id/root-cause         — Update root cause, workaround, KB article link
 * GET    /api/v1/problems/:id/incidents           — List incidents linked to a problem
 * POST   /api/v1/problems/:id/incidents           — Link an incident to a problem
 * DELETE /api/v1/problems/:id/incidents/:incidentId — Unlink an incident from a problem
 */
export async function problemRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /api/v1/problems — List problem tickets ───────────────────────────

  fastify.get(
    '/api/v1/problems',
    { preHandler: [requirePermission('tickets:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const query = request.query as {
        status?: string;
        priority?: string;
        search?: string;
        page?: string;
        pageSize?: string;
      };

      const page = Math.max(1, Number(query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
      const skip = (page - 1) * pageSize;

      const where: Record<string, unknown> = {
        tenantId,
        type: 'PROBLEM',
      };

      if (query.status) where.status = query.status;
      if (query.priority) where.priority = query.priority;
      if (query.search) {
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [problems, total] = await Promise.all([
        prisma.ticket.findMany({
          where,
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            status: true,
            priority: true,
            rootCause: true,
            workaround: true,
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
            category: { select: { id: true, name: true } },
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                problemIncidents: true,
                cmdbProblemLinks: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.ticket.count({ where }),
      ]);

      return reply.status(200).send({
        data: problems,
        total,
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
      });
    },
  );

  // ─── GET /api/v1/problems/:id — Problem detail ────────────────────────────

  fastify.get(
    '/api/v1/problems/:id',
    { preHandler: [requirePermission('tickets:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const problem = await prisma.ticket.findFirst({
        where: { id, tenantId, type: 'PROBLEM' },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
          assignedGroup: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          queue: { select: { id: true, name: true } },
          sla: { select: { id: true, name: true } },
          knowledgeArticle: { select: { id: true, articleNumber: true, title: true, status: true } },
          problemIncidents: {
            include: {
              incident: {
                select: {
                  id: true,
                  ticketNumber: true,
                  title: true,
                  status: true,
                  priority: true,
                  createdAt: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          cmdbProblemLinks: {
            include: {
              ci: {
                select: {
                  id: true,
                  ciNumber: true,
                  name: true,
                  ciType: true,
                  lifecycleStatus: true,
                },
              },
            },
          },
          comments: {
            select: { id: true, content: true, visibility: true, authorId: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          activities: {
            select: { id: true, activityType: true, fieldName: true, oldValue: true, newValue: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      });

      if (!problem) {
        return reply.status(404).send({ error: 'Problem not found' });
      }

      return reply.status(200).send(problem);
    },
  );

  // ─── PATCH /api/v1/problems/:id/root-cause — Update root cause fields ─────

  fastify.patch(
    '/api/v1/problems/:id/root-cause',
    { preHandler: [requirePermission('tickets:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;
      const { id } = request.params as { id: string };
      const body = request.body as {
        rootCause?: string;
        workaround?: string;
        knowledgeArticleId?: string | null;
      };

      const problem = await prisma.ticket.findFirst({
        where: { id, tenantId, type: 'PROBLEM' },
      });

      if (!problem) {
        return reply.status(404).send({ error: 'Problem not found' });
      }

      const data: Record<string, unknown> = {};
      if (body.rootCause !== undefined) data.rootCause = body.rootCause;
      if (body.workaround !== undefined) data.workaround = body.workaround;
      if (body.knowledgeArticleId !== undefined) data.knowledgeArticleId = body.knowledgeArticleId;

      if (Object.keys(data).length === 0) {
        return reply.status(400).send({ error: 'No fields to update' });
      }

      const updated = await prisma.ticket.update({
        where: { id },
        data,
        select: {
          id: true,
          rootCause: true,
          workaround: true,
          knowledgeArticleId: true,
          updatedAt: true,
        },
      });

      // Log activity
      for (const [field, value] of Object.entries(data)) {
        await prisma.ticketActivity.create({
          data: {
            tenantId,
            ticketId: id,
            actorId: userId,
            activityType: 'FIELD_CHANGE',
            fieldName: field,
            oldValue: String((problem as Record<string, unknown>)[field] ?? ''),
            newValue: String(value ?? ''),
          },
        });
      }

      return reply.status(200).send(updated);
    },
  );

  // ─── GET /api/v1/problems/:id/incidents — List linked incidents ────────────

  fastify.get(
    '/api/v1/problems/:id/incidents',
    { preHandler: [requirePermission('tickets:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const links = await prisma.incidentProblemLink.findMany({
        where: { tenantId, problemId: id },
        include: {
          incident: {
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              status: true,
              priority: true,
              assignedTo: { select: { firstName: true, lastName: true } },
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.status(200).send(links.map((l) => ({ ...l.incident, linkedAt: l.createdAt })));
    },
  );

  // ─── POST /api/v1/problems/:id/incidents — Link incident to problem ───────

  fastify.post(
    '/api/v1/problems/:id/incidents',
    { preHandler: [requirePermission('tickets:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };
      const body = request.body as { incidentId: string };

      if (!body.incidentId) {
        return reply.status(400).send({ error: 'incidentId is required' });
      }

      // Verify problem exists
      const problem = await prisma.ticket.findFirst({
        where: { id, tenantId, type: 'PROBLEM' },
      });
      if (!problem) {
        return reply.status(404).send({ error: 'Problem not found' });
      }

      // Verify incident exists and is actually an incident
      const incident = await prisma.ticket.findFirst({
        where: { id: body.incidentId, tenantId, type: 'INCIDENT' },
      });
      if (!incident) {
        return reply.status(404).send({ error: 'Incident not found' });
      }

      const link = await prisma.incidentProblemLink.create({
        data: {
          tenantId,
          incidentId: body.incidentId,
          problemId: id,
        },
      });

      return reply.status(201).send(link);
    },
  );

  // ─── DELETE /api/v1/problems/:id/incidents/:incidentId — Unlink ────────────

  fastify.delete(
    '/api/v1/problems/:id/incidents/:incidentId',
    { preHandler: [requirePermission('tickets:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id, incidentId } = request.params as { id: string; incidentId: string };

      const link = await prisma.incidentProblemLink.findFirst({
        where: { tenantId, problemId: id, incidentId },
      });

      if (!link) {
        return reply.status(404).send({ error: 'Link not found' });
      }

      await prisma.incidentProblemLink.delete({ where: { id: link.id } });
      return reply.status(204).send();
    },
  );
}
