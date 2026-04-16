import { prisma } from '@meridian/db';
import { hashSync } from '@node-rs/bcrypt';

type SubscriptionPlanTier = 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE';

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  subdomain?: string;
  adminEmail: string;
  adminPassword: string;
  planTier?: SubscriptionPlanTier;
  stripeCustomerId?: string;
}

export interface ProvisionTenantResult {
  tenant: { id: string; name: string; slug: string };
  user: { id: string; email: string };
}

const DEFAULT_ROLES = [
  {
    name: 'Admin',
    slug: 'admin',
    permissions: ['*'],
    isSystemRole: true,
  },
  {
    name: 'MSP Admin',
    slug: 'msp_admin',
    permissions: ['tickets.*', 'users.*', 'settings.*', 'knowledge.*', 'reports.*'],
    isSystemRole: true,
  },
  {
    name: 'Agent',
    slug: 'agent',
    permissions: ['tickets.read', 'tickets.update', 'tickets.create', 'knowledge.read', 'assets.read'],
    isSystemRole: true,
  },
  {
    name: 'End User',
    slug: 'end_user',
    permissions: ['tickets.create', 'tickets.read.own', 'knowledge.read.public'],
    isSystemRole: true,
  },
];

const DEFAULT_SLAS = [
  {
    name: 'Standard SLA',
    p1ResponseMinutes: 60,
    p1ResolutionMinutes: 240,
    p2ResponseMinutes: 240,
    p2ResolutionMinutes: 480,
    p3ResponseMinutes: 480,
    p3ResolutionMinutes: 1440,
    p4ResponseMinutes: 1440,
    p4ResolutionMinutes: 4320,
    businessHours: true,
    businessHoursStart: '09:00',
    businessHoursEnd: '17:00',
    businessDays: [1, 2, 3, 4, 5],
  },
  {
    name: '24/7 SLA',
    p1ResponseMinutes: 30,
    p1ResolutionMinutes: 120,
    p2ResponseMinutes: 120,
    p2ResolutionMinutes: 480,
    p3ResponseMinutes: 480,
    p3ResolutionMinutes: 1440,
    p4ResponseMinutes: 1440,
    p4ResolutionMinutes: 4320,
    businessHours: false,
    businessDays: [0, 1, 2, 3, 4, 5, 6],
  },
];

const DEFAULT_CATEGORIES = [
  { name: 'Hardware', icon: 'computer', color: '#3B82F6' },
  { name: 'Software', icon: 'apps', color: '#8B5CF6' },
  { name: 'Network', icon: 'wifi', color: '#10B981' },
  { name: 'Account', icon: 'person', color: '#F59E0B' },
  { name: 'Other', icon: 'help', color: '#6B7280' },
];

const DEFAULT_NOTIFICATION_TEMPLATES: Array<{
  name: string;
  description: string;
  channel: 'EMAIL' | 'TELEGRAM' | 'SLACK' | 'TEAMS' | 'DISCORD';
  content: Record<string, string>;
  contexts: string[];
}> = [
  {
    name: 'Ticket Assigned',
    description: 'Sent to the assignee when a ticket is assigned to them',
    channel: 'EMAIL',
    content: {
      subject: '[{{ticket.number}}] {{ticket.title}} — assigned to you',
      htmlBody:
        '<p>Hi {{assignee.firstName}},</p><p>Ticket <strong>{{ticket.number}}</strong> (<em>{{ticket.title}}</em>) has been assigned to you.</p><p>Priority: {{ticket.priority}} · Status: {{ticket.status}}</p>',
      textBody:
        'Hi {{assignee.firstName}},\n\nTicket {{ticket.number}} ({{ticket.title}}) has been assigned to you.\n\nPriority: {{ticket.priority}} · Status: {{ticket.status}}',
    },
    contexts: ['ticket', 'assignee', 'tenant', 'now'],
  },
  {
    name: 'Ticket Resolved',
    description: 'Sent to the requester when their ticket is resolved',
    channel: 'EMAIL',
    content: {
      subject: '[{{ticket.number}}] {{ticket.title}} — resolved',
      htmlBody:
        '<p>Hi {{requester.firstName}},</p><p>Your ticket <strong>{{ticket.number}}</strong> (<em>{{ticket.title}}</em>) has been resolved.</p><p>If you have any further questions, reply to this email or reopen the ticket.</p>',
      textBody:
        'Hi {{requester.firstName}},\n\nYour ticket {{ticket.number}} ({{ticket.title}}) has been resolved.\n\nIf you have any further questions, reply to this email or reopen the ticket.',
    },
    contexts: ['ticket', 'requester', 'tenant', 'now'],
  },
  {
    name: 'SLA Warning',
    description: 'Sent when a ticket is approaching its SLA deadline',
    channel: 'EMAIL',
    content: {
      subject: 'SLA warning: {{ticket.number}} approaching breach',
      htmlBody:
        '<p><strong>Heads up</strong> — ticket {{ticket.number}} ({{ticket.title}}) is approaching its SLA deadline.</p><p>Assignee: {{assignee.displayName}}<br/>Priority: {{ticket.priority}}</p>',
    },
    contexts: ['ticket', 'assignee', 'sla', 'tenant', 'now'],
  },
  {
    name: 'New Ticket Alert (Slack)',
    description: 'Short-form Slack alert for newly created tickets',
    channel: 'SLACK',
    content: {
      message:
        ':ticket: *New ticket {{ticket.number}}* — {{ticket.title}}\nPriority: {{ticket.priority}} · Requester: {{requester.displayName}}',
    },
    contexts: ['ticket', 'requester', 'tenant'],
  },
  {
    name: 'Urgent Ticket (Telegram)',
    description: 'On-call Telegram notification for critical tickets',
    channel: 'TELEGRAM',
    content: {
      message:
        '🚨 <b>Urgent ticket {{ticket.number}}</b>\n{{ticket.title}}\nPriority: {{ticket.priority}}\nAssigned: {{assignee.displayName}}',
    },
    contexts: ['ticket', 'assignee', 'tenant'],
  },
];

