/**
 * Phase 8 (CASR-03): GET /api/v1/cmdb/cis/:id/software
 *
 * Returns all installed software rows for a CI, INCLUDING licenseKey.
 *
 * Permission: `cmdb.view`. Defense-in-depth: the handler first verifies the
 * CI belongs to the caller's tenant (`findFirst({ id, tenantId })`) BEFORE
 * issuing the software query. Both queries filter on tenantId so that even
 * a compromised first-stage check cannot leak cross-tenant rows (Threat
 * T-8-05-05).
 *
 * Multi-tenancy posture (CLAUDE.md Rule 1):
 *   - user.tenantId is the trusted tenant context from the JWT session.
 *   - ci.tenantId is verified by findFirst before the software query runs.
 *   - cmdb_software_installed query filters on tenantId AND ciId.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../../../plugins/rbac.js';

export async function ciSoftwareRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/v1/cmdb/cis/:id/software',
    { preHandler: [requirePermission('cmdb.view')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { id: ciId } = request.params as { id: string };

      // Defense-in-depth: verify CI belongs to tenant before listing software.
      const ci = await prisma.cmdbConfigurationItem.findFirst({
        where: { id: ciId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!ci) {
        return reply.code(404).send({ error: 'CI not found' });
      }

      // Software query — scoped by BOTH tenantId (belt) and ciId (suspenders).
      // licenseKey is returned ONLY here, gated by the cmdb.view preHandler.
      const software = await prisma.cmdbSoftwareInstalled.findMany({
        where: { tenantId: user.tenantId, ciId },
        orderBy: [{ name: 'asc' }, { version: 'asc' }],
      });

      return reply.send({ data: software });
    },
  );
}
