import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { getAllNodeDefinitionDTOs, invalidateWorkflowCache } from '../../../services/workflow-engine/index.js';
import { convertRuleToWorkflowGraph } from '../../../services/workflow-engine/migration.js';

/**
 * Workflow Automation Designer REST API routes.
 *
 * GET    /api/v1/settings/workflows                — List workflows
 * POST   /api/v1/settings/workflows                — Create workflow
 * GET    /api/v1/settings/workflows/node-definitions — Get palette node definitions
 * GET    /api/v1/settings/workflows/:id             — Get workflow with current graph
 * PATCH  /api/v1/settings/workflows/:id             — Update workflow metadata
 * DELETE /api/v1/settings/workflows/:id             — Disable workflow
 * PUT    /api/v1/settings/workflows/:id/graph       — Save graph (new version)
 * POST   /api/v1/settings/workflows/:id/publish     — Publish current version
 * POST   /api/v1/settings/workflows/:id/validate    — Validate graph
 * GET    /api/v1/settings/workflows/:id/executions   — Execution history
 */
export async function workflowRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET — List workflows ─────────────────────────────────────────────────

  fastify.get('/api/v1/settings/workflows', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { trigger, status } = request.query as { trigger?: string; status?: string };

    const where: Record<string, unknown> = { tenantId: user.tenantId };
    if (trigger) where.trigger = trigger;
    if (status) where.status = status;

    const workflows = await prisma.workflow.findMany({
      where: where as any,
      include: {
        versions: {
          orderBy: { version: 'desc' as const },
          take: 1,
          select: { id: true, version: true, createdAt: true },
        },
        _count: { select: { executions: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return reply.status(200).send(workflows);
  });

  // ─── POST — Create workflow ───────────────────────────────────────────────

  fastify.post('/api/v1/settings/workflows', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const body = request.body as {
      name: string;
      description?: string;
      trigger: string;
      scopedQueueId?: string;
    };

    if (!body.name || !body.trigger) {
      return reply.status(400).send({ error: 'name and trigger are required' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create initial version with empty graph
      const workflow = await tx.workflow.create({
        data: {
          tenantId: user.tenantId,
          name: body.name,
          description: body.description ?? null,
          trigger: body.trigger,
          scopedQueueId: body.scopedQueueId ?? null,
          status: 'DRAFT',
          createdById: user.userId,
        },
      });

      const version = await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          version: 1,
          graphJson: { nodes: [], edges: [] },
          createdById: user.userId,
        },
      });

      await tx.workflow.update({
        where: { id: workflow.id },
        data: { currentVersionId: version.id },
      });

      await tx.workflowAuditLog.create({
        data: {
          tenantId: user.tenantId,
          workflowId: workflow.id,
          action: 'CREATED',
          actorId: user.userId,
        },
      });

      return { ...workflow, currentVersionId: version.id };
    });

    return reply.status(201).send(result);
  });

  // ─── GET /node-definitions — Palette data for the frontend ────────────────

  fastify.get('/api/v1/settings/workflows/node-definitions', async (_request, reply) => {
    const definitions = getAllNodeDefinitionDTOs();
    return reply.status(200).send(definitions);
  });

  // ─── GET /:id — Single workflow with graph ────────────────────────────────

  fastify.get('/api/v1/settings/workflows/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const workflow = await prisma.workflow.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });

    const currentVersion = workflow.versions[0] ?? null;

    return reply.status(200).send({
      ...workflow,
      graph: currentVersion?.graphJson ?? { nodes: [], edges: [] },
      versionNumber: currentVersion?.version ?? 0,
      versionId: currentVersion?.id ?? null,
    });
  });

  // ─── PATCH /:id — Update metadata ─────────────────────────────────────────

  fastify.patch('/api/v1/settings/workflows/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      description?: string;
      status?: string;
      trigger?: string;
      scopedQueueId?: string;
    };

    const existing = await prisma.workflow.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Workflow not found' });

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.trigger !== undefined) updates.trigger = body.trigger;
    if (body.scopedQueueId !== undefined) updates.scopedQueueId = body.scopedQueueId || null;

    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === 'DISABLED' || body.status === 'PUBLISHED') {
        await invalidateWorkflowCache(user.tenantId);
      }
    }

    const workflow = await prisma.workflow.update({ where: { id }, data: updates });

    await prisma.workflowAuditLog.create({
      data: {
        tenantId: user.tenantId,
        workflowId: id,
        action: 'UPDATED',
        actorId: user.userId,
        metadata: updates,
      },
    });

    return reply.status(200).send(workflow);
  });

  // ─── DELETE /:id — Disable workflow ───────────────────────────────────────

  fastify.delete('/api/v1/settings/workflows/:id', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };

    const existing = await prisma.workflow.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Workflow not found' });

    await prisma.workflow.update({
      where: { id },
      data: { status: 'DISABLED' },
    });

    await prisma.workflowAuditLog.create({
      data: {
        tenantId: user.tenantId,
        workflowId: id,
        action: 'DISABLED',
        actorId: user.userId,
      },
    });

    await invalidateWorkflowCache(user.tenantId);

    return reply.status(204).send();
  });

  // ─── PUT /:id/graph — Save graph (creates new draft version) ──────────────

  fastify.put('/api/v1/settings/workflows/:id/graph', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { graph: { nodes: unknown[]; edges: unknown[] } };

    if (!body.graph) {
      return reply.status(400).send({ error: 'graph is required' });
    }

    const existing = await prisma.workflow.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Workflow not found' });

    // Get latest version number
    const latestVersion = await prisma.workflowVersion.findFirst({
      where: { workflowId: id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const newVersionNum = (latestVersion?.version ?? 0) + 1;

    const version = await prisma.workflowVersion.create({
      data: {
        workflowId: id,
        version: newVersionNum,
        graphJson: body.graph as any,
        createdById: user.userId,
      },
    });

    await prisma.workflow.update({
      where: { id },
      data: { currentVersionId: version.id },
    });

    return reply.status(200).send({ versionId: version.id, version: newVersionNum });
  });

  // ─── POST /:id/publish — Publish current version ─────────────────────────

  fastify.post('/api/v1/settings/workflows/:id/publish', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };

    const workflow = await prisma.workflow.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });

    if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });

    const currentVersion = workflow.versions[0];
    if (!currentVersion) return reply.status(400).send({ error: 'No version to publish' });

    const graph = currentVersion.graphJson as { nodes?: unknown[]; edges?: unknown[] };
    if (!graph.nodes?.length) {
      return reply.status(400).send({ error: 'Cannot publish an empty workflow' });
    }

    await prisma.workflow.update({
      where: { id },
      data: { status: 'PUBLISHED', currentVersionId: currentVersion.id },
    });

    await prisma.workflowAuditLog.create({
      data: {
        tenantId: user.tenantId,
        workflowId: id,
        action: 'PUBLISHED',
        actorId: user.userId,
        metadata: { versionId: currentVersion.id, version: currentVersion.version },
      },
    });

    await invalidateWorkflowCache(user.tenantId);

    return reply.status(200).send({ published: true, version: currentVersion.version });
  });

  // ─── POST /:id/validate — Validate graph ──────────────────────────────────

  fastify.post('/api/v1/settings/workflows/:id/validate', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const workflow = await prisma.workflow.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });

    const graph = (workflow.versions[0]?.graphJson ?? { nodes: [], edges: [] }) as { nodes: Array<{ id: string; type: string }>; edges: Array<{ source: string; target: string }> };
    const errors: Array<{ nodeId?: string; message: string }> = [];

    // Check for trigger node
    const triggers = graph.nodes.filter(n => n.type?.startsWith('trigger_'));
    if (triggers.length === 0) errors.push({ message: 'Workflow must have at least one trigger node' });
    if (triggers.length > 1) errors.push({ message: 'Workflow should have exactly one trigger node' });

    // Check for at least one non-trigger node
    const nonTriggers = graph.nodes.filter(n => !n.type?.startsWith('trigger_'));
    if (nonTriggers.length === 0) errors.push({ message: 'Workflow must have at least one action or condition node' });

    // Check for orphan nodes (no incoming or outgoing edges)
    const connectedNodes = new Set<string>();
    for (const edge of graph.edges) {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    }
    for (const node of graph.nodes) {
      if (!connectedNodes.has(node.id) && graph.nodes.length > 1) {
        errors.push({ nodeId: node.id, message: `Node "${node.id}" is disconnected` });
      }
    }

    return reply.status(200).send({
      valid: errors.length === 0,
      errors,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    });
  });

  // ─── GET /:id/executions — Execution history ─────────────────────────────

  fastify.get('/api/v1/settings/workflows/:id/executions', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const { page = '1', pageSize = '20' } = request.query as { page?: string; pageSize?: string };

    const skip = (Number(page) - 1) * Number(pageSize);

    const [executions, total] = await Promise.all([
      prisma.workflowExecution.findMany({
        where: { workflowId: id, tenantId: user.tenantId },
        include: {
          steps: { orderBy: { startedAt: 'asc' } },
          version: { select: { version: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: Number(pageSize),
      }),
      prisma.workflowExecution.count({
        where: { workflowId: id, tenantId: user.tenantId },
      }),
    ]);

    return reply.status(200).send({ executions, total, page: Number(page), pageSize: Number(pageSize) });
  });

  // ─── POST /:id/simulate — Run workflow in simulation mode ─────────────────

  fastify.post('/api/v1/settings/workflows/:id/simulate', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { eventContext: Record<string, unknown> };

    const workflow = await prisma.workflow.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });

    const currentVersion = workflow.versions[0];
    if (!currentVersion) return reply.status(400).send({ error: 'No version to simulate' });

    // Build a minimal event context with the provided data
    const eventContext = {
      ticket: {
        id: 'sim-ticket-id',
        ticketNumber: 0,
        title: 'Simulation Ticket',
        type: 'INCIDENT',
        priority: 'MEDIUM',
        status: 'NEW',
        ...(body.eventContext?.ticket ?? {}),
      },
      actorId: user.userId,
      ...(body.eventContext ?? {}),
    };

    const { executeWorkflow } = await import('../../../services/workflow-engine/index.js');
    await executeWorkflow(user.tenantId, workflow.id, currentVersion.id, workflow.trigger, eventContext as any, true);

    // Load the execution that was just created
    const execution = await prisma.workflowExecution.findFirst({
      where: { workflowId: id, versionId: currentVersion.id, isSimulation: true },
      orderBy: { startedAt: 'desc' },
      include: { steps: { orderBy: { startedAt: 'asc' } } },
    });

    return reply.status(200).send({ execution });
  });

  // ─── POST /migrate-from-rules — Convert notification rules to workflows ───

  fastify.post('/api/v1/settings/workflows/migrate-from-rules', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const body = request.body as { ruleIds?: string[] };

    // Load rules to migrate
    const where: Record<string, unknown> = { tenantId: user.tenantId };
    if (body.ruleIds?.length) where.id = { in: body.ruleIds };

    const rules = await prisma.notificationRule.findMany({
      where: where as any,
      select: {
        id: true, name: true, trigger: true, conditionGroups: true,
        actions: true, scopedQueueId: true, description: true,
      },
    });

    if (rules.length === 0) {
      return reply.status(200).send({ migrated: 0, workflows: [], warnings: [] });
    }

    const allWarnings: string[] = [];
    const created: Array<{ id: string; name: string; sourceRuleId: string }> = [];

    for (const rule of rules) {
      const { graph, warnings } = convertRuleToWorkflowGraph(rule as any);
      allWarnings.push(...warnings.map(w => `[${rule.name}] ${w}`));

      const workflow = await prisma.$transaction(async (tx) => {
        const wf = await tx.workflow.create({
          data: {
            tenantId: user.tenantId,
            name: `[Migrated] ${rule.name}`,
            description: rule.description ?? `Migrated from notification rule: ${rule.name}`,
            trigger: rule.trigger,
            scopedQueueId: rule.scopedQueueId ?? null,
            status: 'DRAFT',
            createdById: user.userId,
          },
        });

        const version = await tx.workflowVersion.create({
          data: { workflowId: wf.id, version: 1, graphJson: graph as any, createdById: user.userId },
        });

        await tx.workflow.update({ where: { id: wf.id }, data: { currentVersionId: version.id } });

        await tx.workflowAuditLog.create({
          data: {
            tenantId: user.tenantId, workflowId: wf.id, action: 'CREATED', actorId: user.userId,
            metadata: { migratedFromRuleId: rule.id, migratedFromRuleName: rule.name },
          },
        });

        return wf;
      });

      created.push({ id: workflow.id, name: workflow.name, sourceRuleId: rule.id });
    }

    return reply.status(201).send({
      migrated: created.length,
      workflows: created,
      warnings: allWarnings,
    });
  });
}
