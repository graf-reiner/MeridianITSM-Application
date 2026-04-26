import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';
import { PERMISSIONS } from '../../../lib/permissions.js';
import {
  promoteToMajorIncident,
  deescalateMajorIncident,
} from '../../../services/ticket.service.js';

/**
 * Major Incident promotion / de-escalation routes.
 *
 *   POST   /api/v1/tickets/:id/major-incident   — Promote a ticket to a Major Incident
 *   DELETE /api/v1/tickets/:id/major-incident   — De-escalate back to a regular ticket
 *   GET    /api/v1/major-incidents/detected     — List auto-detected MI signals (SYSTEM notifications)
 *
 * Promote / de-escalate require `tickets.major_incident.declare`.
 * The detected list requires `tickets.read`.
 */
export async function majorIncidentRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── POST — Promote to Major Incident ─────────────────────────────────────
  fastify.post(
    '/api/v1/tickets/:id/major-incident',
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_MAJOR_INCIDENT_DECLARE)] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { id } = request.params as { id: string };
      const body = request.body as {
        coordinatorId?: unknown;
        impact?: unknown;
        urgency?: unknown;
        summary?: unknown;
        bridgeUrl?: unknown;
      };

      if (typeof body.coordinatorId !== 'string' || body.coordinatorId.length === 0) {
        return reply.status(400).send({ error: 'coordinatorId is required' });
      }
      if (body.impact !== 'HIGH' && body.impact !== 'CRITICAL') {
        return reply.status(400).send({ error: 'impact must be HIGH or CRITICAL' });
      }
      if (body.urgency !== 'HIGH' && body.urgency !== 'CRITICAL') {
        return reply.status(400).send({ error: 'urgency must be HIGH or CRITICAL' });
      }
      if (typeof body.summary !== 'string' || body.summary.trim().length === 0) {
        return reply.status(400).send({ error: 'summary is required' });
      }
      if (body.summary.length > 2000) {
        return reply.status(400).send({ error: 'summary must be 2000 characters or fewer' });
      }
      if (body.bridgeUrl !== undefined && body.bridgeUrl !== null && typeof body.bridgeUrl !== 'string') {
        return reply.status(400).send({ error: 'bridgeUrl must be a string' });
      }

      try {
        const ticket = await promoteToMajorIncident(
          user.tenantId,
          id,
          {
            coordinatorId: body.coordinatorId,
            impact: body.impact,
            urgency: body.urgency,
            summary: body.summary.trim(),
            bridgeUrl: typeof body.bridgeUrl === 'string' ? body.bridgeUrl : null,
          },
          user.userId,
        );
        return reply.status(200).send(ticket);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ error: e.message });
      }
    },
  );

  // ─── GET — Auto-detected Major Incident signals ───────────────────────────
  fastify.get(
    '/api/v1/major-incidents/detected',
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_READ)] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const query = request.query as { page?: string; pageSize?: string };
      const page = Math.max(1, Number(query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
      const skip = (page - 1) * pageSize;

      const where = {
        tenantId: user.tenantId,
        userId: user.userId,
        type: 'SYSTEM' as const,
        title: { contains: 'Major Incident detected' },
      };

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          select: {
            id: true,
            title: true,
            body: true,
            isRead: true,
            createdAt: true,
          },
        }),
        prisma.notification.count({ where }),
      ]);

      return reply.status(200).send({
        data: notifications,
        total,
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
      });
    },
  );

  // ─── DELETE — De-escalate Major Incident ──────────────────────────────────
  fastify.delete(
    '/api/v1/tickets/:id/major-incident',
    { preHandler: [requirePermission(PERMISSIONS.TICKETS_MAJOR_INCIDENT_DECLARE)] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { reason?: unknown };

      if (typeof body.reason !== 'string' || body.reason.trim().length === 0) {
        return reply.status(400).send({ error: 'reason is required' });
      }
      if (body.reason.length > 2000) {
        return reply.status(400).send({ error: 'reason must be 2000 characters or fewer' });
      }

      try {
        const ticket = await deescalateMajorIncident(
          user.tenantId,
          id,
          body.reason.trim(),
          user.userId,
        );
        return reply.status(200).send(ticket);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ error: e.message });
      }
    },
  );
}
