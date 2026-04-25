import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@10.1.200.153:5432/meridian',
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'msp-default' } });
  if (!tenant) {
    console.log('No tenant found');
    return;
  }
  console.log('Tenant:', tenant.id);

  const plan = await prisma.subscriptionPlan.findFirst({ where: { name: 'PROFESSIONAL' } });
  if (!plan) {
    console.log('No plan found');
    return;
  }
  console.log('Plan:', plan.id);

  const sub = await prisma.tenantSubscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  console.log('Subscription created:', sub.id, sub.status);
  await prisma.$disconnect();
}

main().catch(console.error);
