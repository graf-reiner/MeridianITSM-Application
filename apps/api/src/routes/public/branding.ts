import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { getFileObject } from '../../services/storage.service.js';

/**
 * Public branding routes — no authentication required.
 *
 *   GET /api/v1/public/branding/by-subdomain/:subdomain  - Stream tenant logo
 *
 * The login page is unauthenticated but needs the tenant logo to display
 * before the user signs in. We resolve subdomain → tenant → settings.logoUrl
 * (storage key) → MinIO bytes and stream them through the API. 404 when no
 * logo is configured so the client can fall back to the default brand.
 */
export async function publicBrandingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/v1/public/branding/by-subdomain/:subdomain',
    async (request, reply) => {
      const { subdomain } = request.params as { subdomain: string };

      const tenant = await prisma.tenant.findFirst({
        where: { subdomain, status: 'ACTIVE' },
        select: { id: true, settings: true },
      });
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      const settings = (tenant.settings as Record<string, unknown> | null) ?? {};
      const storageKey = typeof settings.logoUrl === 'string' ? settings.logoUrl : null;
      if (!storageKey) {
        return reply.status(404).send({ error: 'No logo configured' });
      }

      // Defence-in-depth: refuse to serve a key that isn't scoped to this
      // tenant, even though settings.logoUrl was written by an authenticated
      // upload route. Cheap belt-and-braces.
      if (!storageKey.startsWith(`${tenant.id}/`)) {
        return reply.status(403).send({ error: 'Logo storage key does not belong to this tenant' });
      }

      try {
        const file = await getFileObject(storageKey);
        const contentType = file.contentType ?? 'application/octet-stream';
        // Cache briefly at edge / browser; bust via ?v= query string after upload.
        reply
          .header('Content-Type', contentType)
          .header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        if (file.contentLength) reply.header('Content-Length', String(file.contentLength));
        return reply.send(file.body);
      } catch (err) {
        request.log.warn({ err, storageKey }, '[public-branding] failed to stream logo');
        return reply.status(404).send({ error: 'Logo unavailable' });
      }
    },
  );
}
