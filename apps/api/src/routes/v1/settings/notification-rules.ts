import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';
import { invalidateRulesCache } from '../../../services/notification-rules.service.js';
import {
  evaluateConditionGroups,
  type ConditionGroup,
  type EventContext,
} from '../../../services/notification-rules-conditions.js';

const VALID_TRIGGERS = [
  'TICKET_CREATED', 'TICKET_ASSIGNED', 'TICKET_COMMENTED', 'TICKET_RESOLVED',
  'TICKET_UPDATED', 'SLA_WARNING', 'SLA_BREACH', 'CHANGE_CREATED',
  'CHANGE_APPROVED', 'CHANGE_UPDATED', 'CAB_INVITATION', 'MENTION', 'SYSTEM',
] as const;

const BASE = '/api/v1/settings/notification-rules';

export async function notificationRulesRoutes(app: FastifyInstance): Promise<void> {
  // GET - List rules
  app.get(BASE, { preHandler: [requirePermission('settings:read')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { tenantId } = user;
    const query = request.query as { trigger?: string; active?: string };
    const where: Record<string, unknown> = { tenantId };
    if (query.trigger) where.trigger = query.trigger;
    if (query.active !== undefined) where.isActive = query.active === 'true';
    const rules = await prisma.notificationRule.findMany({
      where, include: { _count: { select: { logs: true } } }, orderBy: { priority: 'asc' },
    });
    return reply.send(rules);
  });

  // POST - Create rule
  app.post(BASE, { preHandler: [requirePermission('settings:update')] }, async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId } = user;
    const body = request.body as {
      name?: string; description?: string; trigger?: string;
      conditionGroups?: unknown; actions?: unknown; priority?: number;
      stopAfterMatch?: boolean; scopedQueueId?: string; isActive?: boolean;
    };
    if (!body.name) return reply.code(400).send({ error: 'name is required' });
    if (!body.trigger) return reply.code(400).send({ error: 'trigger is required' });
    if (!VALID_TRIGGERS.includes(body.trigger as typeof VALID_TRIGGERS[number])) {
      return reply.code(400).send({ error: 'Invalid trigger. Must be one of: ' + VALID_TRIGGERS.join(', ') });
    }
    if (!body.actions || !Array.isArray(body.actions) || body.actions.length === 0) {
      return reply.code(400).send({ error: 'actions must be a non-empty array' });
    }
    const rule = await prisma.notificationRule.create({
      data: {
        tenantId, name: body.name, description: body.description ?? null,
        trigger: body.trigger, conditionGroups: (body.conditionGroups ?? []) as never,
        actions: body.actions as never, priority: body.priority ?? 100,
        stopAfterMatch: body.stopAfterMatch ?? false,
        scopedQueueId: body.scopedQueueId ?? null,
        isActive: body.isActive ?? true, createdById: user.userId,
      },
    });
    await invalidateRulesCache(tenantId);
    return reply.code(201).send(rule);
  });

  // PATCH /reorder - Bulk reorder priorities (registered before /:id)
  app.patch(BASE + '/reorder', { preHandler: [requirePermission('settings:update')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { tenantId } = user;
    const body = request.body as { rules?: Array<{ id: string; priority: number }> };
    if (!body.rules || !Array.isArray(body.rules) || body.rules.length === 0) {
      return reply.code(400).send({ error: 'rules must be a non-empty array of { id, priority }' });
    }
    const ruleIds = body.rules.map((r) => r.id);
    const existing = await prisma.notificationRule.findMany({
      where: { id: { in: ruleIds }, tenantId }, select: { id: true },
    });
    const existingIds = new Set(existing.map((r) => r.id));
    for (const r of body.rules) {
      if (!existingIds.has(r.id)) return reply.code(404).send({ error: 'Rule not found: ' + r.id });
    }
    await prisma.$transaction(
      body.rules.map((r) => prisma.notificationRule.update({ where: { id: r.id }, data: { priority: r.priority } })),
    );
    await invalidateRulesCache(tenantId);
    return reply.send({ ok: true, updated: body.rules.length });
  });

  // POST /generate-defaults - Create default rules (registered before /:id)
  app.post(BASE + '/generate-defaults', { preHandler: [requirePermission('settings:update')] }, async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId } = user;
    const defaults = [
      { name: 'Notify assignee on ticket creation', trigger: 'TICKET_CREATED', conditionGroups: [] as unknown[],
        actions: [{ type: 'in_app', recipients: ['assignee'], title: 'New ticket assigned: {{ticket.title}}' },
          { type: 'email', recipients: ['assignee'], subject: 'New ticket: {{ticket.title}}', body: 'A new ticket has been assigned to you.' }], priority: 10 },
      { name: 'Notify on ticket assignment', trigger: 'TICKET_ASSIGNED', conditionGroups: [] as unknown[],
        actions: [{ type: 'in_app', recipients: ['assignee'], title: 'Ticket assigned to you: {{ticket.title}}' },
          { type: 'email', recipients: ['assignee'], subject: 'Ticket assigned: {{ticket.title}}', body: 'A ticket has been assigned to you.' }], priority: 20 },
      { name: 'Notify on ticket comment', trigger: 'TICKET_COMMENTED', conditionGroups: [] as unknown[],
        actions: [{ type: 'in_app', recipients: ['assignee', 'requester'], title: 'New comment on: {{ticket.title}}' },
          { type: 'email', recipients: ['assignee', 'requester'], subject: 'New comment: {{ticket.title}}', body: 'A new comment has been added to your ticket.' }], priority: 30 },
      { name: 'Notify requester on ticket resolution', trigger: 'TICKET_RESOLVED', conditionGroups: [] as unknown[],
        actions: [{ type: 'in_app', recipients: ['requester'], title: 'Ticket resolved: {{ticket.title}}' },
          { type: 'email', recipients: ['requester'], subject: 'Ticket resolved: {{ticket.title}}', body: 'Your ticket has been resolved.' }], priority: 40 },
      { name: 'Notify on ticket update', trigger: 'TICKET_UPDATED', conditionGroups: [] as unknown[],
        actions: [{ type: 'in_app', recipients: ['assignee', 'requester'], title: 'Ticket updated: {{ticket.title}}' }], priority: 50 },
      { name: 'SLA breach alert', trigger: 'SLA_BREACH', conditionGroups: [] as unknown[],
        actions: [{ type: 'in_app', recipients: ['assignee', 'group_members'], title: 'SLA BREACHED: {{ticket.title}}' },
          { type: 'email', recipients: ['assignee', 'group_members'], subject: 'SLA Breach: {{ticket.title}}', body: 'An SLA has been breached. Immediate action required.' }], priority: 5, stopAfterMatch: false },
      { name: 'SLA warning alert', trigger: 'SLA_WARNING', conditionGroups: [] as unknown[],
        actions: [{ type: 'in_app', recipients: ['assignee'], title: 'SLA Warning: {{ticket.title}}' }], priority: 6 },
    ];
    const existingRules = await prisma.notificationRule.findMany({ where: { tenantId }, select: { name: true } });
    const existingNames = new Set(existingRules.map((r) => r.name));
    const created: string[] = [];
    const skipped: string[] = [];
    for (const def of defaults) {
      if (existingNames.has(def.name)) { skipped.push(def.name); continue; }
      await prisma.notificationRule.create({
        data: {
          tenantId, name: def.name, trigger: def.trigger,
          conditionGroups: def.conditionGroups as never, actions: def.actions as never,
          priority: def.priority,
          stopAfterMatch: (def as { stopAfterMatch?: boolean }).stopAfterMatch ?? false,
          isActive: true, createdById: user.userId,
        },
      });
      created.push(def.name);
    }
    await invalidateRulesCache(tenantId);
    return reply.code(201).send({ created: created.length, skipped: skipped.length, createdNames: created, skippedNames: skipped });
  });

  // GET /:id - Get single rule with recent logs
  app.get(BASE + '/:id', { preHandler: [requirePermission('settings:read')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { tenantId } = user;
    const { id } = request.params as { id: string };
    const rule = await prisma.notificationRule.findFirst({
      where: { id, tenantId },
      include: { logs: { orderBy: { firedAt: 'desc' }, take: 20 } },
    });
    if (!rule) return reply.code(404).send({ error: 'Notification rule not found' });
    return reply.send(rule);
  });

  // PATCH /:id - Update rule
  app.patch(BASE + '/:id', { preHandler: [requirePermission('settings:update')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { tenantId } = user;
    const { id } = request.params as { id: string };
    const existing = await prisma.notificationRule.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.code(404).send({ error: 'Notification rule not found' });
    const body = request.body as {
      name?: string; description?: string; trigger?: string;
      conditionGroups?: unknown; actions?: unknown; priority?: number;
      stopAfterMatch?: boolean; scopedQueueId?: string | null; isActive?: boolean;
    };
    if (body.trigger && !VALID_TRIGGERS.includes(body.trigger as typeof VALID_TRIGGERS[number])) {
      return reply.code(400).send({ error: 'Invalid trigger. Must be one of: ' + VALID_TRIGGERS.join(', ') });
    }
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.trigger !== undefined) updateData.trigger = body.trigger;
    if (body.conditionGroups !== undefined) updateData.conditionGroups = body.conditionGroups;
    if (body.actions !== undefined) updateData.actions = body.actions;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.stopAfterMatch !== undefined) updateData.stopAfterMatch = body.stopAfterMatch;
    if (body.scopedQueueId !== undefined) updateData.scopedQueueId = body.scopedQueueId;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    const updated = await prisma.notificationRule.update({ where: { id }, data: updateData as never });
    await invalidateRulesCache(tenantId);
    return reply.send(updated);
  });

  // DELETE /:id - Delete rule and associated logs
  app.delete(BASE + '/:id', { preHandler: [requirePermission('settings:update')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { tenantId } = user;
    const { id } = request.params as { id: string };
    const existing = await prisma.notificationRule.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.code(404).send({ error: 'Notification rule not found' });
    await prisma.notificationRuleLog.deleteMany({ where: { ruleId: id } });
    await prisma.notificationRule.delete({ where: { id } });
    await invalidateRulesCache(tenantId);
    return reply.code(204).send();
  });

  // POST /:id/test - Dry-run condition evaluation
  app.post(BASE + '/:id/test', { preHandler: [requirePermission('settings:update')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { tenantId } = user;
    const { id } = request.params as { id: string };
    const rule = await prisma.notificationRule.findFirst({ where: { id, tenantId } });
    if (!rule) return reply.code(404).send({ error: 'Notification rule not found' });
    const body = request.body as EventContext;
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ error: 'Request body must be a valid event context object' });
    }
    const conditionGroups = rule.conditionGroups as ConditionGroup[] | undefined;
    const conditionResults: Array<{ groupIndex: number; matched: boolean }> = [];
    if (conditionGroups && conditionGroups.length > 0) {
      for (let i = 0; i < conditionGroups.length; i++) {
        const groupMatched = evaluateConditionGroups([conditionGroups[i]], body);
        conditionResults.push({ groupIndex: i, matched: groupMatched });
      }
    }
    const matched = evaluateConditionGroups(conditionGroups, body);
    return reply.send({ matched, conditionResults, rule: { id: rule.id, name: rule.name, trigger: rule.trigger } });
  });

  // GET /:id/logs - Paginated logs for a rule
  app.get(BASE + '/:id/logs', { preHandler: [requirePermission('settings:read')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { tenantId } = user;
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; pageSize?: string };
    const rule = await prisma.notificationRule.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!rule) return reply.code(404).send({ error: 'Notification rule not found' });
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize ?? '50', 10) || 50));
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      prisma.notificationRuleLog.findMany({ where: { ruleId: id, tenantId }, orderBy: { firedAt: 'desc' }, skip, take: pageSize }),
      prisma.notificationRuleLog.count({ where: { ruleId: id, tenantId } }),
    ]);
    return reply.send({ data, total, page, pageSize });
  });
}
