import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

/**
 * Email Activity Log Routes
 *
 * GET /api/v1/settings/email-accounts/:id/activity — Paginated activity log for a single account
 * GET /api/v1/settings/email-activity               — Tenant-wide activity log
 */
export async function emailActivityRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/email-accounts/:id/activity
  fastify.get<{
    Params: { id: string };
    Querystring: {
      direction?: string;
      status?: string;
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    };
  }>(
    '/api/v1/settings/email-accounts/:id/activity',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const emailAccountId = request.params.id;

      const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(request.query.pageSize ?? '50', 10) || 50));
      const skip = (page - 1) * pageSize;

      const where: Record<string, unknown> = {
        tenantId,
        emailAccountId,
      };

      if (request.query.direction) {
        where.direction = request.query.direction;
      }
      if (request.query.status) {
        where.status = request.query.status;
      }
      if (request.query.from || request.query.to) {
        const occurredAt: Record<string, Date> = {};
        if (request.query.from) occurredAt.gte = new Date(request.query.from);
        if (request.query.to) occurredAt.lte = new Date(request.query.to);
        where.occurredAt = occurredAt;
      }

      const [data, total] = await Promise.all([
        prisma.emailActivityLog.findMany({
          where: where as never,
          orderBy: { occurredAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.emailActivityLog.count({ where: where as never }),
      ]);

      return reply.status(200).send({ data, total, page, pageSize });
    },
  );

  // GET /api/v1/settings/email-activity — Tenant-wide activity log
  fastify.get<{
    Querystring: {
      emailAccountId?: string;
      direction?: string;
      status?: string;
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    };
  }>(
    '/api/v1/settings/email-activity',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(request.query.pageSize ?? '50', 10) || 50));
      const skip = (page - 1) * pageSize;

      const where: Record<string, unknown> = { tenantId };

      if (request.query.emailAccountId) {
        where.emailAccountId = request.query.emailAccountId;
      }
      if (request.query.direction) {
        where.direction = request.query.direction;
      }
      if (request.query.status) {
        where.status = request.query.status;
      }
      if (request.query.from || request.query.to) {
        const occurredAt: Record<string, Date> = {};
        if (request.query.from) occurredAt.gte = new Date(request.query.from);
        if (request.query.to) occurredAt.lte = new Date(request.query.to);
        where.occurredAt = occurredAt;
      }

      const [data, total] = await Promise.all([
        prisma.emailActivityLog.findMany({
          where: where as never,
          orderBy: { occurredAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.emailActivityLog.count({ where: where as never }),
      ]);

      return reply.status(200).send({ data, total, page, pageSize });
    },
  );
}
