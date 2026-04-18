import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
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
  getAffectedApplications,
} from '../../../services/cmdb.service.js';
import { importCIs } from '../../../services/cmdb-import.service.js';
import { prisma } from '@meridian/db';

// ─── Phase 7 Zod schemas — FK-only, strict ────────────────────────────────────
//
// `.strict()` causes safeParse to fail on unknown keys. That turns legacy
// `type` / `status` / `environment` / `relationshipType` request bodies into
// a 400 response at the route boundary — before any service-layer call.

const CreateCISchema = z
  .object({
    name: z.string().min(1, 'name is required'),
    classId: z.string().uuid('classId must be a valid UUID'),

    // Optional FKs (service layer defaults via resolver where applicable)
    lifecycleStatusId: z.string().uuid().optional(),
    operationalStatusId: z.string().uuid().optional(),
    environmentId: z.string().uuid().optional(),

    // Optional descriptive fields
    displayName: z.string().optional(),
    description: z.string().optional(),
    hostname: z.string().optional(),
    fqdn: z.string().optional(),
    ipAddress: z.string().optional(),
    serialNumber: z.string().optional(),
    model: z.string().optional(),
    manufacturerId: z.string().uuid().optional(),
    assetTag: z.string().optional(),
    assetId: z.string().uuid().optional(),
    agentId: z.string().uuid().optional(),
    siteId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    externalId: z.string().optional(),
    version: z.string().optional(),
    edition: z.string().optional(),
    ownerId: z.string().uuid().optional(),
    businessOwnerId: z.string().uuid().optional(),
    technicalOwnerId: z.string().uuid().optional(),
    supportGroupId: z.string().uuid().optional(),
    criticality: z.string().optional(),
    confidentialityClass: z.string().optional(),
    integrityClass: z.string().optional(),
    availabilityClass: z.string().optional(),
    installDate: z.string().optional(),
    sourceSystem: z.string().optional(),
    sourceRecordKey: z.string().optional(),
    sourceOfTruth: z.boolean().optional(),
    reconciliationRank: z.number().optional(),
    attributesJson: z.record(z.string(), z.unknown()).optional(),
    serverExt: z.record(z.string(), z.unknown()).optional(),
    applicationExt: z.record(z.string(), z.unknown()).optional(),
    databaseExt: z.record(z.string(), z.unknown()).optional(),
    networkDeviceExt: z.record(z.string(), z.unknown()).optional(),
    cloudResourceExt: z.record(z.string(), z.unknown()).optional(),
    endpointExt: z.record(z.string(), z.unknown()).optional(),
    serviceExt: z.record(z.string(), z.unknown()).optional(),
  })
  .strict(); // rejects unknown keys — catches legacy type/status/environment

const UpdateCISchema = CreateCISchema.partial()
  .extend({ isDeleted: z.boolean().optional() })
  .strict();

// Phase 8 (CASR-05 dependency for Wave 5 plan 06 Asset detail "Link a CI" flow).
// PATCH /cmdb/cis/:id body schema — narrow, targeted at the Asset-link flow.
// .strict() blocks any attempt to tamper with tenantId or other CI fields
// via this route (Threat T-8-05-10). Full CI field updates continue to go
// through PUT /cmdb/cis/:id (UpdateCISchema above).
const PatchCISchema = z
  .object({
    assetId: z.string().uuid().nullable().optional(),
  })
  .strict();

