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

  // 9. CMDB Reference Data (per tenant)
  await seedCmdbReferenceData(tenant.id);

  console.log('\nSeeding complete!');
  console.log('\nTest credentials:');
  console.log('  admin@msp.local / Admin123!');
  console.log('  agent@msp.local / Agent123!');
  console.log('  user@customer.local / User123!');
  console.log('  owner@meridian.local / Owner123! (owner admin)');
}

async function seedCmdbReferenceData(tenantId: string) {
  console.log('Seeding CMDB reference data...');

  // CI Classes (15 classes)
  const ciClasses = [
    { classKey: 'business_service', className: 'Business Service', icon: 'mdiBriefcase', description: 'Customer-facing business service' },
    { classKey: 'technical_service', className: 'Technical Service', icon: 'mdiCog', description: 'Infrastructure or platform service' },
    { classKey: 'application', className: 'Application', icon: 'mdiApplication', description: 'Software application' },
    { classKey: 'application_instance', className: 'Application Instance', icon: 'mdiApplicationCog', description: 'Deployed instance of an application' },
    { classKey: 'saas_application', className: 'SaaS Application', icon: 'mdiCloud', description: 'Cloud-hosted SaaS application' },
    { classKey: 'server', className: 'Server', icon: 'mdiServer', description: 'Physical or virtual server' },
    { classKey: 'virtual_machine', className: 'Virtual Machine', icon: 'mdiMonitor', description: 'Virtual machine instance' },
    { classKey: 'database', className: 'Database', icon: 'mdiDatabase', description: 'Database instance' },
    { classKey: 'network_device', className: 'Network Device', icon: 'mdiRouterNetwork', description: 'Network infrastructure device' },
    { classKey: 'load_balancer', className: 'Load Balancer', icon: 'mdiScaleBalance', description: 'Load balancer or traffic manager' },
    { classKey: 'storage', className: 'Storage', icon: 'mdiHarddisk', description: 'Storage system or array' },
    { classKey: 'cloud_resource', className: 'Cloud Resource', icon: 'mdiCloudOutline', description: 'Cloud platform resource' },
    { classKey: 'dns_endpoint', className: 'DNS Endpoint', icon: 'mdiDns', description: 'DNS record or endpoint' },
    { classKey: 'certificate', className: 'Certificate', icon: 'mdiCertificate', description: 'SSL/TLS certificate' },
    { classKey: 'generic', className: 'Generic', icon: 'mdiCubeOutline', description: 'Generic configuration item' },
  ];

  const classMap: Record<string, string> = {};
  for (const cls of ciClasses) {
    const record = await prisma.cmdbCiClass.upsert({
      where: { tenantId_classKey: { tenantId, classKey: cls.classKey } },
      update: {},
      create: { ...cls, tenantId },
    });
    classMap[cls.classKey] = record.id;
  }

  // Set parent classes
  const parentMappings: Record<string, string> = {
    virtual_machine: 'server',
    load_balancer: 'network_device',
    application_instance: 'application',
    saas_application: 'application',
  };
  for (const [child, parent] of Object.entries(parentMappings)) {
    if (classMap[child] && classMap[parent]) {
      await prisma.cmdbCiClass.update({
        where: { id: classMap[child] },
        data: { parentClassId: classMap[parent] },
      });
    }
  }
  console.log(`  CI Classes: ${ciClasses.length}`);

  // Statuses (lifecycle + operational)
  const statuses = [
    { statusType: 'lifecycle', statusKey: 'planned', statusName: 'Planned', sortOrder: 1 },
    { statusType: 'lifecycle', statusKey: 'ordered', statusName: 'Ordered', sortOrder: 2 },
    { statusType: 'lifecycle', statusKey: 'installed', statusName: 'Installed', sortOrder: 3 },
    { statusType: 'lifecycle', statusKey: 'in_service', statusName: 'In Service', sortOrder: 4 },
    { statusType: 'lifecycle', statusKey: 'under_change', statusName: 'Under Change', sortOrder: 5 },
    { statusType: 'lifecycle', statusKey: 'retired', statusName: 'Retired', sortOrder: 6 },
    { statusType: 'operational', statusKey: 'online', statusName: 'Online', sortOrder: 1 },
    { statusType: 'operational', statusKey: 'offline', statusName: 'Offline', sortOrder: 2 },
    { statusType: 'operational', statusKey: 'degraded', statusName: 'Degraded', sortOrder: 3 },
    { statusType: 'operational', statusKey: 'maintenance', statusName: 'Maintenance', sortOrder: 4 },
    { statusType: 'operational', statusKey: 'unknown', statusName: 'Unknown', sortOrder: 5 },
  ];

  for (const status of statuses) {
    await prisma.cmdbStatus.upsert({
      where: {
        tenantId_statusType_statusKey: {
          tenantId,
          statusType: status.statusType,
          statusKey: status.statusKey,
        },
      },
      update: {},
      create: { ...status, tenantId },
    });
  }
  console.log(`  Statuses: ${statuses.length}`);

  // Environments
  const environments = [
    { envKey: 'prod', envName: 'Production', sortOrder: 1 },
    { envKey: 'test', envName: 'Test', sortOrder: 2 },
    { envKey: 'dev', envName: 'Development', sortOrder: 3 },
    { envKey: 'qa', envName: 'QA', sortOrder: 4 },
    { envKey: 'dr', envName: 'Disaster Recovery', sortOrder: 5 },
    { envKey: 'lab', envName: 'Lab', sortOrder: 6 },
  ];

  for (const env of environments) {
    await prisma.cmdbEnvironment.upsert({
      where: { tenantId_envKey: { tenantId, envKey: env.envKey } },
      update: {},
      create: { ...env, tenantId },
    });
  }
  console.log(`  Environments: ${environments.length}`);

  // Relationship Types
  const relationshipTypes = [
    { relationshipKey: 'depends_on', relationshipName: 'Depends On', forwardLabel: 'depends on', reverseLabel: 'is depended on by' },
    { relationshipKey: 'runs_on', relationshipName: 'Runs On', forwardLabel: 'runs on', reverseLabel: 'runs' },
    { relationshipKey: 'hosted_on', relationshipName: 'Hosted On', forwardLabel: 'is hosted on', reverseLabel: 'hosts' },
    { relationshipKey: 'connected_to', relationshipName: 'Connected To', forwardLabel: 'connects to', reverseLabel: 'connects to', isDirectional: false },
    { relationshipKey: 'member_of', relationshipName: 'Member Of', forwardLabel: 'is member of', reverseLabel: 'has member' },
    { relationshipKey: 'replicated_to', relationshipName: 'Replicated To', forwardLabel: 'replicates to', reverseLabel: 'is replicated from' },
    { relationshipKey: 'backed_up_by', relationshipName: 'Backed Up By', forwardLabel: 'is backed up by', reverseLabel: 'backs up' },
    { relationshipKey: 'uses', relationshipName: 'Uses', forwardLabel: 'uses', reverseLabel: 'is used by' },
    { relationshipKey: 'supports', relationshipName: 'Supports', forwardLabel: 'supports', reverseLabel: 'is supported by' },
    { relationshipKey: 'managed_by', relationshipName: 'Managed By', forwardLabel: 'is managed by', reverseLabel: 'manages' },
    { relationshipKey: 'owned_by', relationshipName: 'Owned By', forwardLabel: 'is owned by', reverseLabel: 'owns' },
    { relationshipKey: 'contains', relationshipName: 'Contains', forwardLabel: 'contains', reverseLabel: 'is contained in' },
    { relationshipKey: 'installed_on', relationshipName: 'Installed On', forwardLabel: 'is installed on', reverseLabel: 'has installed' },
  ];

  for (const relType of relationshipTypes) {
    await prisma.cmdbRelationshipTypeRef.upsert({
      where: { tenantId_relationshipKey: { tenantId, relationshipKey: relType.relationshipKey } },
      update: {},
      create: {
        tenantId,
        relationshipKey: relType.relationshipKey,
        relationshipName: relType.relationshipName,
        forwardLabel: relType.forwardLabel,
        reverseLabel: relType.reverseLabel,
        isDirectional: relType.isDirectional ?? true,
      },
    });
  }
  console.log(`  Relationship Types: ${relationshipTypes.length}`);

  console.log('CMDB reference data seeded.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
