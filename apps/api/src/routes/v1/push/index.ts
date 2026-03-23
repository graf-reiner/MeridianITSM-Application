import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Push Notification Device Token Routes (PUSH-02)
 *
 * JWT-protected routes for registering/unregistering mobile device tokens.
 * Device tokens are upserted by userId+deviceId — a device can only have one
 * active token per user (supports token rotation on app reinstall).
 *
 * POST   /api/v1/push/register    — Register/update device token
 * DELETE /api/v1/push/unregister  — Deactivate device token
 */
export async function pushRoutes(app: FastifyInstance): Promise<void> {
  // ─── POST /api/v1/push/register ───────────────────────────────────────────────

  app.post('/api/v1/push/register', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId, userId } = user;

    const body = request.body as {
      token?: string;
      platform?: string;
      deviceId?: string;
    };

    const { token, platform, deviceId } = body;

    if (!token || !platform || !deviceId) {
      return reply.code(400).send({ error: 'token, platform, and deviceId are required' });
    }

    const validPlatforms = ['IOS', 'ANDROID'] as const;
    const platformUpper = platform.toUpperCase() as (typeof validPlatforms)[number];
    if (!validPlatforms.includes(platformUpper)) {
      return reply.code(400).send({
        error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
      });
    }

    // Upsert by userId+deviceId — supports token rotation when app reinstalls
    await prisma.deviceToken.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: {
        tenantId,
        userId,
        platform: platformUpper,
        token,
        deviceId,
        isActive: true,
      },
      update: {
        token,
        platform: platformUpper,
        isActive: true,
      },
    });

    return reply.send({ ok: true });
  });

  // ─── DELETE /api/v1/push/unregister ───────────────────────────────────────────

  app.delete('/api/v1/push/unregister', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { userId } = user;

    const body = request.body as {
      deviceId?: string;
    };

    const { deviceId } = body;

    if (!deviceId) {
      return reply.code(400).send({ error: 'deviceId is required' });
    }

    // Soft-deactivate rather than delete — preserves audit trail
    await prisma.deviceToken.updateMany({
      where: { userId, deviceId },
      data: { isActive: false },
    });

    return reply.send({ ok: true });
  });

  // ─── GET /api/v1/push/preferences ─────────────────────────────────────────────
  // Returns user's push preferences. null means all notification types are enabled.
  // { "TICKET_ASSIGNED": false, ... } means that specific type is disabled.

  app.get('/api/v1/push/preferences', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId, userId } = user;

    const record = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { pushPreferences: true },
    });

    return reply.send({ preferences: record?.pushPreferences ?? null });
  });

  // ─── PATCH /api/v1/push/preferences ───────────────────────────────────────────
  // Updates user's push preferences. Accepts partial map of type -> enabled boolean.
  // e.g. { preferences: { "TICKET_ASSIGNED": true, "SLA_WARNING": false } }

  app.patch('/api/v1/push/preferences', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId, userId } = user;

    const body = request.body as {
      preferences?: Record<string, boolean>;
    };

    if (!body.preferences || typeof body.preferences !== 'object') {
      return reply.code(400).send({ error: 'preferences must be an object' });
    }

    const updated = await prisma.user.updateMany({
      where: { id: userId, tenantId },
      data: { pushPreferences: body.preferences as never },
    });

    if (updated.count === 0) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return reply.send({ preferences: body.preferences });
  });
}