/**
 * Provisions a new tenant with all required defaults:
 * - Tenant record
 * - TenantSubscription (TRIALING, 14-day trial)
 * - Default system roles
 * - Default SLA policies
 * - Default categories
 * - Initial admin user
 */
export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const { name, slug, subdomain, adminEmail, adminPassword, planTier = 'STARTER', stripeCustomerId } = input;

  const passwordHash = hashSync(adminPassword, 10);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create tenant
    const tenant = await tx.tenant.create({
      data: {
        name,
        slug,
        subdomain: subdomain || null,
        type: 'MSP',
        status: 'ACTIVE',
        plan: planTier,
      },
    });

    // 2. Find subscription plan
    const plan = await tx.subscriptionPlan.findUnique({
      where: { name: planTier },
    });

    if (!plan) {
      throw new Error(`Subscription plan '${planTier}' not found. Run database seed first.`);
    }

    // 3. Create TenantSubscription (TRIALING, 14-day trial)
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    await tx.tenantSubscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        stripeCustomerId: stripeCustomerId ?? null,
        status: 'TRIALING',
        trialStart: now,
        trialEnd,
      },
    });

    // 4. Seed default roles
    const seededRoles: Record<string, string> = {};
    for (const role of DEFAULT_ROLES) {
      const seededRole = await tx.role.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: role.slug } },
        update: {},
        create: {
          ...role,
          permissions: role.permissions,
          tenantId: tenant.id,
        },
      });
      seededRoles[role.slug] = seededRole.id;
    }

    // 5. Seed default SLA policies
    for (const sla of DEFAULT_SLAS) {
      await tx.sLA.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: sla.name } },
        update: {},
        create: { ...sla, tenantId: tenant.id },
      });
    }

    // 6. Seed default categories
    for (const category of DEFAULT_CATEGORIES) {
      await tx.category.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: category.name } },
        update: {},
        create: { ...category, tenantId: tenant.id },
      });
    }

    // 6.5 Seed default notification templates (email + slack + telegram starters)
    for (const template of DEFAULT_NOTIFICATION_TEMPLATES) {
      await tx.notificationTemplate.upsert({
        where: {
          tenantId_name_channel: {
            tenantId: tenant.id,
            name: template.name,
            channel: template.channel,
          },
        },
        update: {},
        create: {
          tenantId: tenant.id,
          name: template.name,
          description: template.description,
          channel: template.channel,
          content: template.content,
          contexts: template.contexts,
          isActive: true,
        },
      });
    }

    // 7. Create initial admin user
    const user = await tx.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        tenantId: tenant.id,
        status: 'ACTIVE',
      },
    });

    // 8. Assign admin role to the user
    const adminRoleId = seededRoles['admin'];
    if (adminRoleId) {
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: adminRoleId,
          tenantId: tenant.id,
        },
      });
    }

    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      user: { id: user.id, email: user.email },
    };
  });

  // Welcome email would be enqueued here — deferred to Phase 3+
  console.log(`[provisioning] Tenant '${result.tenant.name}' provisioned. Admin: ${result.user.email}`);

  return result;
}
