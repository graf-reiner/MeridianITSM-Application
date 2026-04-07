import type { FastifyInstance } from 'fastify';
import { redis } from '../../../lib/redis.js';

/**
 * Agent Presence / Collision Detection for tickets.
 *
 * Uses Redis sorted sets with TTL-based expiry. Agents send heartbeats
 * while viewing a ticket; other agents can check who else is present.
 *
 * POST /api/v1/tickets/:id/presence/heartbeat — Report that I'm viewing this ticket
 * GET  /api/v1/tickets/:id/presence           — Get list of agents currently viewing
 * DELETE /api/v1/tickets/:id/presence         — Leave (stop viewing)
 */

const PRESENCE_KEY_PREFIX = 'ticket-presence:';
const HEARTBEAT_TTL_SECONDS = 30; // Presence expires after 30s without heartbeat

function presenceKey(ticketId: string): string {
  return `${PRESENCE_KEY_PREFIX}${ticketId}`;
}

export async function ticketPresenceRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── POST heartbeat — I'm viewing this ticket ─────────────────────────────

  fastify.post('/api/v1/tickets/:id/presence/heartbeat', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };

    const key = presenceKey(id);
    const now = Date.now();

    // Store user presence with current timestamp as score
    const memberData = JSON.stringify({
      userId: user.userId,
      tenantId: user.tenantId,
    });

    await redis.zadd(key, now, memberData);

    // Set key expiry so orphaned keys get cleaned up
    await redis.expire(key, HEARTBEAT_TTL_SECONDS * 3);

    return reply.status(200).send({ ok: true });
  });

  // ─── GET presence — Who else is viewing? ──────────────────────────────────

  fastify.get('/api/v1/tickets/:id/presence', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };

    const key = presenceKey(id);
    const now = Date.now();
    const cutoff = now - HEARTBEAT_TTL_SECONDS * 1000;

    // Remove stale entries
    await redis.zremrangebyscore(key, 0, cutoff);

    // Get all active members
    const members = await redis.zrangebyscore(key, cutoff, '+inf');

    const agents: Array<{ userId: string }> = [];
    for (const member of members) {
      try {
        const data = JSON.parse(member) as { userId: string; tenantId: string };
        // Only return agents from same tenant, exclude self
        if (data.tenantId === user.tenantId && data.userId !== user.userId) {
          agents.push({ userId: data.userId });
        }
      } catch {
        // Invalid entry — skip
      }
    }

    return reply.status(200).send({ agents });
  });

  // ─── DELETE presence — Stop viewing ───────────────────────────────────────

  fastify.delete('/api/v1/tickets/:id/presence', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const { id } = request.params as { id: string };

    const key = presenceKey(id);
    const memberData = JSON.stringify({
      userId: user.userId,
      tenantId: user.tenantId,
    });

    await redis.zrem(key, memberData);

    return reply.status(204).send();
  });
}
