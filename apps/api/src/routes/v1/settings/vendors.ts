import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Settings: Vendor Management Routes (SETT-08)
 *
 * GET    /api/v1/settings/vendors       — List vendors (with contract count)
 * GET    /api/v1/settings/vendors/:id   — Get vendor detail
 * POST   /api/v1/settings/vendors       — Create vendor
 * PATCH  /api/v1/settings/vendors/:id   — Update vendor
 * DELETE /api/v1/settings/vendors/:id   — Delete vendor
 */
export async function vendorsSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/vendors — List vendors
  fastify.get(
    '/api/v1/settings/vendors',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const vendors = await prisma.vendor.findMany({
        where: { tenantId },
        include: {
          _count: { select: { contracts: true } },
        },
        orderBy: { name: 'asc' },
      });

      return reply.status(200).send(vendors);
    },
  );

  // GET /api/v1/settings/vendors/:id — Get vendor detail
  fastify.get(
    '/api/v1/settings/vendors/:id',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const vendor = await prisma.vendor.findFirst({
        where: { id, tenantId },
        include: {
          _count: { select: { contracts: true } },
          contracts: {
            select: { id: true, name: true, contractNumber: true, endDate: true },
            orderBy: { name: 'asc' },
          },
        },
      });

      if (!vendor) {
        return reply.status(404).send({ error: 'Vendor not found' });
      }

      return reply.status(200).send(vendor);
    },
  );

  // POST /api/v1/settings/vendors — Create vendor
  fastify.post(
    '/api/v1/settings/vendors',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        name: string;
        contactName?: string;
        contactEmail?: string;
        contactPhone?: string;
        website?: string;
        notes?: string;
      };

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required' });
      }

      const vendor = await prisma.vendor.create({
        data: {
          tenantId,
          name: body.name,
          contactName: body.contactName,
          contactEmail: body.contactEmail,
          contactPhone: body.contactPhone,
          website: body.website,
          notes: body.notes,
        },
      });

      return reply.status(201).send(vendor);
    },
  );

  // PATCH /api/v1/settings/vendors/:id — Update vendor
  fastify.patch(
    '/api/v1/settings/vendors/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        contactName?: string;
        contactEmail?: string;
        contactPhone?: string;
        website?: string;
        notes?: string;
      };

      const existing = await prisma.vendor.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Vendor not found' });
      }

      const updated = await prisma.vendor.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.contactName !== undefined && { contactName: body.contactName }),
          ...(body.contactEmail !== undefined && { contactEmail: body.contactEmail }),
          ...(body.contactPhone !== undefined && { contactPhone: body.contactPhone }),
          ...(body.website !== undefined && { website: body.website }),
          ...(body.notes !== undefined && { notes: body.notes }),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // DELETE /api/v1/settings/vendors/:id — Delete vendor
  fastify.delete(
    '/api/v1/settings/vendors/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const vendor = await prisma.vendor.findFirst({
        where: { id, tenantId },
        include: { _count: { select: { contracts: true } } },
      });

      if (!vendor) {
        return reply.status(404).send({ error: 'Vendor not found' });
      }

      if (vendor._count.contracts > 0) {
        return reply.status(409).send({
          error: 'Cannot delete vendor with active contracts',
          contractCount: vendor._count.contracts,
        });
      }

      await prisma.vendor.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
