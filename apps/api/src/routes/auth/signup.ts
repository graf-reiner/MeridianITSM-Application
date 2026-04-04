import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@meridian/db';
import { hashSync } from '@node-rs/bcrypt';
import { AUTH_RATE_LIMIT } from '../../plugins/rate-limit.js';

const signupSchema = z.object({
  organizationName: z.string().min(1, 'Organisation name is required').max(100),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  planTier: z.enum(['STARTER', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE']).default('STARTER'),
});

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
 * POST /api/auth/signup
 * Public endpoint — creates a new tenant with a 14-day trial and an initial admin user.
 * No authentication required.
 */
export async function signupRoute(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/signup', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const parseResult = signupSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: parseResult.error.issues,
      });
    }

    const { organizationName, slug, email, password, planTier } = parseResult.data;

    // Check slug uniqueness
    const existingTenant = await prisma.tenant.findFirst({ where: { slug } });
    if (existingTenant) {
      return reply.code(409).send({ error: 'That organisation slug is already taken. Please choose another.' });
    }

    // Check email uniqueness across all tenants (prevent duplicate admin accounts with the same slug)
    // We allow the same email across different tenants — only block within a single tenant context.
    // However, for self-signup we want to avoid confusion: if the email+slug combo already exists, reject it.
    const existingUser = await prisma.user.findFirst({ where: { email, tenant: { slug } } });
    if (existingUser) {
      return reply.code(409).send({ error: 'An account with that email already exists for this organisation.' });
    }

    // Verify the subscription plan exists in the database (seed must have run)
    const plan = await prisma.subscriptionPlan.findUnique({ where: { name: planTier } });
    if (!plan) {
      app.log.error(`[signup] Subscription plan '${planTier}' not found — has the database been seeded?`);
      return reply.code(500).send({ error: 'Service configuration error. Please contact support.' });
    }

    const passwordHash = hashSync(password, 10);

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. Create tenant
        const tenant = await tx.tenant.create({
          data: {
            name: organizationName,
            slug,
            type: 'MSP',
            status: 'ACTIVE',
            plan: planTier,
          },
        });

        // 2. Create TenantSubscription (TRIALING, 14-day trial)
        const now = new Date();
        const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

        await tx.tenantSubscription.create({
          data: {
            tenantId: tenant.id,
            planId: plan.id,
            stripeCustomerId: null,
            status: 'TRIALING',
            trialStart: now,
            trialEnd,
          },
        });

        // 3. Seed default roles
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

        // 4. Seed default SLA policies
        for (const sla of DEFAULT_SLAS) {
          await tx.sLA.upsert({
            where: { tenantId_name: { tenantId: tenant.id, name: sla.name } },
            update: {},
            create: { ...sla, tenantId: tenant.id },
          });
        }

        // 5. Seed default categories
        for (const category of DEFAULT_CATEGORIES) {
          await tx.category.upsert({
            where: { tenantId_name: { tenantId: tenant.id, name: category.name } },
            update: {},
            create: { ...category, tenantId: tenant.id },
          });
        }

        // 6. Create initial admin user
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: 'Admin',
            lastName: 'User',
            tenantId: tenant.id,
            status: 'ACTIVE',
          },
        });

        // 7. Assign admin role to the user
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

      app.log.info(`[signup] Tenant '${result.tenant.name}' provisioned via self-service. Admin: ${result.user.email}`);

      return reply.code(201).send({
        tenant: result.tenant,
        user: result.user,
        message: 'Account created successfully. Your 14-day trial has started.',
      });
    } catch (err) {
      app.log.error({ err }, '[signup] Tenant provisioning failed');
      return reply.code(500).send({ error: 'Failed to create account. Please try again or contact support.' });
    }
  });
}
