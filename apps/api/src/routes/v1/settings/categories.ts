import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

type CategoryWithChildren = {
  id: string;
  tenantId: string;
  name: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  userGroupId: string | null;
  createdAt: Date;
  updatedAt: Date;
  children?: CategoryWithChildren[];
};

/**
 * Build hierarchical tree from flat list.
 */
function buildTree(flatList: CategoryWithChildren[]): CategoryWithChildren[] {
  const map = new Map<string, CategoryWithChildren & { children: CategoryWithChildren[] }>();
  const roots: (CategoryWithChildren & { children: CategoryWithChildren[] })[] = [];

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
  categoryId: string,
  newParentId: string,
  tenantId: string,
): Promise<boolean> {
  const visited = new Set<string>();
  let currentId: string | null = newParentId;

  // Walk up the ancestor chain looking for a cycle
  while (currentId !== null) {
    if (visited.has(currentId)) return true;
    if (currentId === categoryId) return true;
    visited.add(currentId);

    // Fetch next ancestor outside the variable that TS is confused about
    const lookupId = currentId;
    // eslint-disable-next-line no-await-in-loop
    const result: Array<{ parentId: string | null }> = await prisma.$queryRaw`
      SELECT "parentId" FROM categories WHERE id = ${lookupId}::uuid AND "tenantId" = ${tenantId}::uuid LIMIT 1
    `;
    currentId = result[0]?.parentId ?? null;
  }

  return false;
}

/**
 * Settings: Category Management Routes (SETT-06)
 *
 * GET    /api/v1/settings/categories       — Flat list with childCount
 * GET    /api/v1/settings/categories/tree  — Hierarchical tree
 * POST   /api/v1/settings/categories       — Create category
 * PATCH  /api/v1/settings/categories/:id   — Update category
 * DELETE /api/v1/settings/categories/:id   — Delete category
 */
export async function categoriesSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/categories/tree — Hierarchical tree (must be before /:id)
  fastify.get(
    '/api/v1/settings/categories/tree',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const categories = await prisma.category.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
      });

      const tree = buildTree(categories as CategoryWithChildren[]);
      return reply.status(200).send(tree);
    },
  );

  // GET /api/v1/settings/categories — Flat list with childCount
  fastify.get(
    '/api/v1/settings/categories',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const categories = await prisma.category.findMany({
        where: { tenantId },
        include: {
          _count: { select: { children: true } },
        },
        orderBy: { name: 'asc' },
      });

      return reply.status(200).send(categories);
    },
  );

  // POST /api/v1/settings/categories — Create category
  fastify.post(
    '/api/v1/settings/categories',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        name: string;
        parentId?: string;
        icon?: string;
        color?: string;
        description?: string;
        userGroupId?: string;
      };

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required' });
      }

      // Validate parentId if provided
      if (body.parentId) {
        const parent = await prisma.category.findFirst({ where: { id: body.parentId, tenantId } });
        if (!parent) {
          return reply.status(400).send({ error: 'parentId refers to unknown category' });
        }
      }

      const category = await prisma.category.create({
        data: {
          tenantId,
          name: body.name,
          parentId: body.parentId,
          icon: body.icon,
          color: body.color,
          userGroupId: body.userGroupId,
        },
      });

      return reply.status(201).send(category);
    },
  );

  // PATCH /api/v1/settings/categories/:id — Update category
  fastify.patch(
    '/api/v1/settings/categories/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        parentId?: string | null;
        icon?: string;
        color?: string;
        userGroupId?: string | null;
      };

      const existing = await prisma.category.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Category not found' });
      }

      // Validate parentId and check for circular reference
      if (body.parentId) {
        const parent = await prisma.category.findFirst({ where: { id: body.parentId, tenantId } });
        if (!parent) {
          return reply.status(400).send({ error: 'parentId refers to unknown category' });
        }

        const isCycle = await wouldCreateCycle(id, body.parentId, tenantId);
        if (isCycle) {
          return reply.status(400).send({ error: 'Setting this parentId would create a circular reference' });
        }
      }

      const updated = await prisma.category.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.parentId !== undefined && { parentId: body.parentId }),
          ...(body.icon !== undefined && { icon: body.icon }),
          ...(body.color !== undefined && { color: body.color }),
          ...(body.userGroupId !== undefined && { userGroupId: body.userGroupId }),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // DELETE /api/v1/settings/categories/:id — Delete category
  fastify.delete(
    '/api/v1/settings/categories/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const { id } = request.params as { id: string };

      const category = await prisma.category.findFirst({
        where: { id, tenantId },
        include: {
          _count: { select: { children: true, tickets: true } },
        },
      });

      if (!category) {
        return reply.status(404).send({ error: 'Category not found' });
      }

      // Block if children exist
      if (category._count.children > 0) {
        return reply.status(409).send({
          error: 'Cannot delete category with child categories',
          childCount: category._count.children,
        });
      }

      // Block if tickets use it
      if (category._count.tickets > 0) {
        return reply.status(409).send({
          error: 'Cannot delete category with assigned tickets',
          ticketCount: category._count.tickets,
        });
      }

      await prisma.category.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
