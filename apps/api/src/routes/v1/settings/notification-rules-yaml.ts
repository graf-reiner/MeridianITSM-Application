import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { stringify, parse } from 'yaml';
import crypto from 'node:crypto';
import { requirePermission } from '../../../plugins/rbac.js';
import { invalidateRulesCache } from '../../../services/notification-rules.service.js';
import { redis } from '../../../lib/redis.js';

const BASE = '/api/v1/settings/notification-rules';

interface YamlRule {
  name: string;
  description?: string;
  trigger: string;
  conditionGroups?: unknown[];
  actions: unknown[];
  priority?: number;
  stopAfterMatch?: boolean;
  scopedQueue?: string;
  isActive?: boolean;
}

interface ImportPreviewItem {
  name: string;
  action: 'create' | 'update' | 'skip';
  warnings: string[];
  data?: Record<string, unknown>;
}

interface ImportPreview {
  rules: ImportPreviewItem[];
  tenantId: string;
}

export async function notificationRulesYamlRoutes(app: FastifyInstance): Promise<void> {
  // GET /yaml-export - Export all rules as YAML
  app.get(BASE + '/yaml-export', { preHandler: [requirePermission('settings:read')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { tenantId } = user;

    const rules = await prisma.notificationRule.findMany({
      where: { tenantId },
      orderBy: { priority: 'asc' },
      include: { scopedQueue: { select: { name: true } } },
    });

    const exportData = rules.map((rule) => {
      const entry: Record<string, unknown> = {
        name: rule.name,
        description: rule.description,
        trigger: rule.trigger,
        conditionGroups: rule.conditionGroups,
        actions: rule.actions,
        priority: rule.priority,
        stopAfterMatch: rule.stopAfterMatch,
        isActive: rule.isActive,
      };
      if (rule.scopedQueue) {
        entry.scopedQueue = rule.scopedQueue.name;
      }
      return entry;
    });

    const yamlContent = stringify({ notificationRules: exportData });

    reply.header('Content-Type', 'application/x-yaml');
    reply.header('Content-Disposition', 'attachment; filename="notification-rules.yaml"');
    return reply.send(yamlContent);
  });

  // POST /yaml-import - Parse YAML and return preview
  app.post(BASE + '/yaml-import', { preHandler: [requirePermission('settings:update')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { tenantId } = user;

    let yamlText: string;
    const contentType = request.headers['content-type'] ?? '';

    if (contentType.includes('yaml') || contentType.includes('text/yaml') || contentType.includes('application/x-yaml')) {
      yamlText = request.body as string;
    } else {
      const jsonBody = request.body as { yaml?: string };
      if (!jsonBody.yaml || typeof jsonBody.yaml !== 'string') {
        return reply.code(400).send({ error: 'Request must include YAML content (Content-Type: application/x-yaml or JSON body with yaml field)' });
      }
      yamlText = jsonBody.yaml;
    }

    let parsed: { notificationRules?: YamlRule[] };
    try {
      parsed = parse(yamlText) as { notificationRules?: YamlRule[] };
    } catch (err) {
      return reply.code(400).send({ error: 'Invalid YAML: ' + (err instanceof Error ? err.message : String(err)) });
    }

    if (!parsed.notificationRules || !Array.isArray(parsed.notificationRules)) {
      return reply.code(400).send({ error: 'YAML must contain a notificationRules array at the root level' });
    }

    // Load existing rules and queues for name resolution
    const existingRules = await prisma.notificationRule.findMany({
      where: { tenantId }, select: { id: true, name: true },
    });
    const existingByName = new Map(existingRules.map((r) => [r.name, r.id]));

    const queues = await prisma.queue.findMany({
      where: { tenantId }, select: { id: true, name: true },
    });
    const queueByName = new Map(queues.map((q) => [q.name, q.id]));

    const preview: ImportPreviewItem[] = [];

    for (const yamlRule of parsed.notificationRules) {
      const warnings: string[] = [];

      if (!yamlRule.name) { warnings.push('Missing name - rule will be skipped'); preview.push({ name: '(unnamed)', action: 'skip', warnings }); continue; }
      if (!yamlRule.trigger) warnings.push('Missing trigger');
      if (!yamlRule.actions || !Array.isArray(yamlRule.actions)) warnings.push('Missing or invalid actions array');

      let scopedQueueId: string | null = null;
      if (yamlRule.scopedQueue) {
        const qId = queueByName.get(yamlRule.scopedQueue);
        if (qId) { scopedQueueId = qId; }
        else { warnings.push('Queue not found: ' + yamlRule.scopedQueue); }
      }

      const ruleData: Record<string, unknown> = {
        name: yamlRule.name,
        description: yamlRule.description ?? null,
        trigger: yamlRule.trigger,
        conditionGroups: yamlRule.conditionGroups ?? [],
        actions: yamlRule.actions ?? [],
        priority: yamlRule.priority ?? 100,
        stopAfterMatch: yamlRule.stopAfterMatch ?? false,
        scopedQueueId,
        isActive: yamlRule.isActive ?? true,
      };

      const existingId = existingByName.get(yamlRule.name);
      if (existingId) {
        preview.push({ name: yamlRule.name, action: 'update', warnings, data: { ...ruleData, existingId } });
      } else {
        preview.push({ name: yamlRule.name, action: 'create', warnings, data: ruleData });
      }
    }

    const sessionId = crypto.randomUUID();
    const previewData: ImportPreview = { rules: preview, tenantId };

    try {
      await redis.set(
        'import-preview:' + tenantId + ':' + sessionId,
        JSON.stringify(previewData),
        'EX', 600,
      );
    } catch (err) {
      console.error('[notification-rules-yaml] Failed to store import preview in Redis:', err);
      return reply.code(500).send({ error: 'Failed to store import preview' });
    }

    return reply.send({
      rules: preview.map(({ data: _d, ...rest }) => rest),
      sessionId,
    });
  });

  // POST /yaml-import-confirm - Execute import from preview
  app.post(BASE + '/yaml-import-confirm', { preHandler: [requirePermission('settings:update')] }, async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId } = user;
    const body = request.body as { sessionId?: string };

    if (!body.sessionId) {
      return reply.code(400).send({ error: 'sessionId is required' });
    }

    const redisKey = 'import-preview:' + tenantId + ':' + body.sessionId;
    let previewJson: string | null;
    try {
      previewJson = await redis.get(redisKey);
    } catch (err) {
      console.error('[notification-rules-yaml] Failed to read import preview from Redis:', err);
      return reply.code(500).send({ error: 'Failed to read import preview' });
    }

    if (!previewJson) {
      return reply.code(404).send({ error: 'Import session not found or expired. Please re-import the YAML file.' });
    }

    const preview = JSON.parse(previewJson) as ImportPreview;

    if (preview.tenantId !== tenantId) {
      return reply.code(403).send({ error: 'Import session belongs to a different tenant' });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of preview.rules) {
      if (item.action === 'skip' || !item.data) { skipped++; continue; }

      try {
        if (item.action === 'create') {
          await prisma.notificationRule.create({
            data: {
              tenantId,
              name: item.data.name as string,
              description: item.data.description as string | null,
              trigger: item.data.trigger as string,
              conditionGroups: item.data.conditionGroups as never,
              actions: item.data.actions as never,
              priority: item.data.priority as number,
              stopAfterMatch: item.data.stopAfterMatch as boolean,
              scopedQueueId: item.data.scopedQueueId as string | null,
              isActive: item.data.isActive as boolean,
              createdById: user.userId,
            },
          });
          created++;
        } else if (item.action === 'update') {
          const existingId = item.data.existingId as string;
          await prisma.notificationRule.update({
            where: { id: existingId },
            data: {
              description: item.data.description as string | null,
              trigger: item.data.trigger as string,
              conditionGroups: item.data.conditionGroups as never,
              actions: item.data.actions as never,
              priority: item.data.priority as number,
              stopAfterMatch: item.data.stopAfterMatch as boolean,
              scopedQueueId: item.data.scopedQueueId as string | null,
              isActive: item.data.isActive as boolean,
            },
          });
          updated++;
        }
      } catch (err) {
        console.error('[notification-rules-yaml] Failed to import rule:', item.name, err);
        skipped++;
      }
    }

    // Clean up Redis preview
    try { await redis.del(redisKey); } catch { /* ignore */ }

    await invalidateRulesCache(tenantId);

    return reply.send({ created, updated, skipped });
  });
}
