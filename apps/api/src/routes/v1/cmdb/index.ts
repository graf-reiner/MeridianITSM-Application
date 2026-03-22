import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../../plugins/rbac.js';
import {
  createCI,
  getCI,
  listCIs,
  updateCI,
  deleteCI,
  createRelationship,
  deleteRelationship,
  getCIRelationships,
  getImpactAnalysis,
  listCIChangeHistory,
  createCategory,
  listCategories,
  updateCategory,
  deleteCategory,
} from '../../../services/cmdb.service.js';

/**
 * CMDB REST API routes.
 *
 * CI CRUD:
 * POST   /api/v1/cmdb/cis                    — Create CI (cmdb.edit)
 * GET    /api/v1/cmdb/cis                    — List CIs (cmdb.view)
 * GET    /api/v1/cmdb/cis/:id                — Get CI detail (cmdb.view)
 * PUT    /api/v1/cmdb/cis/:id                — Update CI (cmdb.edit)
 * DELETE /api/v1/cmdb/cis/:id                — Delete CI / decommission (cmdb.delete)
 *
 * Relationships:
 * POST   /api/v1/cmdb/relationships          — Create relationship (cmdb.edit)
 * DELETE /api/v1/cmdb/relationships/:id      — Delete relationship (cmdb.edit)
 * GET    /api/v1/cmdb/cis/:id/relationships  — Get CI relationships (cmdb.view)
 *
 * Impact analysis:
 * GET    /api/v1/cmdb/cis/:id/impact         — Impact analysis (cmdb.view)
 *
 * Change history:
 * GET    /api/v1/cmdb/cis/:id/history        — Change history (cmdb.view)
 *
 * Categories:
 * POST   /api/v1/cmdb/categories             — Create category (cmdb.edit)
 * GET    /api/v1/cmdb/categories             — List categories (cmdb.view)
 * PUT    /api/v1/cmdb/categories/:id         — Update category (cmdb.edit)
 * DELETE /api/v1/cmdb/categories/:id         — Delete category (cmdb.delete)
 */
