import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withTenantScope } from '../extensions/tenant.js';

describe('Tenant Extension - Cross-tenant Isolation', () => {
  const prisma = new PrismaClient();
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    // Create two test tenants
    const tenantA = await prisma.tenant.create({
      data: { name: 'Test Tenant A', slug: `test-a-${Date.now()}`, type: 'MSP' },
    });
    const tenantB = await prisma.tenant.create({
      data: { name: 'Test Tenant B', slug: `test-b-${Date.now()}`, type: 'MSP' },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    // Create a role in each tenant
    const scopedA = prisma.$extends(withTenantScope(tenantAId));
    const scopedB = prisma.$extends(withTenantScope(tenantBId));

    await scopedA.role.create({
      data: { name: 'Admin A', slug: 'admin-a', permissions: ['*'], isSystemRole: false },
    });
    await scopedB.role.create({
      data: { name: 'Admin B', slug: 'admin-b', permissions: ['*'], isSystemRole: false },
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.role.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
  });

  it('tenant B cannot read tenant A roles', async () => {
    const scopedB = prisma.$extends(withTenantScope(tenantBId));
    const roles = await scopedB.role.findMany();
    const hasA = roles.some((r: any) => r.name === 'Admin A');
    expect(hasA).toBe(false);
  });

  it('tenant A cannot read tenant B roles', async () => {
    const scopedA = prisma.$extends(withTenantScope(tenantAId));
    const roles = await scopedA.role.findMany();
    const hasB = roles.some((r: any) => r.name === 'Admin B');
    expect(hasB).toBe(false);
  });

  it('scoped client automatically injects tenantId on create', async () => {
    const scopedA = prisma.$extends(withTenantScope(tenantAId));
    const role = await scopedA.role.create({
      data: { name: 'Auto Scoped', slug: `auto-${Date.now()}`, permissions: ['test'], isSystemRole: false },
    });
    expect(role.tenantId).toBe(tenantAId);
    // Cleanup
    await prisma.role.delete({ where: { id: role.id } });
  });

  it('global models are NOT tenant-scoped', async () => {
    // Tenant model itself should not have tenantId injected
    const scopedA = prisma.$extends(withTenantScope(tenantAId));
    const tenants = await scopedA.tenant.findMany();
    // Should find both tenants (not filtered by tenantId)
    expect(tenants.length).toBeGreaterThanOrEqual(2);
  });
});
