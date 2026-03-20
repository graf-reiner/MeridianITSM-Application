import { prisma } from '@meridian/db';
import { hashSync } from '@node-rs/bcrypt';

type SubscriptionPlanTier = 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE';

export interface ProvisionTenantInput {
  name: string;
  slug: string;
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
  const { name, slug, adminEmail, adminPassword, planTier = 'STARTER', stripeCustomerId } = input;

  const passwordHash = hashSync(adminPassword, 10);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create tenant
    const tenant = await tx.tenant.create({
      data: {
        name,
        slug,
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
