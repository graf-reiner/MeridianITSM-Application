import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../../plugins/rbac.js';
import {
  createChange,
  getChange,
  listChanges,
  updateChange,
  recallChange,
  transitionStatus,
  addApprover,
  removeApprover,
  recordApproval,
  getCollisions,
  linkAsset,
  linkApplication,
  calculateRiskScore,
} from '../../../services/change.service.js';

/**
 * Change management REST API routes.
 *
 * POST   /api/v1/changes                         — Create change request
 * GET    /api/v1/changes                         — List changes (filterable)
 * GET    /api/v1/changes/calendar                — Changes in calendar date range
 * GET    /api/v1/changes/:id                     — Get change detail
 * PUT    /api/v1/changes/:id                     — Update change fields
 * POST   /api/v1/changes/:id/transition          — Transition status (409 if invalid)
 * POST   /api/v1/changes/:id/approvers           — Add approver
 * POST   /api/v1/changes/:id/approve             — Record approval decision
 * GET    /api/v1/changes/:id/collisions          — Check scheduling collisions
 * POST   /api/v1/changes/:id/assets              — Link asset to change
 * POST   /api/v1/changes/:id/applications        — Link application to change
 */
export async function changeRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── POST /api/v1/changes — Create change ────────────────────────────────────

  fastify.post(
    '/api/v1/changes',
    { preHandler: [requirePermission('changes.create')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;

      const body = request.body as {
        title?: unknown;
        description?: unknown;
        type?: unknown;
        implementationPlan?: unknown;
        backoutPlan?: unknown;
        testingPlan?: unknown;
        riskLevel?: unknown;
        assignedToId?: unknown;
        scheduledStart?: unknown;
        scheduledEnd?: unknown;
        approvers?: unknown;
      };

      if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
        return reply.status(400).send({ error: 'title is required and must be a non-empty string' });
      }

      try {
        const change = await createChange(
          tenantId,
          {
            title: body.title.trim(),
            description: typeof body.description === 'string' ? body.description : undefined,
            type: body.type as 'STANDARD' | 'NORMAL' | 'EMERGENCY' | undefined,
            implementationPlan: typeof body.implementationPlan === 'string' ? body.implementationPlan : undefined,
            backoutPlan: typeof body.backoutPlan === 'string' ? body.backoutPlan : undefined,
            testingPlan: typeof body.testingPlan === 'string' ? body.testingPlan : undefined,
            riskLevel: body.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
            assignedToId: typeof body.assignedToId === 'string' ? body.assignedToId : undefined,
            scheduledStart: typeof body.scheduledStart === 'string' ? body.scheduledStart : undefined,
            scheduledEnd: typeof body.scheduledEnd === 'string' ? body.scheduledEnd : undefined,
            approvers: Array.isArray(body.approvers) ? (body.approvers as string[]) : undefined,
          },
          userId,
        );
        return reply.status(201).send(change);
      } catch (err) {
        throw err;
      }
    },
  );

  // ─── GET /api/v1/changes/calendar — Calendar view data ───────────────────────
  // Must be defined before /:id to avoid route conflict

  fastify.get(
    '/api/v1/changes/calendar',
    { preHandler: [requirePermission('changes.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const query = request.query as { start?: string; end?: string };

      if (!query.start || !query.end) {
        return reply.status(400).send({ error: 'start and end query params are required' });
      }

      const result = await listChanges(tenantId, {
        calendarStart: query.start,
        calendarEnd: query.end,
        pageSize: 500, // calendar view returns up to 500 changes in range
      });

      return reply.status(200).send(result);
    },
  );

  // ─── GET /api/v1/changes — List changes ──────────────────────────────────────

  fastify.get(
    '/api/v1/changes',
    { preHandler: [requirePermission('changes.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const query = request.query as {
        status?: string;
        type?: string;
        riskLevel?: string;
        assignedToId?: string;
        search?: string;
        page?: string;
        pageSize?: string;
        calendarStart?: string;
        calendarEnd?: string;
        sortBy?: string;
        sortDir?: string;
      };

      const result = await listChanges(tenantId, {
        status: query.status,
        type: query.type,
        riskLevel: query.riskLevel,
        assignedToId: query.assignedToId,
        search: query.search,
        page: query.page ? parseInt(query.page, 10) : undefined,
        pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
        calendarStart: query.calendarStart,
        calendarEnd: query.calendarEnd,
        sortBy: query.sortBy,
        sortDir: query.sortDir === 'asc' ? 'asc' : query.sortDir === 'desc' ? 'desc' : undefined,
      });

      return reply.status(200).send(result);
    },
  );

  // ─── GET /api/v1/changes/:id — Get change detail ─────────────────────────────

  fastify.get(
    '/api/v1/changes/:id',
    { preHandler: [requirePermission('changes.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const change = await getChange(tenantId, id);
      if (!change) {
        return reply.status(404).send({ error: 'Change not found' });
      }
      return reply.status(200).send(change);
    },
  );

  // ─── PUT /api/v1/changes/:id — Update change ─────────────────────────────────

  fastify.put(
    '/api/v1/changes/:id',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as {
        title?: string;
        description?: string;
        implementationPlan?: string;
        backoutPlan?: string;
        testingPlan?: string;
        riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        assignedToId?: string;
        scheduledStart?: string | null;
        scheduledEnd?: string | null;
        actualStart?: string | null;
        actualEnd?: string | null;
      };

      try {
        const change = await updateChange(tenantId, id, body, userId);
        return reply.status(200).send(change);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: 'Change not found' });
        }
        if (error.statusCode === 409) {
          return reply.status(409).send({ error: error.message });
        }
        throw err;
      }
    },
  );

  // ─── POST /api/v1/changes/:id/recall — ITIL recall to ASSESSMENT ─────────────
  // Pulls APPROVAL_PENDING/APPROVED/SCHEDULED changes back to ASSESSMENT and
  // wipes approvals so corrections can be made. Reason is required for audit.
  fastify.post(
    '/api/v1/changes/:id/recall',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;
      const { id } = request.params as { id: string };
      const body = request.body as { reason?: string };

      try {
        const change = await recallChange(tenantId, id, userId, body.reason ?? '');
        return reply.status(200).send(change);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 400) return reply.status(400).send({ error: error.message });
        if (error.statusCode === 404) return reply.status(404).send({ error: error.message });
        if (error.statusCode === 409) return reply.status(409).send({ error: error.message });
        throw err;
      }
    },
  );

  // ─── POST /api/v1/changes/:id/transition — Status transition ─────────────────

  fastify.post(
    '/api/v1/changes/:id/transition',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as { status?: unknown };

      if (!body.status || typeof body.status !== 'string') {
        return reply.status(400).send({ error: 'status is required' });
      }

      try {
        const change = await transitionStatus(tenantId, id, body.status, userId);
        return reply.status(200).send(change);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: 'Change not found' });
        }
        if (error.statusCode === 409) {
          return reply.status(409).send({ error: error.message });
        }
        if (error.statusCode === 400) {
          return reply.status(400).send({ error: error.message });
        }
        throw err;
      }
    },
  );

  // ─── POST /api/v1/changes/:id/approvers — Add approver ───────────────────────

  fastify.post(
    '/api/v1/changes/:id/approvers',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as { approverId?: unknown; sequenceOrder?: unknown };

      if (!body.approverId || typeof body.approverId !== 'string') {
        return reply.status(400).send({ error: 'approverId is required' });
      }

      const sequenceOrder =
        typeof body.sequenceOrder === 'number' ? body.sequenceOrder : 0;

      try {
        const approval = await addApprover(tenantId, id, body.approverId, sequenceOrder, userId);
        return reply.status(201).send(approval);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 404) return reply.status(404).send({ error: error.message });
        if (error.statusCode === 409) return reply.status(409).send({ error: error.message });
        throw err;
      }
    },
  );

  // ─── DELETE /api/v1/changes/:id/approvers/:approvalId — Remove approver ──────
  // Permitted only in NEW/ASSESSMENT. After submission, you must recall first.
  fastify.delete(
    '/api/v1/changes/:id/approvers/:approvalId',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;
      const { id, approvalId } = request.params as { id: string; approvalId: string };

      try {
        await removeApprover(tenantId, id, approvalId, userId);
        return reply.status(204).send();
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 404) return reply.status(404).send({ error: error.message });
        if (error.statusCode === 409) return reply.status(409).send({ error: error.message });
        throw err;
      }
    },
  );

  // ─── POST /api/v1/changes/:id/approve — Record approval decision ─────────────

  fastify.post(
    '/api/v1/changes/:id/approve',
    { preHandler: [requirePermission('changes.approve')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as {
        decision?: unknown;
        comments?: unknown;
      };

      if (!body.decision || !['APPROVED', 'REJECTED'].includes(body.decision as string)) {
        return reply.status(400).send({ error: 'decision must be APPROVED or REJECTED' });
      }

      try {
        const result = await recordApproval(
          tenantId,
          id,
          userId,
          body.decision as 'APPROVED' | 'REJECTED',
          typeof body.comments === 'string' ? body.comments : undefined,
          userId,
        );
        return reply.status(200).send(result);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: error.message });
        }
        if (error.statusCode === 409) {
          return reply.status(409).send({ error: error.message });
        }
        throw err;
      }
    },
  );

  // ─── GET /api/v1/changes/:id/collisions — Check scheduling collisions ─────────

  fastify.get(
    '/api/v1/changes/:id/collisions',
    { preHandler: [requirePermission('changes.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const change = await getChange(tenantId, id);
      if (!change) {
        return reply.status(404).send({ error: 'Change not found' });
      }

      if (!change.scheduledStart || !change.scheduledEnd) {
        return reply.status(400).send({
          error: 'Change must have scheduledStart and scheduledEnd to check collisions',
        });
      }

      const collisions = await getCollisions(
        tenantId,
        change.scheduledStart,
        change.scheduledEnd,
        id,
      );

      return reply.status(200).send({ collisions });
    },
  );

  // ─── POST /api/v1/changes/:id/assets — Link asset to change ──────────────────

  fastify.post(
    '/api/v1/changes/:id/assets',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as { assetId?: unknown };

      if (!body.assetId || typeof body.assetId !== 'string') {
        return reply.status(400).send({ error: 'assetId is required' });
      }

      try {
        const record = await linkAsset(tenantId, id, body.assetId);
        return reply.status(201).send(record);
      } catch (err) {
        const error = err as Error & { code?: string };
        // Handle unique constraint violation
        if (error.code === 'P2002') {
          return reply.status(409).send({ error: 'Asset already linked to this change' });
        }
        throw err;
      }
    },
  );

  // ─── POST /api/v1/changes/:id/applications — Link application to change ──────

  fastify.post(
    '/api/v1/changes/:id/applications',
    { preHandler: [requirePermission('changes.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as { applicationId?: unknown };

      if (!body.applicationId || typeof body.applicationId !== 'string') {
        return reply.status(400).send({ error: 'applicationId is required' });
      }

      try {
        const record = await linkApplication(tenantId, id, body.applicationId);
        return reply.status(201).send(record);
      } catch (err) {
        const error = err as Error & { code?: string };
        // Handle unique constraint violation
        if (error.code === 'P2002') {
          return reply.status(409).send({ error: 'Application already linked to this change' });
        }
        throw err;
      }
    },
  );

  // ─── GET /api/v1/changes/risk-score — Calculate risk score ───────────────────

  fastify.get(
    '/api/v1/changes/risk-score',
    { preHandler: [requirePermission('changes.read')] },
    async (request, reply) => {
      const query = request.query as {
        type?: string;
        ciCount?: string;
        hasCriticalApp?: string;
      };

      const type = (query.type as 'STANDARD' | 'NORMAL' | 'EMERGENCY') ?? 'NORMAL';
      const ciCount = query.ciCount ? parseInt(query.ciCount, 10) : 0;
      const hasCriticalApp = query.hasCriticalApp === 'true';

      const riskLevel = calculateRiskScore(type, ciCount, hasCriticalApp);
      return reply.status(200).send({ riskLevel });
    },
  );
}
