import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../../plugins/rbac.js';
import {
  listCiClasses, createCiClass, updateCiClass, deleteCiClass,
  listStatuses, createStatus, updateStatus, deleteStatus,
  listEnvironments, createEnvironment, updateEnvironment, deleteEnvironment,
  listRelationshipTypes, createRelationshipType, updateRelationshipType, deleteRelationshipType,
  listVendors, createVendor, updateVendor, deleteVendor,
} from '../../../services/cmdb-reference.service.js';

/**
 * CMDB Reference Data CRUD routes.
 */
export async function cmdbReferenceRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── CI Classes ────────────────────────────────────────────────────────────

  fastify.get('/api/v1/cmdb/classes', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const result = await listCiClasses(user.tenantId);
    return reply.send(result);
  });

  fastify.post('/api/v1/cmdb/classes', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const body = request.body as Record<string, unknown>;
    if (!body.classKey || !body.className) return reply.status(400).send({ error: 'classKey and className are required' });
    try {
      const result = await createCiClass(user.tenantId, body as never);
      return reply.status(201).send(result);
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  fastify.put('/api/v1/cmdb/classes/:id', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    try {
      const result = await updateCiClass(user.tenantId, id, body as never);
      if (!result) return reply.status(404).send({ error: 'Not found' });
      return reply.send(result);
    } catch (err) { return reply.status(500).send({ error: (err as Error).message }); }
  });

  fastify.delete('/api/v1/cmdb/classes/:id', { preHandler: [requirePermission('cmdb.delete')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    try {
      await deleteCiClass(user.tenantId, id);
      return reply.status(204).send();
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  // ─── Statuses ──────────────────────────────────────────────────────────────

  fastify.get('/api/v1/cmdb/statuses', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const query = request.query as { statusType?: string };
    const result = await listStatuses(user.tenantId, query.statusType);
    return reply.send(result);
  });

  fastify.post('/api/v1/cmdb/statuses', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const body = request.body as Record<string, unknown>;
    if (!body.statusType || !body.statusKey || !body.statusName) return reply.status(400).send({ error: 'statusType, statusKey, and statusName are required' });
    try {
      const result = await createStatus(user.tenantId, body as never);
      return reply.status(201).send(result);
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  fastify.put('/api/v1/cmdb/statuses/:id', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    try {
      const result = await updateStatus(user.tenantId, id, body as never);
      if (!result) return reply.status(404).send({ error: 'Not found' });
      return reply.send(result);
    } catch (err) { return reply.status(500).send({ error: (err as Error).message }); }
  });

  fastify.delete('/api/v1/cmdb/statuses/:id', { preHandler: [requirePermission('cmdb.delete')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    try {
      await deleteStatus(user.tenantId, id);
      return reply.status(204).send();
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  // ─── Environments ──────────────────────────────────────────────────────────

  fastify.get('/api/v1/cmdb/environments', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const result = await listEnvironments(user.tenantId);
    return reply.send(result);
  });

  fastify.post('/api/v1/cmdb/environments', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const body = request.body as Record<string, unknown>;
    if (!body.envKey || !body.envName) return reply.status(400).send({ error: 'envKey and envName are required' });
    try {
      const result = await createEnvironment(user.tenantId, body as never);
      return reply.status(201).send(result);
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  fastify.put('/api/v1/cmdb/environments/:id', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    try {
      const result = await updateEnvironment(user.tenantId, id, body as never);
      if (!result) return reply.status(404).send({ error: 'Not found' });
      return reply.send(result);
    } catch (err) { return reply.status(500).send({ error: (err as Error).message }); }
  });

  fastify.delete('/api/v1/cmdb/environments/:id', { preHandler: [requirePermission('cmdb.delete')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    try {
      await deleteEnvironment(user.tenantId, id);
      return reply.status(204).send();
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  // ─── Relationship Types ────────────────────────────────────────────────────

  fastify.get('/api/v1/cmdb/relationship-types', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const result = await listRelationshipTypes(user.tenantId);
    return reply.send(result);
  });

  fastify.post('/api/v1/cmdb/relationship-types', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const body = request.body as Record<string, unknown>;
    if (!body.relationshipKey || !body.relationshipName || !body.forwardLabel || !body.reverseLabel) {
      return reply.status(400).send({ error: 'relationshipKey, relationshipName, forwardLabel, and reverseLabel are required' });
    }
    try {
      const result = await createRelationshipType(user.tenantId, body as never);
      return reply.status(201).send(result);
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  fastify.put('/api/v1/cmdb/relationship-types/:id', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    try {
      const result = await updateRelationshipType(user.tenantId, id, body as never);
      if (!result) return reply.status(404).send({ error: 'Not found' });
      return reply.send(result);
    } catch (err) { return reply.status(500).send({ error: (err as Error).message }); }
  });

  fastify.delete('/api/v1/cmdb/relationship-types/:id', { preHandler: [requirePermission('cmdb.delete')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    try {
      await deleteRelationshipType(user.tenantId, id);
      return reply.status(204).send();
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  // ─── Vendors ───────────────────────────────────────────────────────────────

  fastify.get('/api/v1/cmdb/vendors', { preHandler: [requirePermission('cmdb.view')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const result = await listVendors(user.tenantId);
    return reply.send(result);
  });

  fastify.post('/api/v1/cmdb/vendors', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const body = request.body as Record<string, unknown>;
    if (!body.name) return reply.status(400).send({ error: 'name is required' });
    try {
      const result = await createVendor(user.tenantId, body as never);
      return reply.status(201).send(result);
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });

  fastify.put('/api/v1/cmdb/vendors/:id', { preHandler: [requirePermission('cmdb.edit')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    try {
      const result = await updateVendor(user.tenantId, id, body as never);
      if (!result) return reply.status(404).send({ error: 'Not found' });
      return reply.send(result);
    } catch (err) { return reply.status(500).send({ error: (err as Error).message }); }
  });

  fastify.delete('/api/v1/cmdb/vendors/:id', { preHandler: [requirePermission('cmdb.delete')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    try {
      await deleteVendor(user.tenantId, id);
      return reply.status(204).send();
    } catch (err) { return reply.status(409).send({ error: (err as Error).message }); }
  });
}
