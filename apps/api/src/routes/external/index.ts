import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import {
  createTicket,
  getTicketList,
  getTicketDetail,
  updateTicket,
} from '../../services/ticket.service.js';
import { dispatchWebhooks } from '../../services/webhook.service.js';

/**
 * External API routes — API key authenticated scope.
 *
 * All routes require a valid ApiKey with appropriate scopes.
 * Scope is checked per-endpoint: 403 returned if scope is missing.
 * All queries are scoped to the tenantId resolved from the API key.
 *
 * GET    /api/external/status           — Health check (no scope required)
 * GET    /api/external/tickets          — List tickets (tickets.read)
 * GET    /api/external/tickets/:id      — Get ticket detail (tickets.read)
 * POST   /api/external/tickets          — Create ticket (tickets.write)
 * PATCH  /api/external/tickets/:id      — Update ticket (tickets.write)
 * GET    /api/external/assets           — List assets (assets.read)
 * GET    /api/external/cis              — List CIs (ci.read)
 */
export async function externalRoutes(app: FastifyInstance): Promise<void> {
  // ─── GET /api/external/status ─────────────────────────────────────────────

  app.get('/api/external/status', async () => ({
    status: 'ok',
    scope: 'external',
  }));

  // ─── GET /api/external/tickets ────────────────────────────────────────────

  app.get('/api/external/tickets', async (request, reply) => {
    const apiKey = request.apiKey as { scopes: string[]; tenantId: string } | undefined;
    if (!apiKey?.scopes.includes('tickets.read')) {
      return reply.code(403).send({ error: 'Scope tickets.read required' });
    }

    const tenantId = request.tenantId as string;
    const query = request.query as {
      status?: string;
      priority?: string;
      page?: string;
      pageSize?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '25', 10) || 25));

    const result = await getTicketList(tenantId, {
      status: query.status,
      priority: query.priority,
      page,
      pageSize,
    });

    return reply.send({ ...result, page, pageSize });
  });

  // ─── GET /api/external/tickets/:id ───────────────────────────────────────

  app.get('/api/external/tickets/:id', async (request, reply) => {
    const apiKey = request.apiKey as { scopes: string[]; tenantId: string } | undefined;
    if (!apiKey?.scopes.includes('tickets.read')) {
      return reply.code(403).send({ error: 'Scope tickets.read required' });
    }

    const tenantId = request.tenantId as string;
    const { id } = request.params as { id: string };

    const ticket = await getTicketDetail(tenantId, id);
    if (!ticket) {
      return reply.code(404).send({ error: 'Ticket not found' });
    }

    // Filter comments to public only for external API consumers
    const publicComments = (ticket as { comments?: Array<{ visibility?: string }> }).comments?.filter(
      (c) => c.visibility !== 'INTERNAL',
    );

    return reply.send({ ...ticket, comments: publicComments });
  });

  // ─── POST /api/external/tickets ───────────────────────────────────────────

  app.post('/api/external/tickets', async (request, reply) => {
    const apiKey = request.apiKey as { scopes: string[]; tenantId: string } | undefined;
    if (!apiKey?.scopes.includes('tickets.write')) {
      return reply.code(403).send({ error: 'Scope tickets.write required' });
    }

    const tenantId = request.tenantId as string;
    const body = request.body as {
      title?: unknown;
      description?: unknown;
      type?: unknown;
      priority?: unknown;
      categoryId?: unknown;
    };

    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return reply.code(400).send({ error: 'title is required' });
    }

    // actorId is a sentinel value for API key-created tickets (no user session)
    const API_KEY_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

    const ticket = await createTicket(
      tenantId,
      {
        title: body.title.trim(),
        description: typeof body.description === 'string' ? body.description : undefined,
        type: body.type as 'INCIDENT' | 'SERVICE_REQUEST' | 'PROBLEM' | undefined,
        priority: body.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
        categoryId: typeof body.categoryId === 'string' ? body.categoryId : undefined,
        requestedById: undefined,
      },
      API_KEY_ACTOR_ID,
    );

    // Fire webhook for external ticket creation
    void dispatchWebhooks(tenantId, 'TICKET_CREATED', {
      ticketId: (ticket as { id: string }).id,
      ticketNumber: (ticket as { ticketNumber: number }).ticketNumber,
      title: body.title.trim(),
      source: 'api',
    });

    return reply.code(201).send(ticket);
  });

  // ─── PATCH /api/external/tickets/:id ─────────────────────────────────────

  app.patch('/api/external/tickets/:id', async (request, reply) => {
    const apiKey = request.apiKey as { scopes: string[]; tenantId: string } | undefined;
    if (!apiKey?.scopes.includes('tickets.write')) {
      return reply.code(403).send({ error: 'Scope tickets.write required' });
    }

    const tenantId = request.tenantId as string;
    const { id } = request.params as { id: string };
    const body = request.body as {
      title?: unknown;
      description?: unknown;
      status?: unknown;
      priority?: unknown;
      assignedToId?: unknown;
    };

    const API_KEY_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

    try {
      const ticket = await updateTicket(
        tenantId,
        id,
        {
          title: typeof body.title === 'string' ? body.title : undefined,
          description: typeof body.description === 'string' ? body.description : undefined,
          status: typeof body.status === 'string' ? body.status : undefined,
          priority: typeof body.priority === 'string' ? body.priority : undefined,
          assignedToId: typeof body.assignedToId === 'string' ? body.assignedToId : undefined,
        },
        API_KEY_ACTOR_ID,
      );

      return reply.send(ticket);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        return reply.code(404).send({ error: 'Ticket not found' });
      }
      throw err;
    }
  });

  // ─── GET /api/external/assets ─────────────────────────────────────────────

  app.get('/api/external/assets', async (request, reply) => {
    const apiKey = request.apiKey as { scopes: string[]; tenantId: string } | undefined;
    if (!apiKey?.scopes.includes('assets.read')) {
      return reply.code(403).send({ error: 'Scope assets.read required' });
    }

    const tenantId = request.tenantId as string;
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '25', 10) || 25));
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      prisma.asset.findMany({
        where: { tenantId },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tenantId: true,
          assetTag: true,
          hostname: true,
          status: true,
          manufacturer: true,
          model: true,
          serialNumber: true,
          assignedToId: true,
          siteId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.asset.count({ where: { tenantId } }),
    ]);

    return reply.send({ data, total, page, pageSize });
  });

  // ─── GET /api/external/cis ────────────────────────────────────────────────

  app.get('/api/external/cis', async (request, reply) => {
    const apiKey = request.apiKey as { scopes: string[]; tenantId: string } | undefined;
    if (!apiKey?.scopes.includes('ci.read')) {
      return reply.code(403).send({ error: 'Scope ci.read required' });
    }

    const tenantId = request.tenantId as string;
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '25', 10) || 25));
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      prisma.cmdbConfigurationItem.findMany({
        where: { tenantId },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tenantId: true,
          ciNumber: true,
          name: true,
          type: true,
          status: true,
          environment: true,
          agentId: true,
          discoveredAt: true,
          lastSeenAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.cmdbConfigurationItem.count({ where: { tenantId } }),
    ]);

    return reply.send({ data, total, page, pageSize });
  });
}