const CreateRelationshipSchema = z
  .object({
    sourceId: z.string().uuid('sourceId must be a valid UUID'),
    targetId: z.string().uuid('targetId must be a valid UUID'),
    relationshipTypeId: z
      .string()
      .uuid('relationshipTypeId is required (use the FK, not the legacy enum key)'),
    description: z.string().optional(),
    sourceSystem: z.string().optional(),
    sourceRecordKey: z.string().optional(),
    confidenceScore: z.number().min(0).max(1).optional(),
    isDiscovered: z.boolean().optional(),
  })
  .strict();

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
 * Blast radius:
 * GET    /api/v1/cmdb/cis/:id/affected-applications — Affected Applications (cmdb.view)
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

      // Phase 7: Zod `.strict()` schema rejects unknown keys — any legacy
      // `type` / `status` / `environment` in the request body produces 400 here.
      const parseResult = CreateCISchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid request body',
          details: parseResult.error.issues,
        });
      }

      try {
        const ci = await createCI(tenantId, parseResult.data as never, userId);
        return reply.status(201).send(ci);
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('classId is required')) {
          return reply.status(400).send({ error: error.message });
        }
        if (error.message.includes('Unique constraint')) {
          return reply.status(409).send({ error: 'CI already exists' });
        }
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

      const query = request.query as Record<string, string | undefined>;

      const result = await listCIs(tenantId, {
        type: query.type,
        status: query.status,
        environment: query.environment,
        classId: query.classId,
        lifecycleStatusId: query.lifecycleStatusId,
        environmentId: query.environmentId,
        categoryId: query.categoryId,
        criticality: query.criticality,
        manufacturerId: query.manufacturerId,
        supportGroupId: query.supportGroupId,
        staleness: query.staleness as 'fresh' | 'stale' | 'all' | undefined,
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

      // Phase 7: Zod `.strict()` schema rejects unknown keys — any legacy
      // `type` / `status` / `environment` in the request body produces 400 here.
      const parseResult = UpdateCISchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid request body',
          details: parseResult.error.issues,
        });
      }

      try {
        const ci = await updateCI(tenantId, id, parseResult.data as never, userId);

        if (!ci) {
          return reply.status(404).send({ error: 'CI not found' });
        }

        return reply.status(200).send(ci);
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('Unique constraint')) {
          return reply.status(409).send({ error: 'CI already exists' });
        }
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── PATCH /api/v1/cmdb/cis/:id — Narrow update (Phase 8 Asset-link) ───────
  //
  // CASR-05 dependency for Wave 5 plan 06 Asset detail page "Link a CI" flow.
  //
  // Security posture (threats T-8-05-09 + T-8-05-10):
  //   - cmdb.edit permission required.
  //   - Body schema Zod .strict() — unknown keys (e.g. `tenantId`, `assetTag`)
  //     produce 400 Invalid body. Full-field CI updates continue via PUT.
  //   - Dual tenant-ownership guard:
  //       1. CI findFirst with { id, tenantId: user.tenantId } — cross-tenant
  //          CI returns null → 404 "CI not found".
  //       2. When body.assetId is a non-null string, Asset findFirst with
  //          { id: body.assetId, tenantId: user.tenantId } — cross-tenant
  //          Asset returns null → 404 "Asset not found in this tenant".
  //     Both checks use findFirst with tenantId (NOT findUnique by id).
  //   - Unlink path: body.assetId === null skips the Asset lookup and sets
  //     the CI's assetId to null.

  fastify.patch(
    '/api/v1/cmdb/cis/:id',
    { preHandler: [requirePermission('cmdb.edit')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const { id: ciId } = request.params as { id: string };

      const parsed = PatchCISchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid body',
          details: parsed.error.issues,
        });
      }
      const body = parsed.data;

      // Step 1: CI tenant ownership check.
      const ci = await prisma.cmdbConfigurationItem.findFirst({
        where: { id: ciId, tenantId },
        select: { id: true },
      });
      if (!ci) {
        return reply.status(404).send({ error: 'CI not found' });
      }

      // Step 2: If assetId is a non-null string, Asset tenant ownership check.
      if (typeof body.assetId === 'string') {
        const asset = await prisma.asset.findFirst({
          where: { id: body.assetId, tenantId },
          select: { id: true },
        });
        if (!asset) {
          return reply
            .status(404)
            .send({ error: 'Asset not found in this tenant' });
        }
      }

      // Step 3: Build update payload. assetId === null is a valid unlink.
      const updateData: Record<string, unknown> = {};
      if ('assetId' in body) {
        updateData.assetId = body.assetId ?? null;
      }

      const updated = await prisma.cmdbConfigurationItem.update({
        where: { id: ciId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: updateData as any,
        select: { id: true, assetId: true },
      });
      return reply.status(200).send({ data: updated });
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

      // Phase 7: Zod `.strict()` schema rejects unknown keys — any legacy
      // `relationshipType` string key produces 400 here. Callers MUST send
      // the `relationshipTypeId` FK instead.
      const parseResult = CreateRelationshipSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid request body',
          details: parseResult.error.issues,
        });
      }

      try {
        const relationship = await createRelationship(tenantId, {
          sourceId: parseResult.data.sourceId,
          targetId: parseResult.data.targetId,
          // Service still accepts the legacy string form for backward compat —
          // but the route schema mandates the FK, so this field is effectively
          // always undefined from this path.
          relationshipType: '',
          relationshipTypeId: parseResult.data.relationshipTypeId,
          description: parseResult.data.description,
          sourceSystem: parseResult.data.sourceSystem,
          sourceRecordKey: parseResult.data.sourceRecordKey,
          confidenceScore: parseResult.data.confidenceScore,
          isDiscovered: parseResult.data.isDiscovered,
        });
        return reply.status(201).send(relationship);
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('relationshipTypeId is required')) {
          return reply.status(400).send({ error: error.message });
        }
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

  // ─── GET /api/v1/cmdb/cis/:id/affected-applications — Blast radius ────────

  fastify.get(
    '/api/v1/cmdb/cis/:id/affected-applications',
    { preHandler: [requirePermission('cmdb.view')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };

      const ci = await getCI(user.tenantId, id);
      if (!ci) {
        return reply.status(404).send({ error: 'CI not found' });
      }

      const affected = await getAffectedApplications(user.tenantId, id);
      return reply.status(200).send({ affected });
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

  // ─── POST /api/v1/cmdb/import — Bulk import CIs ────────────────────────────

  fastify.post(
    '/api/v1/cmdb/import',
    { preHandler: [requirePermission('cmdb.import')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const tenantId = user.tenantId;
      const userId = user.userId;

      const body = request.body as {
        rows?: unknown;
        columnMap?: Record<string, string>;
      };

      if (!Array.isArray(body.rows)) {
        return reply.status(400).send({ error: 'rows must be an array' });
      }

      // If columnMap provided, remap row keys before validation
      let rows: unknown[] = body.rows;
      if (body.columnMap && typeof body.columnMap === 'object') {
        const colMap = body.columnMap;
        rows = (body.rows as Array<Record<string, unknown>>).map((row) => {
          const remapped: Record<string, unknown> = {};
          for (const [srcKey, destKey] of Object.entries(colMap)) {
            if (srcKey in row) {
              remapped[destKey] = row[srcKey];
            }
          }
          // Also include any keys not in the column map (pass-through)
          for (const key of Object.keys(row)) {
            if (!(key in remapped)) {
              remapped[key] = row[key];
            }
          }
          return remapped;
        });
      }

      try {
        const result = await importCIs(tenantId, rows, userId);
        return reply.status(200).send(result);
      } catch (err) {
        const error = err as Error;
        return reply.status(500).send({ error: error.message });
      }
    },
  );

  // ─── POST /api/v1/cmdb/cis/:id/baselines — Create baseline snapshot ────────

  fastify.post(
    '/api/v1/cmdb/cis/:id/baselines',
    { preHandler: [requirePermission('cmdb.edit')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId, userId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as { name?: unknown };

      if (!body.name || typeof body.name !== 'string' || (body.name as string).trim().length === 0) {
        return reply.status(400).send({ error: 'name is required' });
      }

      // Fetch the current CI with all its attributes
      const ci = await getCI(tenantId, id);
      if (!ci) {
        return reply.status(404).send({ error: 'CI not found' });
      }

      // Build snapshot from CI attributes (exclude relations, keep flat data)
      const snapshot: Record<string, unknown> = {};
      const excludeKeys = new Set([
        'tenant', 'category', 'asset', 'agent', 'ciClass', 'lifecycleStatus',
        'operationalStatus', 'cmdbEnvironment', 'manufacturer', 'supportGroup',
        'businessOwner', 'technicalOwner', 'sourceRels', 'targetRels',
        'changeRecords', 'ticketLinks', 'serverExt', 'applicationExt',
        'databaseExt', 'networkDeviceExt', 'cloudResourceExt', 'endpointExt',
        'serviceExt', 'cmdbChangeLinks', 'cmdbIncidentLinks', 'cmdbProblemLinks',
        'attestations', 'duplicateCandidates1', 'duplicateCandidates2', 'hostedVMs',
        'baselines',
      ]);

      for (const [key, value] of Object.entries(ci as Record<string, unknown>)) {
        if (!excludeKeys.has(key)) {
          snapshot[key] = value;
        }
      }

      const baseline = await prisma.cmdbBaseline.create({
        data: {
          tenantId,
          ciId: id,
          name: (body.name as string).trim(),
          snapshot,
          createdById: userId,
        },
      });

      return reply.status(201).send(baseline);
    },
  );

  // ─── GET /api/v1/cmdb/cis/:id/baselines — List baselines ───────────────────

  fastify.get(
    '/api/v1/cmdb/cis/:id/baselines',
    { preHandler: [requirePermission('cmdb.view')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const baselines = await prisma.cmdbBaseline.findMany({
        where: { tenantId, ciId: id },
        orderBy: { createdAt: 'desc' },
      });

      return reply.status(200).send(baselines);
    },
  );

  // ─── GET /api/v1/cmdb/cis/:id/baselines/:baselineId/compare — Compare ──────

  fastify.get(
    '/api/v1/cmdb/cis/:id/baselines/:baselineId/compare',
    { preHandler: [requirePermission('cmdb.view')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id, baselineId } = request.params as { id: string; baselineId: string };

      const baseline = await prisma.cmdbBaseline.findFirst({
        where: { id: baselineId, tenantId, ciId: id },
      });

      if (!baseline) {
        return reply.status(404).send({ error: 'Baseline not found' });
      }

      const ci = await getCI(tenantId, id);
      if (!ci) {
        return reply.status(404).send({ error: 'CI not found' });
      }

      // Compare snapshot to current CI state
      const snapshotData = baseline.snapshot as Record<string, unknown>;
      const currentData = ci as Record<string, unknown>;
      const differences: Array<{ field: string; baseline: unknown; current: unknown }> = [];

      const allKeys = new Set([...Object.keys(snapshotData), ...Object.keys(currentData)]);
      const excludeKeys = new Set([
        'tenant', 'category', 'asset', 'agent', 'ciClass', 'lifecycleStatus',
        'operationalStatus', 'cmdbEnvironment', 'manufacturer', 'supportGroup',
        'businessOwner', 'technicalOwner', 'sourceRels', 'targetRels',
        'changeRecords', 'ticketLinks', 'serverExt', 'applicationExt',
        'databaseExt', 'networkDeviceExt', 'cloudResourceExt', 'endpointExt',
        'serviceExt', 'cmdbChangeLinks', 'cmdbIncidentLinks', 'cmdbProblemLinks',
        'attestations', 'duplicateCandidates1', 'duplicateCandidates2', 'hostedVMs',
        'baselines', 'updatedAt',
      ]);

      for (const key of allKeys) {
        if (excludeKeys.has(key)) continue;
        const baselineVal = snapshotData[key];
        const currentVal = currentData[key];
        if (JSON.stringify(baselineVal) !== JSON.stringify(currentVal)) {
          differences.push({ field: key, baseline: baselineVal, current: currentVal });
        }
      }

      return reply.status(200).send({
        baseline: {
          id: baseline.id,
          name: baseline.name,
          createdAt: baseline.createdAt,
        },
        totalDifferences: differences.length,
        differences,
      });
    },
  );
}