export async function cmdbRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── POST /api/v1/cmdb/cis — Create CI ─────────────────────────────────────

  fastify.post(
    '/api/v1/cmdb/cis',
    { preHandler: [requirePermission('cmdb.edit')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const userId = user.userId;

      const body = request.body as {
        name?: unknown;
        type?: unknown;
        status?: unknown;
        environment?: unknown;
        categoryId?: unknown;
        assetId?: unknown;
        agentId?: unknown;
        ownerId?: unknown;
        siteId?: unknown;
        attributesJson?: unknown;
      };

      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return reply.status(400).send({ error: 'name is required and must be a non-empty string' });
      }

      try {
        const ci = await createCI(
          tenantId,
          {
            name: body.name.trim(),
            type: typeof body.type === 'string' ? body.type : undefined,
            status: typeof body.status === 'string' ? body.status : undefined,
            environment: typeof body.environment === 'string' ? body.environment : undefined,
            categoryId: typeof body.categoryId === 'string' ? body.categoryId : undefined,
            assetId: typeof body.assetId === 'string' ? body.assetId : undefined,
            agentId: typeof body.agentId === 'string' ? body.agentId : undefined,
            ownerId: typeof body.ownerId === 'string' ? body.ownerId : undefined,
            siteId: typeof body.siteId === 'string' ? body.siteId : undefined,
            attributesJson:
              body.attributesJson && typeof body.attributesJson === 'object'
                ? (body.attributesJson as Record<string, unknown>)
                : undefined,
          },
          userId,
        );
        return reply.status(201).send(ci);
      } catch (err) {
        const error = err as Error;
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── GET /api/v1/cmdb/cis — List CIs ───────────────────────────────────────

  fastify.get(
    '/api/v1/cmdb/cis',
    { preHandler: [requirePermission('cmdb.view')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const query = request.query as {
        type?: string;
        status?: string;
        environment?: string;
        categoryId?: string;
        search?: string;
        page?: string;
        pageSize?: string;
      };

      const result = await listCIs(tenantId, {
        type: query.type,
        status: query.status,
        environment: query.environment,
        categoryId: query.categoryId,
        search: query.search,
        page: query.page ? parseInt(query.page, 10) : undefined,
        pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      });

      return reply.status(200).send(result);
    },
  );

  // ─── GET /api/v1/cmdb/cis/:id — Get CI detail ──────────────────────────────

  fastify.get(
    '/api/v1/cmdb/cis/:id',
    { preHandler: [requirePermission('cmdb.view')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const ci = await getCI(tenantId, id);
      if (!ci) {
        return reply.status(404).send({ error: 'CI not found' });
      }

      return reply.status(200).send(ci);
    },
  );

  // ─── PUT /api/v1/cmdb/cis/:id — Update CI ──────────────────────────────────

  fastify.put(
    '/api/v1/cmdb/cis/:id',
    { preHandler: [requirePermission('cmdb.edit')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const userId = user.userId;
      const { id } = request.params as { id: string };

      const body = request.body as {
        name?: unknown;
        type?: unknown;
        status?: unknown;
        environment?: unknown;
        categoryId?: unknown;
        assetId?: unknown;
        agentId?: unknown;
        ownerId?: unknown;
        siteId?: unknown;
        attributesJson?: unknown;
      };

      try {
        const ci = await updateCI(
          tenantId,
          id,
          {
            name: typeof body.name === 'string' ? body.name : undefined,
            type: typeof body.type === 'string' ? body.type : undefined,
            status: typeof body.status === 'string' ? body.status : undefined,
            environment: typeof body.environment === 'string' ? body.environment : undefined,
            categoryId:
              body.categoryId === null
                ? null
                : typeof body.categoryId === 'string'
                  ? body.categoryId
                  : undefined,
            assetId:
              body.assetId === null
                ? null
                : typeof body.assetId === 'string'
                  ? body.assetId
                  : undefined,
            agentId:
              body.agentId === null
                ? null
                : typeof body.agentId === 'string'
                  ? body.agentId
                  : undefined,
            ownerId:
              body.ownerId === null
                ? null
                : typeof body.ownerId === 'string'
                  ? body.ownerId
                  : undefined,
            siteId:
              body.siteId === null
                ? null
                : typeof body.siteId === 'string'
                  ? body.siteId
                  : undefined,
            attributesJson:
              body.attributesJson === null
                ? null
                : body.attributesJson && typeof body.attributesJson === 'object'
                  ? (body.attributesJson as Record<string, unknown>)
                  : undefined,
          },
          userId,
        );

        if (!ci) {
          return reply.status(404).send({ error: 'CI not found' });
        }

        return reply.status(200).send(ci);
      } catch (err) {
        const error = err as Error;
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── DELETE /api/v1/cmdb/cis/:id — Delete (decommission) CI ────────────────

  fastify.delete(
    '/api/v1/cmdb/cis/:id',
    { preHandler: [requirePermission('cmdb.delete')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const userId = user.userId;
      const { id } = request.params as { id: string };

      const ci = await deleteCI(tenantId, id, userId);
      if (!ci) {
        return reply.status(404).send({ error: 'CI not found' });
      }

      return reply.status(204).send();
    },
  );

  // ─── POST /api/v1/cmdb/relationships — Create relationship ─────────────────

  fastify.post(
    '/api/v1/cmdb/relationships',
    { preHandler: [requirePermission('cmdb.edit')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const body = request.body as {
        sourceId?: unknown;
        targetId?: unknown;
        relationshipType?: unknown;
        description?: unknown;
      };

      if (!body.sourceId || typeof body.sourceId !== 'string') {
        return reply.status(400).send({ error: 'sourceId is required' });
      }
      if (!body.targetId || typeof body.targetId !== 'string') {
        return reply.status(400).send({ error: 'targetId is required' });
      }
      if (!body.relationshipType || typeof body.relationshipType !== 'string') {
        return reply.status(400).send({ error: 'relationshipType is required' });
      }

      try {
        const relationship = await createRelationship(tenantId, {
          sourceId: body.sourceId,
          targetId: body.targetId,
          relationshipType: body.relationshipType,
          description: typeof body.description === 'string' ? body.description : undefined,
        });
        return reply.status(201).send(relationship);
      } catch (err) {
        const error = err as Error;
        if (
          error.message.includes('itself') ||
          error.message.includes('not found') ||
          error.message.includes('Unique constraint')
        ) {
          return reply.status(409).send({ error: error.message });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── DELETE /api/v1/cmdb/relationships/:id — Delete relationship ────────────

  fastify.delete(
    '/api/v1/cmdb/relationships/:id',
    { preHandler: [requirePermission('cmdb.edit')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      await deleteRelationship(tenantId, id);
      return reply.status(204).send();
    },
  );

  // ─── GET /api/v1/cmdb/cis/:id/relationships — Get CI relationships ──────────

  fastify.get(
    '/api/v1/cmdb/cis/:id/relationships',
    { preHandler: [requirePermission('cmdb.view')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const result = await getCIRelationships(tenantId, id);
      return reply.status(200).send(result);
    },
  );

  // ─── GET /api/v1/cmdb/cis/:id/impact — Impact analysis ─────────────────────

  fastify.get(
    '/api/v1/cmdb/cis/:id/impact',
    { preHandler: [requirePermission('cmdb.view')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const query = request.query as { depth?: string };
      const depth = query.depth ? parseInt(query.depth, 10) : 2;

      const result = await getImpactAnalysis(tenantId, id, depth);
      if (!result) {
        return reply.status(404).send({ error: 'CI not found' });
      }

      return reply.status(200).send(result);
    },
  );

  // ─── GET /api/v1/cmdb/cis/:id/history — Change history ──────────────────────

  fastify.get(
    '/api/v1/cmdb/cis/:id/history',
    { preHandler: [requirePermission('cmdb.view')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const query = request.query as { page?: string; pageSize?: string };

      const result = await listCIChangeHistory(
        tenantId,
        id,
        query.page ? parseInt(query.page, 10) : undefined,
        query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      );

      return reply.status(200).send(result);
    },
  );

  // ─── POST /api/v1/cmdb/categories — Create category ────────────────────────

  fastify.post(
    '/api/v1/cmdb/categories',
    { preHandler: [requirePermission('cmdb.edit')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const body = request.body as {
        name?: unknown;
        slug?: unknown;
        icon?: unknown;
        color?: unknown;
        parentId?: unknown;
        description?: unknown;
      };

      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return reply.status(400).send({ error: 'name is required' });
      }
      if (!body.slug || typeof body.slug !== 'string' || body.slug.trim().length === 0) {
        return reply.status(400).send({ error: 'slug is required' });
      }

      try {
        const category = await createCategory(tenantId, {
          name: body.name.trim(),
          slug: body.slug.trim(),
          icon: typeof body.icon === 'string' ? body.icon : undefined,
          color: typeof body.color === 'string' ? body.color : undefined,
          parentId: typeof body.parentId === 'string' ? body.parentId : undefined,
          description: typeof body.description === 'string' ? body.description : undefined,
        });
        return reply.status(201).send(category);
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('cycle') || error.message.includes('Unique constraint')) {
          return reply.status(409).send({ error: error.message });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── GET /api/v1/cmdb/categories — List categories ─────────────────────────

  fastify.get(
    '/api/v1/cmdb/categories',
    { preHandler: [requirePermission('cmdb.view')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const categories = await listCategories(tenantId);
      return reply.status(200).send(categories);
    },
  );

  // ─── PUT /api/v1/cmdb/categories/:id — Update category ─────────────────────

  fastify.put(
    '/api/v1/cmdb/categories/:id',
    { preHandler: [requirePermission('cmdb.edit')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const body = request.body as {
        name?: unknown;
        slug?: unknown;
        icon?: unknown;
        color?: unknown;
        parentId?: unknown;
        description?: unknown;
      };

      try {
        const category = await updateCategory(tenantId, id, {
          name: typeof body.name === 'string' ? body.name : undefined,
          slug: typeof body.slug === 'string' ? body.slug : undefined,
          icon: typeof body.icon === 'string' ? body.icon : undefined,
          color: typeof body.color === 'string' ? body.color : undefined,
          parentId: typeof body.parentId === 'string' ? body.parentId : undefined,
          description: typeof body.description === 'string' ? body.description : undefined,
        });

        if (!category) {
          return reply.status(404).send({ error: 'Category not found' });
        }

        return reply.status(200).send(category);
      } catch (err) {
        const error = err as Error;
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── DELETE /api/v1/cmdb/categories/:id — Delete category ──────────────────

  fastify.delete(
    '/api/v1/cmdb/categories/:id',
    { preHandler: [requirePermission('cmdb.delete')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const category = await deleteCategory(tenantId, id);
      if (!category) {
        return reply.status(404).send({ error: 'Category not found' });
      }

      return reply.status(204).send();
    },
  );
}
