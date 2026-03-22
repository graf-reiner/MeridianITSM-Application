import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Cron } from 'croner';
import { prisma } from '@meridian/db';
import { stringify } from 'csv-stringify/sync';
import { requirePermission } from '../../../plugins/rbac.js';
import {
  getTicketReport,
  getSlaComplianceReport,
  getChangeReport,
  getSystemHealth,
} from '../../../services/report.service.js';

/**
 * Reports API routes.
 *
 * GET  /api/v1/reports/tickets           — Ticket report (CSV/JSON)         REPT-02
 * GET  /api/v1/reports/sla-compliance    — SLA compliance rates              REPT-04
 * GET  /api/v1/reports/changes           — Change management report          REPT-03
 * GET  /api/v1/reports/cmdb              — CMDB report stub                  REPT-05
 * GET  /api/v1/reports/system-health     — BullMQ queue health metrics       REPT-07
 * GET  /api/v1/reports/scheduled         — List scheduled reports            REPT-06
 * POST /api/v1/reports/scheduled         — Create scheduled report
 * PATCH /api/v1/reports/scheduled/:id   — Update scheduled report
 * DELETE /api/v1/reports/scheduled/:id  — Delete scheduled report
 */
export async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /api/v1/reports/tickets ──────────────────────────────────────────

  fastify.get('/api/v1/reports/tickets', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId } = user;

    const query = request.query as {
      dateFrom?: string;
      dateTo?: string;
      status?: string;
      priority?: string;
      assignedToId?: string;
      categoryId?: string;
      format?: string;
    };

    const format = query.format === 'csv' ? 'csv' : 'json';

    const result = await getTicketReport(tenantId, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      status: query.status,
      priority: query.priority,
      assignedToId: query.assignedToId,
      categoryId: query.categoryId,
      format,
    });

    if (format === 'csv') {
      void reply.header('Content-Type', 'text/csv');
      void reply.header('Content-Disposition', 'attachment; filename="tickets-report.csv"');
      return reply.send(result.data);
    }

    return { data: result.data, count: result.count };
  });

  // ─── GET /api/v1/reports/sla-compliance ───────────────────────────────────

  fastify.get('/api/v1/reports/sla-compliance', async (request: FastifyRequest) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId } = user;

    const query = request.query as { dateFrom?: string; dateTo?: string };

    return getSlaComplianceReport(tenantId, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  });

  // ─── GET /api/v1/reports/changes ──────────────────────────────────────────

  fastify.get('/api/v1/reports/changes', async (request: FastifyRequest) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId } = user;

    const query = request.query as { dateFrom?: string; dateTo?: string };

    return getChangeReport(tenantId, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  });

  // ─── GET /api/v1/reports/cmdb — CMDB inventory report (REPT-05) ───────────

  fastify.get(
    '/api/v1/reports/cmdb',
    { preHandler: [requirePermission('reports.read'), requirePermission('cmdb.view')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const query = request.query as {
        format?: string;
        type?: string;
        status?: string;
        includeRelationships?: string;
      };

      const format = query.format === 'csv' ? 'csv' : 'json';
      const includeRelationships = query.includeRelationships === 'true';

      // Build filter where clause
      const where = {
        tenantId,
        ...(query.type ? { type: query.type as never } : {}),
        ...(query.status ? { status: query.status as never } : {}),
      };

      const cis = await prisma.cmdbConfigurationItem.findMany({
        where,
        orderBy: { ciNumber: 'asc' },
      });

      const generatedAt = new Date().toISOString();

      if (format === 'csv') {
        const csvData = stringify(
          cis.map((ci) => ({
            ciNumber: ci.ciNumber,
            name: ci.name,
            type: ci.type,
            status: ci.status,
            environment: ci.environment,
            createdAt: ci.createdAt.toISOString(),
          })),
          { header: true },
        );

        const dateStr = new Date().toISOString().slice(0, 10);
        void reply.header('Content-Type', 'text/csv');
        void reply.header(
          'Content-Disposition',
          `attachment; filename="cmdb-inventory-${dateStr}.csv"`,
        );
        return reply.send(csvData);
      }

      // JSON format — optionally include relationships
      if (includeRelationships) {
        const ciIds = cis.map((ci) => ci.id);
        const relationships =
          ciIds.length > 0
            ? await prisma.cmdbRelationship.findMany({
                where: {
                  tenantId,
                  OR: [{ sourceId: { in: ciIds } }, { targetId: { in: ciIds } }],
                },
              })
            : [];

        return { cis, relationships, total: cis.length, generatedAt };
      }

      return { cis, total: cis.length, generatedAt };
    },
  );

  // ─── GET /api/v1/reports/system-health ────────────────────────────────────

  fastify.get(
    '/api/v1/reports/system-health',
    { preHandler: [requirePermission('settings:read')] },
    async (request: FastifyRequest) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId } = user;

      return getSystemHealth(tenantId);
    },
  );

  // ─── GET /api/v1/reports/scheduled ────────────────────────────────────────

  fastify.get('/api/v1/reports/scheduled', async (request: FastifyRequest) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId } = user;

    const reports = await prisma.scheduledReport.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return reports;
  });

  // ─── POST /api/v1/reports/scheduled ───────────────────────────────────────

  fastify.post(
    '/api/v1/reports/scheduled',
    { preHandler: [requirePermission('settings:write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId } = user;

      const body = request.body as {
        name: string;
        reportType: 'tickets' | 'sla' | 'changes';
        schedule: string;
        recipients: string[];
        filters?: Record<string, unknown>;
      };

      // Validate cron expression — Cron() throws if invalid
      let cron: Cron;
      try {
        cron = new Cron(body.schedule);
      } catch {
        return reply.status(400).send({ error: 'Invalid cron expression' });
      }

      const nextRunAt = cron.nextRun();

      const report = await prisma.scheduledReport.create({
        data: {
          tenantId,
          name: body.name,
          reportType: body.reportType,
          schedule: body.schedule,
          recipients: body.recipients,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filters: (body.filters ?? null) as any,
          isActive: true,
          nextRunAt,
        },
      });

      return reply.status(201).send(report);
    },
  );

  // ─── PATCH /api/v1/reports/scheduled/:id ──────────────────────────────────

  fastify.patch(
    '/api/v1/reports/scheduled/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId } = user;

      const { id } = request.params as { id: string };

      const body = request.body as {
        name?: string;
        reportType?: 'tickets' | 'sla' | 'changes';
        schedule?: string;
        recipients?: string[];
        filters?: Record<string, unknown>;
        isActive?: boolean;
      };

      // Check ownership
      const existing = await prisma.scheduledReport.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Scheduled report not found' });
      }

      // Recalculate nextRunAt if schedule changed
      let nextRunAt: Date | undefined;
      if (body.schedule && body.schedule !== existing.schedule) {
        try {
          const cron = new Cron(body.schedule);
          nextRunAt = cron.nextRun() ?? undefined;
        } catch {
          return reply.status(400).send({ error: 'Invalid cron expression' });
        }
      }

      const updated = await prisma.scheduledReport.update({
        where: { id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.reportType !== undefined && { reportType: body.reportType }),
          ...(body.schedule !== undefined && { schedule: body.schedule }),
          ...(body.recipients !== undefined && { recipients: body.recipients }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(body.filters !== undefined && { filters: body.filters as any }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(nextRunAt !== undefined && { nextRunAt }),
        },
      });

      return updated;
    },
  );

  // ─── DELETE /api/v1/reports/scheduled/:id ─────────────────────────────────

  fastify.delete(
    '/api/v1/reports/scheduled/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId } = user;

      const { id } = request.params as { id: string };

      // Check ownership
      const existing = await prisma.scheduledReport.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Scheduled report not found' });
      }

      await prisma.scheduledReport.delete({ where: { id } });

      return reply.status(204).send();
    },
  );
}
