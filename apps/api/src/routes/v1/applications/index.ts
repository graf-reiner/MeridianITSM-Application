import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../../plugins/rbac.js';
import {
  createApp,
  getApp,
  listApps,
  updateApp,
  deleteApp,
  addDependency,
  removeDependency,
  addDocument,
  removeDocument,
  linkAsset,
  unlinkAsset,
  getPortfolioStats,
  getDependencyGraph,
} from '../../../services/application.service.js';

/**
 * Application Portfolio REST API routes.
 *
 * Application CRUD:
 * POST   /api/v1/applications               — Create application (settings.update)
 * GET    /api/v1/applications               — List applications (settings.read)
 * GET    /api/v1/applications/stats         — Portfolio summary stats (settings.read)
 * GET    /api/v1/applications/graph         — Dependency graph nodes+edges (settings.read)
 * GET    /api/v1/applications/:id           — Get application detail (settings.read)
 * PUT    /api/v1/applications/:id           — Update application (settings.update)
 * DELETE /api/v1/applications/:id           — Delete application (settings.update)
 *
 * Dependencies:
 * POST   /api/v1/applications/:id/dependencies       — Add dependency (settings.update)
 * DELETE /api/v1/applications/dependencies/:depId    — Remove dependency (settings.update)
 *
 * Documents:
 * POST   /api/v1/applications/:id/documents          — Add document link (settings.update)
 * DELETE /api/v1/applications/documents/:docId       — Remove document (settings.update)
 *
 * Asset relationships:
 * POST   /api/v1/applications/:id/assets             — Link asset (settings.update)
 * DELETE /api/v1/applications/assets/:appAssetId     — Unlink asset (settings.update)
 */
