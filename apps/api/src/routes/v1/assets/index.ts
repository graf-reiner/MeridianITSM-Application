import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';
import {
  createAsset,
  getAsset,
  listAssets,
  updateAsset,
  deleteAsset,
} from '../../../services/asset.service.js';

/**
 * Asset management REST API routes.
 *
 * POST   /api/v1/assets      — Create asset (assets.create)
 * GET    /api/v1/assets      — List assets with filters (assets.read)
 * GET    /api/v1/assets/:id  — Get asset detail (assets.read)
 * PUT    /api/v1/assets/:id  — Update asset (assets.update)
 * DELETE /api/v1/assets/:id  — Delete asset (assets.delete)
 *
 * PRTL-05: Portal end-users call GET /api/v1/assets?assignedToId=me
 *   The 'me' value is resolved server-side to the current user's UUID from JWT.
 */
export async function assetRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── POST /api/v1/assets — Create asset ────────────────────────────────────

  fastify.post(
    '/api/v1/assets',
    {
      preHandler: [requirePermission('assets.create')],
    },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const actorId = user.userId;

      const body = request.body as {
        serialNumber?: unknown;
        manufacturer?: unknown;
        model?: unknown;
        status?: unknown;
        purchaseDate?: unknown;
        purchaseCost?: unknown;
        warrantyExpiry?: unknown;
        assignedToId?: unknown;
        siteId?: unknown;
        hostname?: unknown;
        operatingSystem?: unknown;
        osVersion?: unknown;
        cpuModel?: unknown;
        cpuCores?: unknown;
        ramGb?: unknown;
        disks?: unknown;
        networkInterfaces?: unknown;
        softwareInventory?: unknown;
        customFields?: unknown;
      };

      const VALID_STATUSES = ['IN_STOCK', 'DEPLOYED', 'IN_REPAIR', 'RETIRED', 'DISPOSED'];
      if (body.status !== undefined && !VALID_STATUSES.includes(body.status as string)) {
        return reply.status(400).send({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }

      try {
        const asset = await createAsset(
          prisma,
          tenantId,
          {
            serialNumber: body.serialNumber as string | undefined,
            manufacturer: body.manufacturer as string | undefined,
            model: body.model as string | undefined,
            status: body.status as any,
            purchaseDate: body.purchaseDate as string | undefined,
            purchaseCost: body.purchaseCost as number | undefined,
            warrantyExpiry: body.warrantyExpiry as string | undefined,
            assignedToId: body.assignedToId as string | undefined,
            siteId: body.siteId as string | undefined,
            hostname: body.hostname as string | undefined,
            operatingSystem: body.operatingSystem as string | undefined,
            osVersion: body.osVersion as string | undefined,
            cpuModel: body.cpuModel as string | undefined,
            cpuCores: body.cpuCores as number | undefined,
            ramGb: body.ramGb as number | undefined,
            disks: body.disks,
            networkInterfaces: body.networkInterfaces,
            softwareInventory: body.softwareInventory,
            customFields: body.customFields,
          },
          actorId,
        );

        return reply.status(201).send(asset);
      } catch (err) {
        fastify.log.error(err, 'Failed to create asset');
        return reply.status(500).send({ error: 'Failed to create asset' });
      }
    },
  );

  // ─── GET /api/v1/assets — List assets ──────────────────────────────────────

  fastify.get(
    '/api/v1/assets',
    {
      preHandler: [requirePermission('assets.read')],
    },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const userId = user.userId;

      const query = request.query as {
        status?: string;
        assignedToId?: string;
        siteId?: string;
        search?: string;
        page?: string;
        pageSize?: string;
      };

      // Resolve 'me' shorthand for portal end-user calls (PRTL-05)
      const assignedToId =
        query.assignedToId === 'me' ? userId : query.assignedToId;

      const result = await listAssets(prisma, tenantId, {
        status: query.status,
        assignedToId,
        siteId: query.siteId,
        search: query.search,
        page: query.page ? parseInt(query.page, 10) : undefined,
        pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      });

      return reply.send(result);
    },
  );

  // ─── GET /api/v1/assets/:id — Get asset detail ─────────────────────────────

  fastify.get(
    '/api/v1/assets/:id',
    {
      preHandler: [requirePermission('assets.read')],
    },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const asset = await getAsset(prisma, tenantId, id);

      if (!asset) {
        return reply.status(404).send({ error: 'Asset not found' });
      }

      return reply.send(asset);
    },
  );

  // ─── PUT /api/v1/assets/:id — Update asset ─────────────────────────────────

  fastify.put(
    '/api/v1/assets/:id',
    {
      preHandler: [requirePermission('assets.update')],
    },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const actorId = user.userId;
      const { id } = request.params as { id: string };

      const body = request.body as {
        serialNumber?: unknown;
        manufacturer?: unknown;
        model?: unknown;
        status?: unknown;
        purchaseDate?: unknown;
        purchaseCost?: unknown;
        warrantyExpiry?: unknown;
        assignedToId?: unknown;
        siteId?: unknown;
        hostname?: unknown;
        operatingSystem?: unknown;
        osVersion?: unknown;
        cpuModel?: unknown;
        cpuCores?: unknown;
        ramGb?: unknown;
        disks?: unknown;
        networkInterfaces?: unknown;
        softwareInventory?: unknown;
        customFields?: unknown;
      };

      try {
        const asset = await updateAsset(prisma, tenantId, id, body as any, actorId);

        if (!asset) {
          return reply.status(404).send({ error: 'Asset not found' });
        }

        return reply.send(asset);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Invalid status transition')) {
          return reply.status(422).send({ error: err.message });
        }
        fastify.log.error(err, 'Failed to update asset');
        return reply.status(500).send({ error: 'Failed to update asset' });
      }
    },
  );

  // ─── DELETE /api/v1/assets/:id — Delete asset ──────────────────────────────

  fastify.delete(
    '/api/v1/assets/:id',
    {
      preHandler: [requirePermission('assets.delete')],
    },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const result = await deleteAsset(prisma, tenantId, id);

      if (!result) {
        return reply.status(404).send({ error: 'Asset not found' });
      }

      return reply.status(200).send(result);
    },
  );
}
