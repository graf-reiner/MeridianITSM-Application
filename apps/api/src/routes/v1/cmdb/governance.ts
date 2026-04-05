import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../../plugins/rbac.js';
import {
  createChangeLink, deleteChangeLink, listChangeLinks,
  createIncidentLink, deleteIncidentLink, listIncidentLinks,
  createProblemLink, deleteProblemLink, listProblemLinks,
} from '../../../services/cmdb-links.service.js';
import {
  createAttestation, listAttestations,
  listDuplicateCandidates, reviewDuplicateCandidate,
  getStaleReport, getOrphanedReport, getHealthReport, getMissingDataReport,
} from '../../../services/cmdb-governance.service.js';

/**
 * CMDB ITSM Link, Governance, and Report routes.
 */
export async function cmdbGovernanceRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── Change Links ──────────────────────────────────────────────────────────

  fastify.get('/api/v1/cmdb/cis/:id/changes', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const result = await listChangeLinks(user.tenantId, id);
    return reply.send(result);
  });

  fastify.post('/api/v1/cmdb/cis/:id/changes', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { changeId?: string; impactRole?: string };
    if (!body.changeId) return reply.status(400).send({ error: 'changeId is required' });
    try {
      const result = await createChangeLink(user.tenantId, id, body.changeId, body.impactRole);
      return reply.status(201).send(result);
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  fastify.delete('/api/v1/cmdb/cis/:id/changes/:changeId', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id, changeId } = request.params as { id: string; changeId: string };
    try {
      await deleteChangeLink(user.tenantId, id, changeId);
      return reply.status(204).send();
    } catch (err) { return reply.status(404).send({ error: (err as Error).message }); }
  });

  // ─── Incident Links ────────────────────────────────────────────────────────

  fastify.get('/api/v1/cmdb/cis/:id/incidents', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const result = await listIncidentLinks(user.tenantId, id);
    return reply.send(result);
  });

  fastify.post('/api/v1/cmdb/cis/:id/incidents', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { ticketId?: string; impactRole?: string };
    if (!body.ticketId) return reply.status(400).send({ error: 'ticketId is required' });
    try {
      const result = await createIncidentLink(user.tenantId, id, body.ticketId, body.impactRole);
      return reply.status(201).send(result);
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  fastify.delete('/api/v1/cmdb/cis/:id/incidents/:ticketId', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id, ticketId } = request.params as { id: string; ticketId: string };
    try {
      await deleteIncidentLink(user.tenantId, id, ticketId);
      return reply.status(204).send();
    } catch (err) { return reply.status(404).send({ error: (err as Error).message }); }
  });

  // ─── Problem Links ─────────────────────────────────────────────────────────

  fastify.get('/api/v1/cmdb/cis/:id/problems', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const result = await listProblemLinks(user.tenantId, id);
    return reply.send(result);
  });

  fastify.post('/api/v1/cmdb/cis/:id/problems', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { ticketId?: string; impactRole?: string };
    if (!body.ticketId) return reply.status(400).send({ error: 'ticketId is required' });
    try {
      const result = await createProblemLink(user.tenantId, id, body.ticketId, body.impactRole);
      return reply.status(201).send(result);
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  fastify.delete('/api/v1/cmdb/cis/:id/problems/:ticketId', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id, ticketId } = request.params as { id: string; ticketId: string };
    try {
      await deleteProblemLink(user.tenantId, id, ticketId);
      return reply.status(204).send();
    } catch (err) { return reply.status(404).send({ error: (err as Error).message }); }
  });

  // ─── Attestations ──────────────────────────────────────────────────────────

  fastify.get('/api/v1/cmdb/cis/:id/attestations', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; pageSize?: string };
    const result = await listAttestations(user.tenantId, id,
      query.page ? parseInt(query.page, 10) : undefined,
      query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    );
    return reply.send(result);
  });

  fastify.post('/api/v1/cmdb/cis/:id/attestations', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { attestationStatus?: string; comments?: string };
    if (!body.attestationStatus) return reply.status(400).send({ error: 'attestationStatus is required' });
    try {
      const result = await createAttestation(user.tenantId, id, user.userId, {
        attestationStatus: body.attestationStatus,
        comments: body.comments,
      });
      return reply.status(201).send(result);
    } catch (err) { return reply.status(500).send({ error: (err as Error).message }); }
  });

  // ─── Duplicate Candidates ──────────────────────────────────────────────────

  fastify.get('/api/v1/cmdb/duplicates', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const query = request.query as { reviewStatus?: string; page?: string; pageSize?: string };
    const result = await listDuplicateCandidates(user.tenantId,
      { reviewStatus: query.reviewStatus },
      query.page ? parseInt(query.page, 10) : undefined,
      query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    );
    return reply.send(result);
  });

  fastify.put('/api/v1/cmdb/duplicates/:id', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as { reviewStatus?: string };
    if (!body.reviewStatus) return reply.status(400).send({ error: 'reviewStatus is required' });
    try {
      const result = await reviewDuplicateCandidate(user.tenantId, id, {
        reviewStatus: body.reviewStatus,
        reviewedById: user.userId,
      });
      return reply.send(result);
    } catch (err) { return reply.status(500).send({ error: (err as Error).message }); }
  });

  // ─── Reports ───────────────────────────────────────────────────────────────

  fastify.get('/api/v1/cmdb/reports/health', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const result = await getHealthReport(user.tenantId);
    return reply.send(result);
  });

  fastify.get('/api/v1/cmdb/reports/stale', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const query = request.query as { page?: string; pageSize?: string };
    const result = await getStaleReport(user.tenantId,
      query.page ? parseInt(query.page, 10) : undefined,
      query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    );
    return reply.send(result);
  });

  fastify.get('/api/v1/cmdb/reports/orphaned', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const query = request.query as { page?: string; pageSize?: string };
    const result = await getOrphanedReport(user.tenantId,
      query.page ? parseInt(query.page, 10) : undefined,
      query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    );
    return reply.send(result);
  });

  fastify.get('/api/v1/cmdb/reports/missing-data', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const query = request.query as { page?: string; pageSize?: string };
    const result = await getMissingDataReport(user.tenantId,
      query.page ? parseInt(query.page, 10) : undefined,
      query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    );
    return reply.send(result);
  });
}
