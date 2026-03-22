import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../../plugins/rbac.js';
import {
  createMeeting,
  getMeeting,
  listMeetings,
  updateMeeting,
  addAttendee,
  removeAttendee,
  updateRSVP,
  linkChange,
  recordOutcome,
  generateIcal,
  type CABOutcome,
} from '../../../services/cab.service.js';

/**
 * CAB (Change Advisory Board) meeting REST API routes.
 *
 * POST   /api/v1/cab/meetings                              — Create CAB meeting
 * GET    /api/v1/cab/meetings                              — List meetings
 * GET    /api/v1/cab/meetings/:id                          — Get meeting detail
 * PUT    /api/v1/cab/meetings/:id                          — Update meeting
 * POST   /api/v1/cab/meetings/:id/attendees                — Add attendee
 * DELETE /api/v1/cab/meetings/:id/attendees/:attendeeId    — Remove attendee
 * POST   /api/v1/cab/meetings/:id/rsvp                     — Update RSVP (any authenticated user)
 * POST   /api/v1/cab/meetings/:id/changes                  — Link change to agenda
 * POST   /api/v1/cab/meetings/:id/changes/:changeId/outcome — Record change outcome
 * GET    /api/v1/cab/meetings/:id/ical                     — Download iCal file
 */
export async function cabRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── POST /api/v1/cab/meetings — Create meeting ───────────────────────────────

  fastify.post(
    '/api/v1/cab/meetings',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const body = request.body as {
        title?: unknown;
        scheduledFor?: unknown;
        durationMinutes?: unknown;
        location?: unknown;
        meetingUrl?: unknown;
        notes?: unknown;
      };

      if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
        return reply.status(400).send({ error: 'title is required and must be a non-empty string' });
      }

      if (!body.scheduledFor || typeof body.scheduledFor !== 'string') {
        return reply.status(400).send({ error: 'scheduledFor is required' });
      }

      try {
        const meeting = await createMeeting(tenantId, {
          title: body.title.trim(),
          scheduledFor: body.scheduledFor,
          durationMinutes: typeof body.durationMinutes === 'number' ? body.durationMinutes : undefined,
          location: typeof body.location === 'string' ? body.location : undefined,
          meetingUrl: typeof body.meetingUrl === 'string' ? body.meetingUrl : undefined,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
        });

        return reply.status(201).send(meeting);
      } catch (err) {
        throw err;
      }
    },
  );

  // ─── GET /api/v1/cab/meetings — List meetings ─────────────────────────────────

  fastify.get(
    '/api/v1/cab/meetings',
    { preHandler: [requirePermission('changes.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const query = request.query as {
        status?: string;
        dateFrom?: string;
        dateTo?: string;
        page?: string;
        pageSize?: string;
      };

      const result = await listMeetings(tenantId, {
        status: query.status,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page ? parseInt(query.page, 10) : undefined,
        pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      });

      return reply.status(200).send(result);
    },
  );

  // ─── GET /api/v1/cab/meetings/:id — Get meeting detail ───────────────────────

  fastify.get(
    '/api/v1/cab/meetings/:id',
    { preHandler: [requirePermission('changes.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const meeting = await getMeeting(tenantId, id);
      if (!meeting) {
        return reply.status(404).send({ error: 'CAB meeting not found' });
      }

      return reply.status(200).send(meeting);
    },
  );

  // ─── PUT /api/v1/cab/meetings/:id — Update meeting ───────────────────────────

  fastify.put(
    '/api/v1/cab/meetings/:id',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as {
        title?: string;
        scheduledFor?: string;
        durationMinutes?: number;
        location?: string | null;
        meetingUrl?: string | null;
        notes?: string | null;
        status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
      };

      try {
        const meeting = await updateMeeting(tenantId, id, body);
        return reply.status(200).send(meeting);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: 'CAB meeting not found' });
        }
        throw err;
      }
    },
  );

  // ─── POST /api/v1/cab/meetings/:id/attendees — Add attendee ─────────────────

  fastify.post(
    '/api/v1/cab/meetings/:id/attendees',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as { userId?: unknown; role?: unknown };

      if (!body.userId || typeof body.userId !== 'string') {
        return reply.status(400).send({ error: 'userId is required' });
      }

      try {
        const attendee = await addAttendee(
          tenantId,
          id,
          body.userId,
          (body.role as 'CHAIRPERSON' | 'MEMBER' | 'OBSERVER' | undefined) ?? 'MEMBER',
        );
        return reply.status(201).send(attendee);
      } catch (err) {
        const error = err as Error & { statusCode?: number; code?: string };
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: 'CAB meeting not found' });
        }
        if (error.code === 'P2002') {
          return reply.status(409).send({ error: 'User is already an attendee of this meeting' });
        }
        throw err;
      }
    },
  );

  // ─── DELETE /api/v1/cab/meetings/:id/attendees/:attendeeId — Remove attendee ─

  fastify.delete(
    '/api/v1/cab/meetings/:id/attendees/:attendeeId',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id, attendeeId } = request.params as { id: string; attendeeId: string };

      try {
        await removeAttendee(tenantId, id, attendeeId);
        return reply.status(204).send();
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: 'Attendee not found' });
        }
        throw err;
      }
    },
  );

  // ─── POST /api/v1/cab/meetings/:id/rsvp — Update RSVP ───────────────────────
  // Any authenticated user can RSVP — no special permission required

  fastify.post(
    '/api/v1/cab/meetings/:id/rsvp',
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as { rsvpStatus?: unknown };

      if (
        !body.rsvpStatus ||
        !['ACCEPTED', 'DECLINED', 'TENTATIVE'].includes(body.rsvpStatus as string)
      ) {
        return reply.status(400).send({ error: 'rsvpStatus must be ACCEPTED, DECLINED, or TENTATIVE' });
      }

      try {
        const result = await updateRSVP(
          tenantId,
          id,
          userId,
          body.rsvpStatus as 'ACCEPTED' | 'DECLINED' | 'TENTATIVE',
        );
        return reply.status(200).send(result);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: 'Attendee not found for this meeting' });
        }
        throw err;
      }
    },
  );

  // ─── POST /api/v1/cab/meetings/:id/changes — Link change to agenda ───────────

  fastify.post(
    '/api/v1/cab/meetings/:id/changes',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as { changeId?: unknown; agendaOrder?: unknown };

      if (!body.changeId || typeof body.changeId !== 'string') {
        return reply.status(400).send({ error: 'changeId is required' });
      }

      const agendaOrder = typeof body.agendaOrder === 'number' ? body.agendaOrder : 0;

      try {
        const record = await linkChange(tenantId, id, body.changeId, agendaOrder);
        return reply.status(201).send(record);
      } catch (err) {
        const error = err as Error & { code?: string };
        if (error.code === 'P2002') {
          return reply.status(409).send({ error: 'Change is already linked to this meeting' });
        }
        throw err;
      }
    },
  );

  // ─── POST /api/v1/cab/meetings/:id/changes/:changeId/outcome — Record outcome ─

  fastify.post(
    '/api/v1/cab/meetings/:id/changes/:changeId/outcome',
    { preHandler: [requirePermission('changes.approve')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;
      const { id, changeId } = request.params as { id: string; changeId: string };

      const body = request.body as { outcome?: unknown; notes?: unknown };

      const validOutcomes: CABOutcome[] = ['APPROVED', 'REJECTED', 'DEFERRED', 'NEEDS_MORE_INFO'];
      if (!body.outcome || !validOutcomes.includes(body.outcome as CABOutcome)) {
        return reply.status(400).send({
          error: `outcome must be one of: ${validOutcomes.join(', ')}`,
        });
      }

      try {
        const result = await recordOutcome(
          tenantId,
          id,
          changeId,
          body.outcome as CABOutcome,
          typeof body.notes === 'string' ? body.notes : undefined,
          userId,
        );
        return reply.status(200).send(result);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: error.message });
        }
        throw err;
      }
    },
  );

  // ─── GET /api/v1/cab/meetings/:id/ical — Download iCal file ──────────────────

  fastify.get(
    '/api/v1/cab/meetings/:id/ical',
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      try {
        const icalContent = await generateIcal(tenantId, id);

        reply.header('Content-Type', 'text/calendar; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="cab-meeting-${id}.ics"`);
        return reply.status(200).send(icalContent);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: 'CAB meeting not found' });
        }
        throw err;
      }
    },
  );
}