export async function applicationRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── POST /api/v1/applications — Create application ────────────────────────

  fastify.post(
    '/api/v1/applications',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const body = request.body as {
        name?: unknown;
        type?: unknown;
        status?: unknown;
        criticality?: unknown;
        hostingModel?: unknown;
        techStack?: unknown;
        authMethod?: unknown;
        dataClassification?: unknown;
        annualCost?: unknown;
        rpo?: unknown;
        rto?: unknown;
        lifecycleStage?: unknown;
        strategicRating?: unknown;
        description?: unknown;
        customFields?: unknown;
      };

      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return reply.status(400).send({ error: 'name is required and must be a non-empty string' });
      }

      try {
        const app = await createApp(
          user.tenantId,
          {
            name: body.name.trim(),
            type: typeof body.type === 'string' ? body.type : undefined,
            status: typeof body.status === 'string' ? body.status : undefined,
            criticality: typeof body.criticality === 'string' ? body.criticality : undefined,
            hostingModel: typeof body.hostingModel === 'string' ? body.hostingModel : undefined,
            techStack: Array.isArray(body.techStack)
              ? (body.techStack as string[])
              : undefined,
            authMethod: typeof body.authMethod === 'string' ? body.authMethod : undefined,
            dataClassification:
              typeof body.dataClassification === 'string' ? body.dataClassification : undefined,
            annualCost: typeof body.annualCost === 'number' ? body.annualCost : undefined,
            rpo: typeof body.rpo === 'number' ? body.rpo : undefined,
            rto: typeof body.rto === 'number' ? body.rto : undefined,
            lifecycleStage:
              typeof body.lifecycleStage === 'string' ? body.lifecycleStage : undefined,
            strategicRating:
              typeof body.strategicRating === 'number' ? body.strategicRating : undefined,
            description: typeof body.description === 'string' ? body.description : undefined,
            customFields:
              body.customFields && typeof body.customFields === 'object'
                ? (body.customFields as Record<string, unknown>)
                : undefined,
          },
          user.userId,
        );
        return reply.status(201).send(app);
      } catch (err) {
        const error = err as Error;
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── GET /api/v1/applications — List applications ───────────────────────────

  fastify.get(
    '/api/v1/applications',
    { preHandler: [requirePermission('settings.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const query = request.query as {
        type?: string;
        status?: string;
        criticality?: string;
        hostingModel?: string;
        lifecycleStage?: string;
        search?: string;
        page?: string;
        pageSize?: string;
      };

      try {
        const result = await listApps(user.tenantId, {
          type: query.type,
          status: query.status,
          criticality: query.criticality,
          hostingModel: query.hostingModel,
          lifecycleStage: query.lifecycleStage,
          search: query.search,
          page: query.page ? parseInt(query.page, 10) : undefined,
          pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
        });
        return reply.send(result);
      } catch (err) {
        const error = err as Error;
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── GET /api/v1/applications/stats — Portfolio statistics ─────────────────
  // NOTE: Defined before /:id to prevent parameterized route conflict

  fastify.get(
    '/api/v1/applications/stats',
    { preHandler: [requirePermission('settings.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      try {
        const stats = await getPortfolioStats(user.tenantId);
        return reply.send(stats);
      } catch (err) {
        const error = err as Error;
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── GET /api/v1/applications/graph — Dependency graph ─────────────────────
  // NOTE: Defined before /:id to prevent parameterized route conflict

  fastify.get(
    '/api/v1/applications/graph',
    { preHandler: [requirePermission('settings.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      try {
        const graph = await getDependencyGraph(user.tenantId);
        return reply.send(graph);
      } catch (err) {
        const error = err as Error;
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── GET /api/v1/applications/:id — Get application detail ─────────────────

  fastify.get(
    '/api/v1/applications/:id',
    { preHandler: [requirePermission('settings.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };

      try {
        const app = await getApp(user.tenantId, id);
        if (!app) return reply.status(404).send({ error: 'Application not found' });
        return reply.send(app);
      } catch (err) {
        const error = err as Error;
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── PUT /api/v1/applications/:id — Update application ─────────────────────

  fastify.put(
    '/api/v1/applications/:id',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: unknown;
        type?: unknown;
        status?: unknown;
        criticality?: unknown;
        hostingModel?: unknown;
        techStack?: unknown;
        authMethod?: unknown;
        dataClassification?: unknown;
        annualCost?: unknown;
        rpo?: unknown;
        rto?: unknown;
        lifecycleStage?: unknown;
        strategicRating?: unknown;
        description?: unknown;
        customFields?: unknown;
      };

      try {
        const updated = await updateApp(
          user.tenantId,
          id,
          {
            name: typeof body.name === 'string' ? body.name.trim() : undefined,
            type: typeof body.type === 'string' ? body.type : undefined,
            status: typeof body.status === 'string' ? body.status : undefined,
            criticality: typeof body.criticality === 'string' ? body.criticality : undefined,
            hostingModel: typeof body.hostingModel === 'string' ? body.hostingModel : undefined,
            techStack: Array.isArray(body.techStack) ? (body.techStack as string[]) : undefined,
            authMethod: typeof body.authMethod === 'string' ? body.authMethod : undefined,
            dataClassification:
              typeof body.dataClassification === 'string' ? body.dataClassification : undefined,
            annualCost: typeof body.annualCost === 'number' ? body.annualCost : undefined,
            rpo: typeof body.rpo === 'number' ? body.rpo : undefined,
            rto: typeof body.rto === 'number' ? body.rto : undefined,
            lifecycleStage:
              typeof body.lifecycleStage === 'string' ? body.lifecycleStage : undefined,
            strategicRating:
              typeof body.strategicRating === 'number' ? body.strategicRating : undefined,
            description: typeof body.description === 'string' ? body.description : undefined,
            customFields:
              body.customFields && typeof body.customFields === 'object'
                ? (body.customFields as Record<string, unknown>)
                : undefined,
          },
          user.userId,
        );
        return reply.send(updated);
      } catch (err) {
        const error = err as Error;
        if (error.message === 'Application not found') {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── DELETE /api/v1/applications/:id — Delete application ──────────────────

  fastify.delete(
    '/api/v1/applications/:id',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };

      try {
        await deleteApp(user.tenantId, id);
        return reply.status(204).send();
      } catch (err) {
        const error = err as Error;
        if (error.message === 'Application not found') {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── POST /api/v1/applications/:id/dependencies — Add dependency ────────────

  fastify.post(
    '/api/v1/applications/:id/dependencies',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };
      const body = request.body as {
        targetApplicationId?: unknown;
        dependencyType?: unknown;
        description?: unknown;
      };

      if (!body.targetApplicationId || typeof body.targetApplicationId !== 'string') {
        return reply.status(400).send({ error: 'targetApplicationId is required' });
      }
      if (!body.dependencyType || typeof body.dependencyType !== 'string') {
        return reply.status(400).send({ error: 'dependencyType is required' });
      }

      try {
        const dep = await addDependency(
          user.tenantId,
          id,
          body.targetApplicationId,
          body.dependencyType,
          typeof body.description === 'string' ? body.description : undefined,
        );
        return reply.status(201).send(dep);
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('Self-dependency')) {
          return reply.status(400).send({ error: error.message });
        }
        // Unique constraint violation — duplicate dependency
        if (error.message.includes('Unique constraint')) {
          return reply.status(409).send({ error: 'Dependency already exists' });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── DELETE /api/v1/applications/dependencies/:depId — Remove dependency ───

  fastify.delete(
    '/api/v1/applications/dependencies/:depId',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { depId } = request.params as { depId: string };

      try {
        await removeDependency(user.tenantId, depId);
        return reply.status(204).send();
      } catch (err) {
        const error = err as Error;
        if (error.message === 'Dependency not found') {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── POST /api/v1/applications/:id/documents — Add document ────────────────

  fastify.post(
    '/api/v1/applications/:id/documents',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };
      const body = request.body as {
        title?: unknown;
        documentType?: unknown;
        url?: unknown;
        description?: unknown;
      };

      if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
        return reply.status(400).send({ error: 'title is required' });
      }
      if (!body.documentType || typeof body.documentType !== 'string') {
        return reply.status(400).send({ error: 'documentType is required' });
      }
      if (!body.url || typeof body.url !== 'string' || body.url.trim().length === 0) {
        return reply.status(400).send({ error: 'url is required' });
      }

      try {
        const doc = await addDocument(user.tenantId, id, {
          title: body.title.trim(),
          documentType: body.documentType,
          url: body.url.trim(),
          description: typeof body.description === 'string' ? body.description : undefined,
        });
        return reply.status(201).send(doc);
      } catch (err) {
        const error = err as Error;
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── DELETE /api/v1/applications/documents/:docId — Remove document ─────────

  fastify.delete(
    '/api/v1/applications/documents/:docId',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { docId } = request.params as { docId: string };

      try {
        await removeDocument(user.tenantId, docId);
        return reply.status(204).send();
      } catch (err) {
        const error = err as Error;
        if (error.message === 'Document not found') {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── POST /api/v1/applications/:id/assets — Link asset ──────────────────────

  fastify.post(
    '/api/v1/applications/:id/assets',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };
      const body = request.body as {
        assetId?: unknown;
        relationshipType?: unknown;
        isPrimary?: unknown;
      };

      if (!body.assetId || typeof body.assetId !== 'string') {
        return reply.status(400).send({ error: 'assetId is required' });
      }
      if (!body.relationshipType || typeof body.relationshipType !== 'string') {
        return reply.status(400).send({ error: 'relationshipType is required' });
      }

      try {
        const link = await linkAsset(
          user.tenantId,
          id,
          body.assetId,
          body.relationshipType,
          typeof body.isPrimary === 'boolean' ? body.isPrimary : undefined,
        );
        return reply.status(201).send(link);
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('Unique constraint')) {
          return reply.status(409).send({ error: 'Asset already linked to this application' });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── DELETE /api/v1/applications/assets/:appAssetId — Unlink asset ──────────

  fastify.delete(
    '/api/v1/applications/assets/:appAssetId',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { appAssetId } = request.params as { appAssetId: string };

      try {
        await unlinkAsset(user.tenantId, appAssetId);
        return reply.status(204).send();
      } catch (err) {
        const error = err as Error;
        if (error.message === 'Application-asset link not found') {
          return reply.status(404).send({ error: error.message });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );
}
