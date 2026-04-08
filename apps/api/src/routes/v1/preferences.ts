import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

export async function preferencesRoutes(fastify: FastifyInstance): Promise<void> {
  // PATCH /api/v1/preferences — update current user's preferences
  fastify.patch('/preferences', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const body = request.body as { themePreference?: string; dashboardConfig?: unknown };

    const updates: Record<string, unknown> = {};

    if (body.themePreference) {
      if (!['light', 'dark', 'system'].includes(body.themePreference)) {
        return reply.status(400).send({ error: 'themePreference must be light, dark, or system' });
      }
      updates.themePreference = body.themePreference;
    }

    if (body.dashboardConfig !== undefined) {
      updates.dashboardConfig = body.dashboardConfig as any;
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'No valid fields to update' });
    }

    const updated = await prisma.user.update({
      where: { id: user.userId, tenantId: user.tenantId },
      data: updates as any,
      select: { themePreference: true, dashboardConfig: true },
    });

    return reply.send(updated);
  });

  // GET /api/v1/preferences — get current user's preferences
  fastify.get('/preferences', async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };

    const prefs = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { themePreference: true, notificationPreferences: true, dashboardConfig: true },
    });

    return reply.send(prefs);
  });
}
