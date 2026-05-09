import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';
import { uploadFile, getFileSignedUrl } from '../../../services/storage.service.js';

/**
 * Settings: Branding Routes (SETT-11)
 *
 * GET   /api/v1/settings/branding        — Get tenant branding settings
 * PATCH /api/v1/settings/branding        — Update branding settings
 * POST  /api/v1/settings/branding/logo   — Upload logo image (multipart)
 */
export async function brandingSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // Scoped multipart registration for the logo upload route. Mirrors the
  // pattern in tickets/index.ts — keeps JSON routes globally untouched and
  // avoids "Content type parser already present" conflicts when other
  // plugins also need multipart.
  await fastify.register(multipart, {
    limits: {
      fileSize: 2 * 1024 * 1024, // 2 MB matches the per-route validation
      files: 1,
    },
  });

  // GET /api/v1/settings/branding — Return tenant.settings branding JSON
  fastify.get(
    '/api/v1/settings/branding',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, settings: true },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      const settings = (tenant.settings as Record<string, unknown>) ?? {};

      return reply.status(200).send({
        companyName: settings.companyName ?? tenant.name,
        logoUrl: settings.logoUrl ?? null,
        primaryColor: settings.primaryColor ?? null,
        accentColor: settings.accentColor ?? null,
      });
    },
  );

  // PATCH /api/v1/settings/branding — Update branding settings
  fastify.patch(
    '/api/v1/settings/branding',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;
      const body = request.body as {
        logoUrl?: string;
        primaryColor?: string;
        accentColor?: string;
        companyName?: string;
      };

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      const currentSettings = (tenant.settings as Record<string, unknown>) ?? {};
      const updatedSettings: Record<string, unknown> = { ...currentSettings };

      if (body.logoUrl !== undefined) updatedSettings.logoUrl = body.logoUrl;
      if (body.primaryColor !== undefined) updatedSettings.primaryColor = body.primaryColor;
      if (body.accentColor !== undefined) updatedSettings.accentColor = body.accentColor;
      if (body.companyName !== undefined) updatedSettings.companyName = body.companyName;

      await prisma.tenant.update({
        where: { id: tenantId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { settings: updatedSettings as any },
      });

      return reply.status(200).send(updatedSettings);
    },
  );

  // POST /api/v1/settings/branding/logo — Upload logo image via multipart
  fastify.post(
    '/api/v1/settings/branding/logo',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const currentUser = request.user as { tenantId: string };
      const tenantId = currentUser.tenantId;

      // Read file via @fastify/multipart (scoped to this request)
      let fileData: Buffer | null = null;
      let contentType = 'image/png';
      let ext = 'png';

      try {
        const data = await request.file();
        if (!data) {
          return reply.status(400).send({ error: 'No file uploaded' });
        }

        // Validate MIME type
        const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (!allowedTypes.includes(data.mimetype)) {
          return reply.status(400).send({
            error: 'Invalid file type. Allowed: PNG, JPEG, GIF, WebP, SVG',
          });
        }

        contentType = data.mimetype;
        ext = contentType.split('/')[1] ?? 'png';
        if (ext === 'svg+xml') ext = 'svg';

        const chunks: Buffer[] = [];
        let totalSize = 0;
        const maxSize = 2 * 1024 * 1024; // 2MB

        for await (const chunk of data.file) {
          totalSize += chunk.length;
          if (totalSize > maxSize) {
            return reply.status(413).send({ error: 'File too large. Maximum size is 2MB.' });
          }
          chunks.push(chunk);
        }

        fileData = Buffer.concat(chunks);
      } catch {
        return reply.status(400).send({ error: 'Failed to process file upload' });
      }

      if (!fileData || fileData.length === 0) {
        return reply.status(400).send({ error: 'No file data received' });
      }

      // Store in MinIO under tenant-scoped path
      const storageKey = `${tenantId}/branding/logo-${Date.now()}.${ext}`;
      await uploadFile(fileData, storageKey, contentType);

      // Generate signed URL for immediate use
      const signedUrl = await getFileSignedUrl(storageKey, 3600);

      // Update tenant settings with new logo storage key
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });

      const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {};
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          settings: {
            ...currentSettings,
            logoUrl: storageKey,
          },
        },
      });

      return reply.status(200).send({
        storageKey,
        signedUrl,
        message: 'Logo uploaded successfully',
      });
    },
  );
}
