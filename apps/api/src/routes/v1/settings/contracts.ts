import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Settings: Contract Management Routes (SETT-10)
 *
 * GET    /api/v1/settings/contracts           — List contracts (filter by vendorId, active)
 * GET    /api/v1/settings/contracts/:id       — Get contract detail (includes vendor)
 * POST   /api/v1/settings/contracts           — Create contract
 * PATCH  /api/v1/settings/contracts/:id       — Update contract
 * DELETE /api/v1/settings/contracts/:id       — Delete contract
 */
export async function contractsSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/contracts — List contracts
  fastify.get(
    '/api/v1/settings/contracts',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const query = request.query as {
        vendorId?: string;
        active?: string;
        page?: string;
        limit?: string;
      };

      const page = parseInt(query.page ?? '1', 10);
      const limit = Math.min(parseInt(query.limit ?? '25', 10), 100);
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = { tenantId };

      if (query.vendorId) {
        where.vendorId = query.vendorId;
      }

      // Filter for active contracts: endDate is null or endDate > now
      if (query.active === 'true') {
        where.OR = [
          { endDate: null },
          { endDate: { gt: new Date() } },
        ];
      }

      const [contracts, total] = await Promise.all([
        prisma.contract.findMany({
          where,
          skip,
          take: limit,
          include: {
            vendor: {
              select: { id: true, name: true, contactEmail: true },
            },
          },
          orderBy: { name: 'asc' },
        }),
        prisma.contract.count({ where }),
      ]);

      return reply.status(200).send({
        data: contracts,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    },
  );

  // GET /api/v1/settings/contracts/:id — Get contract detail
  fastify.get(
    '/api/v1/settings/contracts/:id',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const contract = await prisma.contract.findFirst({
        where: { id, tenantId },
        include: {
          vendor: true,
          contractAssets: {
            include: {
              asset: {
                select: { id: true, assetTag: true, serialNumber: true, manufacturer: true, model: true },
              },
            },
          },
        },
      });

      if (!contract) {
        return reply.status(404).send({ error: 'Contract not found' });
      }

      return reply.status(200).send(contract);
    },
  );

  // POST /api/v1/settings/contracts — Create contract
  fastify.post(
    '/api/v1/settings/contracts',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        name: string;
        vendorId?: string;
        contractNumber?: string;
        startDate?: string;
        endDate?: string;
        value?: number;
        currency?: string;
        notes?: string;
        customFields?: unknown;
      };

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required' });
      }

      // Validate vendorId if provided
      if (body.vendorId) {
        const vendor = await prisma.vendor.findFirst({ where: { id: body.vendorId, tenantId } });
        if (!vendor) {
          return reply.status(400).send({ error: 'vendorId refers to unknown vendor' });
        }
      }

      const contract = await prisma.contract.create({
        data: {
          tenantId,
          name: body.name,
          vendorId: body.vendorId,
          contractNumber: body.contractNumber,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
          value: body.value,
          currency: body.currency,
          notes: body.notes,
          customFields: body.customFields ?? undefined,
        },
        include: {
          vendor: { select: { id: true, name: true } },
        },
      });

      return reply.status(201).send(contract);
    },
  );

  // PATCH /api/v1/settings/contracts/:id — Update contract
  fastify.patch(
    '/api/v1/settings/contracts/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        vendorId?: string | null;
        contractNumber?: string;
        startDate?: string | null;
        endDate?: string | null;
        value?: number | null;
        currency?: string;
        notes?: string;
        customFields?: unknown;
      };

      const existing = await prisma.contract.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Contract not found' });
      }

      // Validate vendorId if provided
      if (body.vendorId) {
        const vendor = await prisma.vendor.findFirst({ where: { id: body.vendorId, tenantId } });
        if (!vendor) {
          return reply.status(400).send({ error: 'vendorId refers to unknown vendor' });
        }
      }

      const updated = await prisma.contract.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.vendorId !== undefined && { vendorId: body.vendorId }),
          ...(body.contractNumber !== undefined && { contractNumber: body.contractNumber }),
          ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
          ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
          ...(body.value !== undefined && { value: body.value }),
          ...(body.currency !== undefined && { currency: body.currency }),
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.customFields !== undefined && { customFields: body.customFields ?? undefined }),
        },
        include: {
          vendor: { select: { id: true, name: true } },
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // DELETE /api/v1/settings/contracts/:id — Delete contract
  fastify.delete(
    '/api/v1/settings/contracts/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const existing = await prisma.contract.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Contract not found' });
      }

      // Remove contract-asset links before deleting
      await prisma.contractAsset.deleteMany({ where: { contractId: id, tenantId } });
      await prisma.contract.delete({ where: { id } });

      return reply.status(204).send();
    },
  );
}
