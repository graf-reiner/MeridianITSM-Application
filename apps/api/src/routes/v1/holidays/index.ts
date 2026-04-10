import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../../plugins/rbac.js';
import { prisma } from '@meridian/db';
import { getHolidaySeed, listHolidaySeedCountries } from '../../../services/holiday-seed.js';

/**
 * Holiday calendar REST API routes (ITIL Gap 8).
 *
 * GET    /api/v1/holidays                — List tenant holidays (sorted by date)
 * POST   /api/v1/holidays                — Create a single holiday
 * PATCH  /api/v1/holidays/:id            — Update name/recurring (date is immutable)
 * DELETE /api/v1/holidays/:id            — Delete a holiday
 * GET    /api/v1/holidays/seed           — List available country seed packs
 * POST   /api/v1/holidays/seed           — Bulk-import a country seed pack
 *
 * Holidays are consumed by sla.service business-hours calculation —
 * see ticket.service.ts loadTenantHolidays() for the read path.
 */
export async function holidayRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /api/v1/holidays — List tenant holidays ────────────────────────────

  fastify.get(
    '/api/v1/holidays',
    { preHandler: [requirePermission('settings.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const holidays = await prisma.holiday.findMany({
        where: { tenantId },
        orderBy: [{ date: 'asc' }],
      });

      return reply.status(200).send(holidays);
    },
  );

  // ─── POST /api/v1/holidays — Create a holiday ───────────────────────────────

  fastify.post(
    '/api/v1/holidays',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const body = request.body as { date?: string; name?: string; recurring?: boolean };

      if (!body.date || typeof body.date !== 'string') {
        return reply.status(400).send({ error: 'date is required (YYYY-MM-DD)' });
      }
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return reply.status(400).send({ error: 'name is required and must be a non-empty string' });
      }

      const parsed = parseDateOnly(body.date);
      if (!parsed) {
        return reply.status(400).send({ error: 'date must be a valid YYYY-MM-DD string' });
      }

      try {
        const created = await prisma.holiday.create({
          data: {
            tenantId,
            date: parsed,
            name: body.name.trim(),
            recurring: body.recurring === true,
          },
        });
        return reply.status(201).send(created);
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('Unique constraint')) {
          return reply.status(409).send({ error: 'A holiday already exists for this date' });
        }
        throw err;
      }
    },
  );

  // ─── PATCH /api/v1/holidays/:id — Update a holiday ──────────────────────────

  fastify.patch(
    '/api/v1/holidays/:id',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as { name?: string; recurring?: boolean };

      const existing = await prisma.holiday.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Holiday not found' });
      }

      const updated = await prisma.holiday.update({
        where: { id },
        data: {
          ...(typeof body.name === 'string' && body.name.trim().length > 0
            ? { name: body.name.trim() }
            : {}),
          ...(typeof body.recurring === 'boolean' ? { recurring: body.recurring } : {}),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // ─── DELETE /api/v1/holidays/:id — Delete a holiday ─────────────────────────

  fastify.delete(
    '/api/v1/holidays/:id',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const existing = await prisma.holiday.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.status(404).send({ error: 'Holiday not found' });
      }

      await prisma.holiday.delete({ where: { id } });
      return reply.status(204).send();
    },
  );

  // ─── GET /api/v1/holidays/seed — List available seed countries ──────────────

  fastify.get(
    '/api/v1/holidays/seed',
    { preHandler: [requirePermission('settings.read')] },
    async (_request, reply) => {
      return reply.status(200).send(listHolidaySeedCountries());
    },
  );

  // ─── POST /api/v1/holidays/seed — Bulk-import a country seed pack ───────────

  fastify.post(
    '/api/v1/holidays/seed',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const body = request.body as { country?: string; year?: number };

      if (!body.country || typeof body.country !== 'string') {
        return reply.status(400).send({ error: 'country is required (e.g. "US", "UK", "DE")' });
      }

      const seed = getHolidaySeed(body.country, body.year);
      if (!seed) {
        return reply.status(404).send({ error: `No seed pack available for country "${body.country}"` });
      }

      let inserted = 0;
      let skipped = 0;
      for (const entry of seed) {
        const parsed = parseDateOnly(entry.date);
        if (!parsed) {
          skipped++;
          continue;
        }
        try {
          await prisma.holiday.create({
            data: {
              tenantId,
              date: parsed,
              name: entry.name,
              recurring: entry.recurring,
            },
          });
          inserted++;
        } catch (err) {
          if ((err as Error).message.includes('Unique constraint')) {
            skipped++;
            continue;
          }
          throw err;
        }
      }

      return reply.status(200).send({ inserted, skipped, total: seed.length });
    },
  );
}

/**
 * Parses a YYYY-MM-DD string into a UTC midnight Date.
 * Returns null if the string is malformed or the calendar date is invalid.
 */
function parseDateOnly(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d;
}
