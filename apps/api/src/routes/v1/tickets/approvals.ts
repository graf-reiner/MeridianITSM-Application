import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { dispatchNotificationEvent } from '../../../services/notification-rules.service.js';

/**
 * Ticket Approval REST API routes.
 *
 * Approval Rules (admin):
 *   GET    /api/v1/ticket-approval-rules        — List rules
 *   POST   /api/v1/ticket-approval-rules        — Create rule
 *   PATCH  /api/v1/ticket-approval-rules/:id    — Update rule
 *   DELETE /api/v1/ticket-approval-rules/:id    — Delete rule
 *
 * Approvals:
 *   GET    /api/v1/tickets/:id/approvals        — Get approval status for a ticket
 *   POST   /api/v1/tickets/:id/approvals/check  — Check if approval is required (dry run)
 *   POST   /api/v1/tickets/:id/approvals/submit — Submit ticket for approval
 *   POST   /api/v1/tickets/approvals/:id/decide — Approve or reject
 *   GET    /api/v1/tickets/my-approvals         — List tickets pending my approval
 */
export async function ticketApprovalRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── Approval Rules CRUD ──────────────────────────────────────────────────

  fastify.get('/api/v1/ticket-approval-rules', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const rules = await prisma.ticketApprovalRule.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { priority: 'asc' },
    });
    return reply.status(200).send(rules);
  });

  fastify.post('/api/v1/ticket-approval-rules', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const body = request.body as {
      name: string;
      conditions: Record<string, unknown>;
      approvers: Array<{ stage: number; type: string; targetId?: string; approveMode?: string }>;
      priority?: number;
    };

    if (!body.name || !body.conditions || !body.approvers) {
      return reply.status(400).send({ error: 'name, conditions, and approvers are required' });
    }

    const rule = await prisma.ticketApprovalRule.create({
      data: {
        tenantId: user.tenantId,
        name: body.name,
        conditions: body.conditions,
        approvers: body.approvers as any,
        priority: body.priority ?? 0,
      },
    });

    return reply.status(201).send(rule);
  });

  fastify.patch('/api/v1/ticket-approval-rules/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.ticketApprovalRule.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Rule not found' });

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.conditions !== undefined) updates.conditions = body.conditions;
    if (body.approvers !== undefined) updates.approvers = body.approvers;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const rule = await prisma.ticketApprovalRule.update({ where: { id }, data: updates });
    return reply.status(200).send(rule);
  });

  fastify.delete('/api/v1/ticket-approval-rules/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const existing = await prisma.ticketApprovalRule.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Rule not found' });

    await prisma.ticketApprovalRule.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ─── GET /api/v1/tickets/:id/approvals — Approval status ─────────────────

  fastify.get('/api/v1/tickets/:id/approvals', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const approvals = await prisma.ticketApproval.findMany({
      where: { ticketId: id, tenantId: user.tenantId },
      include: {
        approver: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }],
    });

    return reply.status(200).send(approvals);
  });

  // ─── POST /api/v1/tickets/:id/approvals/check — Dry-run check ────────────

  fastify.post('/api/v1/tickets/:id/approvals/check', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const ticket = await prisma.ticket.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { type: true, priority: true, categoryId: true, customFields: true },
    });

    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });

    const matchingRule = await findMatchingRule(user.tenantId, ticket);

    return reply.status(200).send({
      approvalRequired: matchingRule !== null,
      rule: matchingRule ? { id: matchingRule.id, name: matchingRule.name } : null,
    });
  });

  // ─── POST /api/v1/tickets/:id/approvals/submit — Submit for approval ─────

  fastify.post('/api/v1/tickets/:id/approvals/submit', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };

    const ticket = await prisma.ticket.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, ticketNumber: true, title: true, type: true, priority: true, categoryId: true, customFields: true, status: true },
    });

    if (!ticket) return reply.status(404).send({ error: 'Ticket not found' });

    const rule = await findMatchingRule(user.tenantId, ticket);
    if (!rule) {
      return reply.status(200).send({ approvalRequired: false });
    }

    const approverStages = rule.approvers as Array<{ stage: number; type: string; targetId?: string; approveMode?: string }>;

    // Create approval records for the first stage
    const firstStage = approverStages.filter(a => a.stage === 1);
    const approvalRecords = firstStage
      .filter(a => a.type === 'user' && a.targetId)
      .map(a => ({
        tenantId: user.tenantId,
        ticketId: id,
        ruleId: rule.id,
        stage: 1,
        approverId: a.targetId!,
        status: 'PENDING',
      }));

    if (approvalRecords.length === 0) {
      return reply.status(400).send({ error: 'No approvers configured for this rule' });
    }

    await prisma.$transaction([
      prisma.ticketApproval.createMany({ data: approvalRecords }),
      prisma.ticket.update({
        where: { id },
        data: { status: 'PENDING_APPROVAL' },
      }),
      prisma.ticketActivity.create({
        data: {
          tenantId: user.tenantId,
          ticketId: id,
          actorId: user.userId,
          activityType: 'APPROVAL_REQUESTED',
          metadata: { ruleId: rule.id, ruleName: rule.name, stage: 1 },
        },
      }),
    ]);

    // Notify approvers
    for (const record of approvalRecords) {
      await dispatchNotificationEvent(user.tenantId, 'TICKET_APPROVAL_REQUESTED', {
        ticket: { id: ticket.id, ticketNumber: ticket.ticketNumber, title: ticket.title, type: ticket.type, priority: ticket.priority, status: 'PENDING_APPROVAL' },
        actorId: user.userId,
        newAssignedToId: record.approverId,
        origin: { type: 'user', actorId: user.userId },
      }).catch(() => {});
    }

    return reply.status(200).send({ approvalRequired: true, approvalCount: approvalRecords.length });
  });

  // ─── POST /api/v1/tickets/approvals/:id/decide — Approve/Reject ──────────

  fastify.post('/api/v1/tickets/approvals/:id/decide', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };
    const { decision, comment } = request.body as { decision: 'APPROVED' | 'REJECTED'; comment?: string };

    if (!decision || !['APPROVED', 'REJECTED'].includes(decision)) {
      return reply.status(400).send({ error: 'decision must be APPROVED or REJECTED' });
    }

    const approval = await prisma.ticketApproval.findFirst({
      where: { id, tenantId: user.tenantId, approverId: user.userId, status: 'PENDING' },
    });

    if (!approval) {
      return reply.status(404).send({ error: 'Pending approval not found or you are not the approver' });
    }

    await prisma.ticketApproval.update({
      where: { id },
      data: { status: decision, comment: comment ?? null, decidedAt: new Date() },
    });

    await prisma.ticketActivity.create({
      data: {
        tenantId: user.tenantId,
        ticketId: approval.ticketId,
        actorId: user.userId,
        activityType: decision === 'APPROVED' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
        metadata: { approvalId: id, comment },
      },
    });

    // Check if all approvals for this stage are decided
    const stageApprovals = await prisma.ticketApproval.findMany({
      where: { ticketId: approval.ticketId, stage: approval.stage, tenantId: user.tenantId },
    });

    const allDecided = stageApprovals.every(a => a.status !== 'PENDING');
    if (allDecided) {
      const anyRejected = stageApprovals.some(a => a.status === 'REJECTED');
      const newStatus = anyRejected ? 'CANCELLED' : 'OPEN';

      await prisma.ticket.update({
        where: { id: approval.ticketId },
        data: { status: newStatus },
      });

      await prisma.ticketActivity.create({
        data: {
          tenantId: user.tenantId,
          ticketId: approval.ticketId,
          actorId: user.userId,
          activityType: 'FIELD_CHANGED',
          fieldName: 'status',
          oldValue: 'PENDING_APPROVAL',
          newValue: newStatus,
          metadata: { reason: anyRejected ? 'approval_rejected' : 'approval_granted' },
        },
      });
    }

    return reply.status(200).send({ decision, allDecided, ticketId: approval.ticketId });
  });

  // ─── GET /api/v1/tickets/my-approvals — Pending approvals for me ──────────

  fastify.get('/api/v1/tickets/my-approvals', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };

    const approvals = await prisma.ticketApproval.findMany({
      where: { approverId: user.userId, tenantId: user.tenantId, status: 'PENDING' },
      include: {
        ticket: {
          select: {
            id: true, ticketNumber: true, title: true, type: true,
            priority: true, status: true, createdAt: true,
            requestedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return reply.status(200).send(approvals);
  });
}

/**
 * Find the first matching approval rule for a ticket.
 */
async function findMatchingRule(
  tenantId: string,
  ticket: { type: string; priority: string; categoryId: string | null; customFields: unknown },
) {
  const rules = await prisma.ticketApprovalRule.findMany({
    where: { tenantId, isActive: true },
    orderBy: { priority: 'asc' },
  });

  for (const rule of rules) {
    const conditions = rule.conditions as Record<string, unknown>;
    let match = true;

    if (conditions.ticketType && conditions.ticketType !== ticket.type) match = false;
    if (conditions.priority && conditions.priority !== ticket.priority) match = false;
    if (conditions.categoryId && conditions.categoryId !== ticket.categoryId) match = false;

    if (match) return rule;
  }

  return null;
}
