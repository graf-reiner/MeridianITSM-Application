import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';
import { encrypt, decrypt } from '../../../lib/encryption.js';

/**
 * Settings: AI Assistant Routes
 *
 * GET   /api/v1/settings/ai  — Get AI configuration (masked key + model)
 * PATCH /api/v1/settings/ai  — Update AI configuration (API key, model)
 */
export async function aiSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/ai — Return AI settings (key is masked)
  fastify.get(
    '/api/v1/settings/ai',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const { tenantId } = request.user as { tenantId: string };

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      const settings = (tenant.settings as Record<string, unknown>) ?? {};
      const encryptedKey = settings.openaiApiKey as string | undefined;

      // Mask the key — show only last 4 characters
      let maskedKey: string | null = null;
      if (encryptedKey) {
        try {
          const fullKey = decrypt(encryptedKey);
          maskedKey = '••••••••' + fullKey.slice(-4);
        } catch {
          maskedKey = null; // corrupted key
        }
      }

      return reply.status(200).send({
        apiKeyConfigured: !!maskedKey,
        apiKeyMasked: maskedKey,
        model: (settings.openaiModel as string) || 'gpt-4o-mini',
      });
    },
  );

  // PATCH /api/v1/settings/ai — Update AI configuration
  fastify.patch(
    '/api/v1/settings/ai',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const { tenantId } = request.user as { tenantId: string };
      const body = request.body as {
        apiKey?: string;
        model?: string;
        removeKey?: boolean;
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

      // Update or remove API key
      if (body.removeKey) {
        delete updatedSettings.openaiApiKey;
      } else if (body.apiKey && typeof body.apiKey === 'string') {
        const trimmed = body.apiKey.trim();
        if (!trimmed.startsWith('sk-')) {
          return reply.status(400).send({ error: 'Invalid API key format. Must start with sk-' });
        }
        updatedSettings.openaiApiKey = encrypt(trimmed);
      }

      // Update model preference
      if (body.model && typeof body.model === 'string') {
        const allowed = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
        if (!allowed.includes(body.model)) {
          return reply.status(400).send({ error: `Invalid model. Allowed: ${allowed.join(', ')}` });
        }
        updatedSettings.openaiModel = body.model;
      }

      await prisma.tenant.update({
        where: { id: tenantId },
        data: { settings: updatedSettings as object },
      });

      // Return updated state (masked)
      const encryptedKey = updatedSettings.openaiApiKey as string | undefined;
      let maskedKey: string | null = null;
      if (encryptedKey) {
        try {
          const fullKey = decrypt(encryptedKey);
          maskedKey = '••••••••' + fullKey.slice(-4);
        } catch {
          maskedKey = null;
        }
      }

      return reply.status(200).send({
        apiKeyConfigured: !!maskedKey,
        apiKeyMasked: maskedKey,
        model: (updatedSettings.openaiModel as string) || 'gpt-4o-mini',
      });
    },
  );
}
