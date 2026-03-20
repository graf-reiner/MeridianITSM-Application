import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';
import { getElapsedPercentage, getSlaStatus } from '../../../services/sla.service.js';

/**
 * SLA policy management and live status REST API routes.
 *
 * GET    /api/v1/sla                          — List SLA policies
 * GET    /api/v1/sla/:id                      — Get SLA policy detail
 * POST   /api/v1/sla                          — Create SLA policy (requires settings:write)
 * PATCH  /api/v1/sla/:id                      — Update SLA policy (requires settings:write)
 * DELETE /api/v1/sla/:id                      — Delete SLA policy (requires settings:write)
 * GET    /api/v1/tickets/:ticketId/sla-status — Get live SLA status for a ticket
 */
export async function slaRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /api/v1/sla — List SLA policies ────────────────────────────────────

  fastify.get('/api/v1/sla', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;

    const slas = await prisma.sLA.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    return reply.status(200).send(slas);
  });

  // ─── GET /api/v1/sla/:id — Get SLA policy detail ────────────────────────────

  fastify.get('/api/v1/sla/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;
    const { id } = request.params as { id: string };

    const sla = await prisma.sLA.findFirst({
      where: { id, tenantId },
    });

    if (!sla) {
      return reply.status(404).send({ error: 'SLA policy not found' });
    }

    return reply.status(200).send(sla);
  });

  // ─── POST /api/v1/sla — Create SLA policy ───────────────────────────────────

  fastify.post(
    '/api/v1/sla',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const body = request.body as {
        name: string;
        p1ResponseMinutes: number;
        p1ResolutionMinutes: number;
        p2ResponseMinutes: number;
        p2ResolutionMinutes: number;
        p3ResponseMinutes: number;
        p3ResolutionMinutes: number;
        p4ResponseMinutes: number;
        p4ResolutionMinutes: number;
        businessHours?: boolean;
        businessHoursStart?: string;
        businessHoursEnd?: string;
        businessDays?: number[];
        timezone?: string;
        autoEscalate?: boolean;
        escalateToQueueId?: string;
      };

      // Validate required fields
      if (!body.name || typeof body.name !== 'string') {
        return reply.status(400).send({ error: 'name is required' });
      }

      const minuteFields = [
        'p1ResponseMinutes',
        'p1ResolutionMinutes',
        'p2ResponseMinutes',
        'p2ResolutionMinutes',
        'p3ResponseMinutes',
        'p3ResolutionMinutes',
        'p4ResponseMinutes',
        'p4ResolutionMinutes',
      ] as const;

      for (const field of minuteFields) {
        const val = body[field];
        if (typeof val !== 'number' || !Number.isInteger(val) || val <= 0) {
          return reply.status(400).send({ error: `${field} must be a positive integer` });
        }
      }

      // Validate optional time fields
      const timeRegex = /^\d{2}:\d{2}$/;
      if (body.businessHoursStart && !timeRegex.test(body.businessHoursStart)) {
        return reply.status(400).send({ error: 'businessHoursStart must match HH:MM format' });
      }
      if (body.businessHoursEnd && !timeRegex.test(body.businessHoursEnd)) {
        return reply.status(400).send({ error: 'businessHoursEnd must match HH:MM format' });
      }
      if (body.businessDays) {
        if (!Array.isArray(body.businessDays) || body.businessDays.some((d) => d < 0 || d > 6)) {
          return reply.status(400).send({ error: 'businessDays must be an array of integers 0-6' });
        }
      }
      if (body.timezone && typeof body.timezone !== 'string') {
        return reply.status(400).send({ error: 'timezone must be a string' });
      }

      const sla = await prisma.sLA.create({
        data: {
          tenantId,
          name: body.name,
          p1ResponseMinutes: body.p1ResponseMinutes,
          p1ResolutionMinutes: body.p1ResolutionMinutes,
          p2ResponseMinutes: body.p2ResponseMinutes,
          p2ResolutionMinutes: body.p2ResolutionMinutes,
          p3ResponseMinutes: body.p3ResponseMinutes,
          p3ResolutionMinutes: body.p3ResolutionMinutes,
          p4ResponseMinutes: body.p4ResponseMinutes,
          p4ResolutionMinutes: body.p4ResolutionMinutes,
          businessHours: body.businessHours ?? true,
          businessHoursStart: body.businessHoursStart ?? '09:00',
          businessHoursEnd: body.businessHoursEnd ?? '17:00',
          businessDays: body.businessDays ?? [1, 2, 3, 4, 5],
          timezone: body.timezone ?? 'UTC',
          autoEscalate: body.autoEscalate ?? false,
          escalateToQueueId: body.escalateToQueueId ?? null,
        },
      });

      return reply.status(201).send(sla);
    },
  );

  // ─── PATCH /api/v1/sla/:id — Update SLA policy ──────────────────────────────

  fastify.patch(
    '/api/v1/sla/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const body = request.body as {
        name?: string;
        p1ResponseMinutes?: number;
        p1ResolutionMinutes?: number;
        p2ResponseMinutes?: number;
        p2ResolutionMinutes?: number;
        p3ResponseMinutes?: number;
        p3ResolutionMinutes?: number;
        p4ResponseMinutes?: number;
        p4ResolutionMinutes?: number;
        businessHours?: boolean;
        businessHoursStart?: string;
        businessHoursEnd?: string;
        businessDays?: number[];
        timezone?: string;
        autoEscalate?: boolean;
        escalateToQueueId?: string | null;
      };

      // Check it exists and belongs to this tenant
      const existing = await prisma.sLA.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'SLA policy not found' });
      }

      // Validate minute fields if provided
      const minuteFields = [
        'p1ResponseMinutes',
        'p1ResolutionMinutes',
        'p2ResponseMinutes',
        'p2ResolutionMinutes',
        'p3ResponseMinutes',
        'p3ResolutionMinutes',
        'p4ResponseMinutes',
        'p4ResolutionMinutes',
      ] as const;

      for (const field of minuteFields) {
        const val = body[field];
        if (val !== undefined && (typeof val !== 'number' || !Number.isInteger(val) || val <= 0)) {
          return reply.status(400).send({ error: `${field} must be a positive integer` });
        }
      }

      const timeRegex = /^\d{2}:\d{2}$/;
      if (body.businessHoursStart && !timeRegex.test(body.businessHoursStart)) {
        return reply.status(400).send({ error: 'businessHoursStart must match HH:MM format' });
      }
      if (body.businessHoursEnd && !timeRegex.test(body.businessHoursEnd)) {
        return reply.status(400).send({ error: 'businessHoursEnd must match HH:MM format' });
      }
      if (body.businessDays !== undefined) {
        if (!Array.isArray(body.businessDays) || body.businessDays.some((d) => d < 0 || d > 6)) {
          return reply.status(400).send({ error: 'businessDays must be an array of integers 0-6' });
        }
      }

      const updated = await prisma.sLA.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.p1ResponseMinutes !== undefined && { p1ResponseMinutes: body.p1ResponseMinutes }),
          ...(body.p1ResolutionMinutes !== undefined && { p1ResolutionMinutes: body.p1ResolutionMinutes }),
          ...(body.p2ResponseMinutes !== undefined && { p2ResponseMinutes: body.p2ResponseMinutes }),
          ...(body.p2ResolutionMinutes !== undefined && { p2ResolutionMinutes: body.p2ResolutionMinutes }),
          ...(body.p3ResponseMinutes !== undefined && { p3ResponseMinutes: body.p3ResponseMinutes }),
          ...(body.p3ResolutionMinutes !== undefined && { p3ResolutionMinutes: body.p3ResolutionMinutes }),
          ...(body.p4ResponseMinutes !== undefined && { p4ResponseMinutes: body.p4ResponseMinutes }),
          ...(body.p4ResolutionMinutes !== undefined && { p4ResolutionMinutes: body.p4ResolutionMinutes }),
          ...(body.businessHours !== undefined && { businessHours: body.businessHours }),
          ...(body.businessHoursStart !== undefined && { businessHoursStart: body.businessHoursStart }),
          ...(body.businessHoursEnd !== undefined && { businessHoursEnd: body.businessHoursEnd }),
          ...(body.businessDays !== undefined && { businessDays: body.businessDays }),
          ...(body.timezone !== undefined && { timezone: body.timezone }),
          ...(body.autoEscalate !== undefined && { autoEscalate: body.autoEscalate }),
          ...(body.escalateToQueueId !== undefined && { escalateToQueueId: body.escalateToQueueId }),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // ─── DELETE /api/v1/sla/:id — Delete SLA policy ─────────────────────────────

  fastify.delete(
    '/api/v1/sla/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const existing = await prisma.sLA.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'SLA policy not found' });
      }

      await prisma.sLA.delete({ where: { id } });

      return reply.status(204).send();
    },
  );

  // ─── GET /api/v1/tickets/:ticketId/sla-status — Live SLA status ─────────────

  fastify.get('/api/v1/tickets/:ticketId/sla-status', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const tenantId = user.tenantId;
    const { ticketId } = request.params as { ticketId: string };

    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      include: { sla: true },
    });

    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    if (!ticket.sla || !ticket.slaBreachAt) {
      return reply.status(200).send({ status: 'NONE' });
    }

    const customFields = ticket.customFields as Record<string, unknown> | null;
    const isPaused = Boolean(customFields?.slaPausedAt);
    const pausedAt = customFields?.slaPausedAt as string | undefined;

    const elapsedPercentage = getElapsedPercentage(ticket.createdAt, ticket.slaBreachAt);
    const status = getSlaStatus(elapsedPercentage);

    const now = Date.now();
    const remainingMs = ticket.slaBreachAt.getTime() - now;
    const remainingSeconds = Math.max(0, Math.round(remainingMs / 1000));

    return reply.status(200).send({
      status,
      elapsedPercentage,
      remainingSeconds,
      breachAt: ticket.slaBreachAt.toISOString(),
      responseAt: ticket.slaResponseAt?.toISOString() ?? null,
      isPaused,
      pausedAt: pausedAt ?? null,
    });
  });
}
