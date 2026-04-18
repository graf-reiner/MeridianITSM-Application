/**
 * Phase 8 (CASR-03 / CRIT-5): GET /api/v1/reports/software-installed
 *
 * License-reporting endpoint — lists software installed across all CIs in
 * the caller's tenant. Tenant scoping is extracted from the authenticated
 * session and passed to `getSoftwareInventoryReport` as a trusted parameter.
 *
 * Permission: `reports.read`. `licenseKey` is INTENTIONALLY OMITTED from
 * the list response (Threat T-8-05-02) — callers needing licenseKey must
 * use the CI-scoped GET /api/v1/cmdb/cis/:id/software endpoint, which is
 * gated by `cmdb.view`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../../../plugins/rbac.js';
import { getSoftwareInventoryReport } from '../../../services/report.service.js';

const querySchema = z
  .object({
    softwareName: z.string().optional(),
    vendor: z.string().optional(),
    publisher: z.string().optional(),
    ciClassKey: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(200).optional(),
  })
  .strict();

export async function softwareInventoryReportRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    '/api/v1/reports/software-installed',
    { preHandler: [requirePermission('reports.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as { tenantId: string; userId: string };

      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid query',
          issues: parsed.error.issues,
        });
      }

      const result = await getSoftwareInventoryReport(user.tenantId, parsed.data);
      return reply.send({ data: result.data, count: result.count });
    },
  );
}
