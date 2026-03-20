import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { hashSync } from '@node-rs/bcrypt';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // 1. Default MSP tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'msp-default' },
    update: {},
    create: {
      name: 'Default MSP',
      slug: 'msp-default',
      type: 'MSP',
      status: 'ACTIVE',
      subdomain: 'default',
      plan: 'PROFESSIONAL',
      maxUsers: 50,
      maxAgents: 25,
      maxSites: 10,
    },
  });
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // 2. System roles
  const roles = [
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
      permissions: [
        'tickets.read',
        'tickets.update',
        'tickets.create',
        'knowledge.read',
        'assets.read',
      ],
      isSystemRole: true,
    },
    {
      name: 'End User',
      slug: 'end_user',
      permissions: ['tickets.create', 'tickets.read.own', 'knowledge.read.public'],
      isSystemRole: true,
    },
  ];

  const seededRoles: Record<string, { id: string }> = {};
  for (const role of roles) {
    const seededRole = await prisma.role.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: role.slug } },
      update: {},
      create: {
        ...role,
        permissions: role.permissions,
        tenantId: tenant.id,
      },
    });
    seededRoles[role.slug] = seededRole;
    console.log(`Role: ${role.name}`);
  }

  // 3. Test users
  const testUsers = [
    {
      email: 'admin@msp.local',
      password: 'Admin123!',
      roleSlug: 'admin',
      firstName: 'MSP',
      lastName: 'Admin',
    },
    {
      email: 'agent@msp.local',
      password: 'Agent123!',
      roleSlug: 'agent',
      firstName: 'Test',
      lastName: 'Agent',
    },
    {
      email: 'user@customer.local',
      password: 'User123!',
      roleSlug: 'end_user',
      firstName: 'Customer',
      lastName: 'User',
    },
  ];

  for (const u of testUsers) {
    const passwordHash = hashSync(u.password, 10);
    const user = await prisma.user.upsert({
      where: { tenantId_email: { email: u.email, tenantId: tenant.id } },
      update: {},
      create: {
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        tenantId: tenant.id,
        status: 'ACTIVE',
      },
    });

    const role = seededRoles[u.roleSlug];
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id, tenantId: tenant.id },
      });
    }
    console.log(`User: ${u.email}`);
  }

  // 4. Default SLA policies
  const slas = [
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

  for (const sla of slas) {
    await prisma.sLA.upsert({
      where: {
        tenantId_name: { tenantId: tenant.id, name: sla.name },
      },
      update: {},
      create: { ...sla, tenantId: tenant.id },
    });
    console.log(`SLA: ${sla.name}`);
  }

  // 5. Default categories
  const categories = [
    { name: 'Hardware', icon: 'computer', color: '#3B82F6' },
    { name: 'Software', icon: 'apps', color: '#8B5CF6' },
    { name: 'Network', icon: 'wifi', color: '#10B981' },
    { name: 'Account', icon: 'person', color: '#F59E0B' },
    { name: 'Other', icon: 'help', color: '#6B7280' },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: category.name } },
      update: {},
      create: { ...category, tenantId: tenant.id },
    });
    console.log(`Category: ${category.name}`);
  }

  // 6. Subscription plans (GLOBAL — no tenantId)
  const plans = [
    {
      name: 'STARTER' as const,
      displayName: 'Starter',
      monthlyPriceUsd: 29.0,
      annualPriceUsd: 290.0,
      limitsJson: {
        maxUsers: 5,
        maxAgents: 0,
        maxSites: 1,
        maxTicketsPerMonth: 500,
        features: ['tickets', 'knowledge', 'email'],
      },
      isPublic: true,
    },
    {
      name: 'PROFESSIONAL' as const,
      displayName: 'Professional',
      monthlyPriceUsd: 79.0,
      annualPriceUsd: 790.0,
      limitsJson: {
        maxUsers: 25,
        maxAgents: 10,
        maxSites: 5,
        maxTicketsPerMonth: 5000,
        features: ['tickets', 'knowledge', 'email', 'assets', 'agents', 'api'],
      },
      isPublic: true,
    },
    {
      name: 'BUSINESS' as const,
      displayName: 'Business',
      monthlyPriceUsd: 149.0,
      annualPriceUsd: 1490.0,
      limitsJson: {
        maxUsers: 100,
        maxAgents: 50,
        maxSites: 20,
        maxTicketsPerMonth: 25000,
        features: [
          'tickets',
          'knowledge',
          'email',
          'assets',
          'agents',
          'api',
          'cmdb',
          'webhooks',
          'reports',
        ],
      },
      isPublic: true,
    },
    {
      name: 'ENTERPRISE' as const,
      displayName: 'Enterprise',
      monthlyPriceUsd: 299.0,
      annualPriceUsd: 2990.0,
      limitsJson: {
        maxUsers: -1,
        maxAgents: -1,
        maxSites: -1,
        maxTicketsPerMonth: -1,
        features: [
          'tickets',
          'knowledge',
          'email',
          'assets',
          'agents',
          'api',
          'cmdb',
          'webhooks',
          'reports',
          'mobile',
          'sso',
          'multi-tenant',
        ],
      },
      isPublic: true,
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {},
      create: plan,
    });
    console.log(`Subscription plan: ${plan.displayName}`);
  }

  // 7. Sample customer organization
  const customerOrg = await prisma.customerOrganization.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'acme-corp' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Acme Corporation',
      slug: 'acme-corp',
      primaryContactName: 'Jane Smith',
      primaryContactEmail: 'jane.smith@acme.example.com',
      city: 'San Francisco',
      state: 'CA',
      country: 'US',
    },
  });
  console.log(`Customer org: ${customerOrg.name}`);

  // 8. Owner admin user (GLOBAL — no tenantId)
  const ownerPasswordHash = hashSync('Owner123!', 10);
  await prisma.ownerUser.upsert({
    where: { email: 'owner@meridian.local' },
    update: {},
    create: {
      email: 'owner@meridian.local',
      passwordHash: ownerPasswordHash,
      totpEnabled: false,
    },
  });
  console.log('Owner User: owner@meridian.local');

  console.log('\nSeeding complete!');
  console.log('\nTest credentials:');
  console.log('  admin@msp.local / Admin123!');
  console.log('  agent@msp.local / Agent123!');
  console.log('  user@customer.local / User123!');
  console.log('  owner@meridian.local / Owner123! (owner admin)');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
