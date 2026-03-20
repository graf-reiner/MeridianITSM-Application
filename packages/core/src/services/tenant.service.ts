import { prisma, PrismaClient } from '@meridian/db';

type Tenant = Awaited<ReturnType<PrismaClient['tenant']['findUniqueOrThrow']>>;

/**
 * TenantService provides lookup functions for tenant resolution.
 * These methods operate on the global (non-tenant-scoped) Tenant model.
 */
export class TenantService {
  /**
   * Find a tenant by its UUID primary key.
   */
  static async findById(id: string): Promise<Tenant | null> {
    return prisma.tenant.findUnique({ where: { id } });
  }

  /**
   * Find a tenant by its URL-safe slug (e.g., "msp-default").
   */
  static async findBySlug(slug: string): Promise<Tenant | null> {
    return prisma.tenant.findUnique({ where: { slug } });
  }

  /**
   * Find a tenant by its subdomain for org-lookup resolution.
   */
  static async findBySubdomain(subdomain: string): Promise<Tenant | null> {
    return prisma.tenant.findFirst({ where: { subdomain } });
  }

  /**
   * Find an active tenant by ID — used in request middleware to verify
   * the tenant is still active before processing the request.
   */
  static async findActive(id: string): Promise<Tenant | null> {
    return prisma.tenant.findFirst({
      where: { id, status: 'ACTIVE' },
    });
  }

  /**
   * Find all active tenants (used by background jobs that fan out across tenants).
   */
  static async findAllActive(): Promise<Tenant[]> {
    return prisma.tenant.findMany({ where: { status: 'ACTIVE' } });
  }
}
