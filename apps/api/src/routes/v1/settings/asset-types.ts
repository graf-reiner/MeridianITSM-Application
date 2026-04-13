import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

type AssetTypeNode = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  children?: AssetTypeNode[];
};

/**
 * Build hierarchical tree from flat list.
 */
function buildTree(flatList: AssetTypeNode[]): AssetTypeNode[] {
  const map = new Map<string, AssetTypeNode & { children: AssetTypeNode[] }>();
  const roots: (AssetTypeNode & { children: AssetTypeNode[] })[] = [];

  for (const item of flatList) {
    map.set(item.id, { ...item, children: [] });
  }

  for (const item of flatList) {
    const node = map.get(item.id)!;
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Check for circular parentId reference.
 */
async function wouldCreateCycle(
  assetTypeId: string,
  newParentId: string,
  tenantId: string,
): Promise<boolean> {
  const visited = new Set<string>();
  let currentId: string | null = newParentId;

  while (currentId !== null) {
    if (visited.has(currentId)) return true;
    if (currentId === assetTypeId) return true;
    visited.add(currentId);

    const lookupId = currentId;
    // eslint-disable-next-line no-await-in-loop
    const result: Array<{ parentId: string | null }> = await prisma.$queryRaw`
      SELECT "parentId" FROM asset_types WHERE id = ${lookupId}::uuid AND "tenantId" = ${tenantId}::uuid LIMIT 1
    `;
    currentId = result[0]?.parentId ?? null;
  }

  return false;
}

/**
 * Settings: Asset Type Management Routes
 *
 * GET    /api/v1/settings/asset-types/tree  — Hierarchical tree
 * GET    /api/v1/settings/asset-types       — Flat list with child count
 * POST   /api/v1/settings/asset-types       — Create asset type
 * PATCH  /api/v1/settings/asset-types/:id   — Update asset type
 * DELETE /api/v1/settings/asset-types/:id   — Delete asset type
 */
export async function assetTypesSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/asset-types/tree — Hierarchical tree (must be before /:id)
  fastify.get(
    '/api/v1/settings/asset-types/tree',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const types = await prisma.assetType.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
      });

      const tree = buildTree(types as AssetTypeNode[]);
      return reply.status(200).send(tree);
    },
  );

  // GET /api/v1/settings/asset-types — Flat list with child count
  fastify.get(
    '/api/v1/settings/asset-types',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const types = await prisma.assetType.findMany({
        where: { tenantId },
        include: {
          _count: { select: { children: true } },
        },
        orderBy: { name: 'asc' },
      });

      return reply.status(200).send(types);
    },
  );

  // POST /api/v1/settings/asset-types — Create asset type
  fastify.post(
    '/api/v1/settings/asset-types',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        name: string;
        description?: string;
        icon?: string;
        color?: string;
        parentId?: string;
      };

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required' });
      }

      if (body.parentId) {
        const parent = await prisma.assetType.findFirst({ where: { id: body.parentId, tenantId } });
        if (!parent) {
          return reply.status(400).send({ error: 'parentId refers to unknown asset type' });
        }
      }

      const assetType = await prisma.assetType.create({
        data: {
          tenantId,
          name: body.name,
          description: body.description,
          icon: body.icon,
          color: body.color,
          parentId: body.parentId,
        },
      });

      return reply.status(201).send(assetType);
    },
  );

  // PATCH /api/v1/settings/asset-types/:id — Update asset type
  fastify.patch(
    '/api/v1/settings/asset-types/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        description?: string | null;
        icon?: string | null;
        color?: string | null;
        parentId?: string | null;
      };

      const existing = await prisma.assetType.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Asset type not found' });
      }

      if (body.parentId) {
        const parent = await prisma.assetType.findFirst({ where: { id: body.parentId, tenantId } });
        if (!parent) {
          return reply.status(400).send({ error: 'parentId refers to unknown asset type' });
        }

        const isCycle = await wouldCreateCycle(id, body.parentId, tenantId);
        if (isCycle) {
          return reply.status(400).send({ error: 'Setting this parentId would create a circular reference' });
        }
      }

      const updated = await prisma.assetType.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.icon !== undefined && { icon: body.icon }),
          ...(body.color !== undefined && { color: body.color }),
          ...(body.parentId !== undefined && { parentId: body.parentId }),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // DELETE /api/v1/settings/asset-types/:id — Delete asset type
  fastify.delete(
    '/api/v1/settings/asset-types/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const assetType = await prisma.assetType.findFirst({
        where: { id, tenantId },
        include: {
          _count: { select: { children: true, assets: true } },
        },
      });

      if (!assetType) {
        return reply.status(404).send({ error: 'Asset type not found' });
      }

      if (assetType._count.children > 0) {
        return reply.status(409).send({
          error: 'Cannot delete asset type with child types',
          childCount: assetType._count.children,
        });
      }

      if (assetType._count.assets > 0) {
        return reply.status(409).send({
          error: 'Cannot delete asset type assigned to assets',
          assetCount: assetType._count.assets,
        });
      }

      await prisma.assetType.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
