// ─── Default Notification Rules — Tenant Seeder ──────────────────────────────
// Canonical list of default notification rules every new tenant gets, plus a
// helper that idempotently creates them inside an existing Prisma transaction.
//
// Used by:
//   - apps/api/src/routes/auth/signup.ts        (auto-seed on tenant creation)
//   - apps/api/src/routes/v1/settings/notification-rules.ts
//                                               (POST /generate-defaults — "Restore Defaults" UI button)
//
// Idempotency contract: skip-by-name. Re-running the seeder never duplicates a
// rule the tenant already has, and never resurrects one the tenant deleted by
// id (only by name match). Callers can run it as many times as they like.

import type { Prisma } from '@meridian/db';

interface DefaultRuleAction {
  type: string;
  recipients?: string[];
  title?: string;
  subject?: string;
  body?: string;
}

interface DefaultRule {
  name: string;
  trigger: string;
  conditionGroups: unknown[];
  actions: DefaultRuleAction[];
  priority: number;
  stopAfterMatch?: boolean;
}

export const DEFAULT_NOTIFICATION_RULES: DefaultRule[] = [
  {
    name: 'Notify assignee on ticket creation',
    trigger: 'TICKET_CREATED',
    conditionGroups: [],
    actions: [
      { type: 'in_app', recipients: ['assignee'], title: 'New ticket assigned: {{ticket.title}}' },
      { type: 'email', recipients: ['assignee'], subject: 'New ticket: {{ticket.title}}', body: 'A new ticket has been assigned to you.' },
    ],
    priority: 10,
  },
  {
    name: 'Notify on ticket assignment',
    trigger: 'TICKET_ASSIGNED',
    conditionGroups: [],
    actions: [
      { type: 'in_app', recipients: ['assignee'], title: 'Ticket assigned to you: {{ticket.title}}' },
      { type: 'email', recipients: ['assignee'], subject: 'Ticket assigned: {{ticket.title}}', body: 'A ticket has been assigned to you.' },
    ],
    priority: 20,
  },
  {
    name: 'Notify on ticket comment',
    trigger: 'TICKET_COMMENTED',
    conditionGroups: [],
    actions: [
      { type: 'in_app', recipients: ['assignee', 'requester'], title: 'New comment on: {{ticket.title}}' },
      { type: 'email', recipients: ['assignee', 'requester'], subject: 'New comment: {{ticket.title}}', body: 'A new comment has been added to your ticket.' },
    ],
    priority: 30,
  },
  {
    name: 'Notify requester on ticket resolution',
    trigger: 'TICKET_RESOLVED',
    conditionGroups: [],
    actions: [
      { type: 'in_app', recipients: ['requester'], title: 'Ticket resolved: {{ticket.title}}' },
      { type: 'email', recipients: ['requester'], subject: 'Ticket resolved: {{ticket.title}}', body: 'Your ticket has been resolved.' },
    ],
    priority: 40,
  },
  {
    name: 'Notify on ticket update',
    trigger: 'TICKET_UPDATED',
    conditionGroups: [],
    actions: [
      { type: 'in_app', recipients: ['assignee', 'requester'], title: 'Ticket updated: {{ticket.title}}' },
    ],
    priority: 50,
  },
  {
    name: 'SLA breach alert',
    trigger: 'SLA_BREACH',
    conditionGroups: [],
    actions: [
      { type: 'in_app', recipients: ['assignee', 'group_members'], title: 'SLA BREACHED: {{ticket.title}}' },
      { type: 'email', recipients: ['assignee', 'group_members'], subject: 'SLA Breach: {{ticket.title}}', body: 'An SLA has been breached. Immediate action required.' },
    ],
    priority: 5,
    stopAfterMatch: false,
  },
  {
    name: 'SLA warning alert',
    trigger: 'SLA_WARNING',
    conditionGroups: [],
    actions: [
      { type: 'in_app', recipients: ['assignee'], title: 'SLA Warning: {{ticket.title}}' },
    ],
    priority: 6,
  },
];

export interface SeedResult {
  created: string[];
  skipped: string[];
}

export async function seedDefaultNotificationRules(
  tx: Prisma.TransactionClient,
  tenantId: string,
  createdById?: string,
): Promise<SeedResult> {
  const existing = await tx.notificationRule.findMany({
    where: { tenantId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((r) => r.name));

  const created: string[] = [];
  const skipped: string[] = [];

  for (const def of DEFAULT_NOTIFICATION_RULES) {
    if (existingNames.has(def.name)) {
      skipped.push(def.name);
      continue;
    }
    await tx.notificationRule.create({
      data: {
        tenantId,
        name: def.name,
        trigger: def.trigger,
        conditionGroups: def.conditionGroups as never,
        actions: def.actions as never,
        priority: def.priority,
        stopAfterMatch: def.stopAfterMatch ?? false,
        isActive: true,
        createdById: createdById ?? null,
      },
    });
    created.push(def.name);
  }

  return { created, skipped };
}
