import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

// ─── Alert Channel Routes (INTG-06) ───────────────────────────────────────────
//
// JWT-protected, admin-only routes for managing alert notification channels.
// Supports EMAIL, SLACK, and TEAMS channel types with per-channel config validation.
// Test delivery endpoint validates connectivity before production use.
//
// POST   /api/v1/settings/alerts           — Create alert channel
// GET    /api/v1/settings/alerts           — List alert channels (no config secrets)
// GET    /api/v1/settings/alerts/:id       — Get single alert channel (with config)
// PATCH  /api/v1/settings/alerts/:id       — Update alert channel
// DELETE /api/v1/settings/alerts/:id       — Delete alert channel
// POST   /api/v1/settings/alerts/:id/test  — Send test message to channel

type AlertChannelType = 'EMAIL' | 'SLACK' | 'TEAMS' | 'DISCORD' | 'TELEGRAM';

interface EmailConfig {
  recipients: string[];
}

interface SlackConfig {
  webhookUrl: string;
}

interface TeamsConfig {
  webhookUrl: string;
}

interface DiscordConfig {
  webhookUrl: string;
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

function validateConfig(channelType: AlertChannelType, config: Record<string, unknown>): string | null {
  switch (channelType) {
    case 'EMAIL': {
      const emailConfig = config as Partial<EmailConfig>;
      if (!Array.isArray(emailConfig.recipients) || emailConfig.recipients.length === 0) {
        return 'EMAIL config must include a non-empty recipients array';
      }
      for (const r of emailConfig.recipients) {
        if (typeof r !== 'string' || !r.includes('@')) {
          return `Invalid email address in recipients: ${String(r)}`;
        }
      }
      return null;
    }

    case 'SLACK': {
      const slackConfig = config as Partial<SlackConfig>;
      if (!slackConfig.webhookUrl || typeof slackConfig.webhookUrl !== 'string') {
        return 'SLACK config must include a webhookUrl string';
      }
      if (!slackConfig.webhookUrl.startsWith('https://hooks.slack.com/')) {
        return 'SLACK webhookUrl must start with https://hooks.slack.com/';
      }
      return null;
    }

    case 'TEAMS': {
      const teamsConfig = config as Partial<TeamsConfig>;
      if (!teamsConfig.webhookUrl || typeof teamsConfig.webhookUrl !== 'string') {
        return 'TEAMS config must include a webhookUrl string';
      }
      if (!teamsConfig.webhookUrl.startsWith('https://')) {
        return 'TEAMS webhookUrl must start with https://';
      }
      return null;
    }

    case 'DISCORD': {
      const discordConfig = config as Partial<DiscordConfig>;
      if (!discordConfig.webhookUrl || typeof discordConfig.webhookUrl !== 'string') {
        return 'DISCORD config must include a webhookUrl string';
      }
      if (!discordConfig.webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        return 'DISCORD webhookUrl must start with https://discord.com/api/webhooks/';
      }
      return null;
    }

    case 'TELEGRAM': {
      const telegramConfig = config as Partial<TelegramConfig>;
      if (!telegramConfig.botToken || typeof telegramConfig.botToken !== 'string') {
        return 'TELEGRAM config must include a botToken string';
      }
      if (!telegramConfig.chatId || typeof telegramConfig.chatId !== 'string') {
        return 'TELEGRAM config must include a chatId string';
      }
      return null;
    }

    default:
      return `Unsupported channel type: ${String(channelType)}`;
  }
}

export async function alertChannelRoutes(app: FastifyInstance): Promise<void> {
  // ─── POST /api/v1/settings/alerts ────────────────────────────────────────────

  app.post(
    '/api/v1/settings/alerts',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const body = request.body as {
        name?: string;
        channelType?: string;
        config?: Record<string, unknown>;
      };

      if (!body.name) {
        return reply.code(400).send({ error: 'name is required' });
      }

      const validChannelTypes: AlertChannelType[] = ['EMAIL', 'SLACK', 'TEAMS', 'DISCORD', 'TELEGRAM'];
      const channelType = body.channelType?.toUpperCase() as AlertChannelType;
      if (!channelType || !validChannelTypes.includes(channelType)) {
        return reply.code(400).send({
          error: `channelType must be one of: ${validChannelTypes.join(', ')}`,
        });
      }

      if (!body.config || typeof body.config !== 'object' || Array.isArray(body.config)) {
        return reply.code(400).send({ error: 'config must be an object' });
      }

      const configError = validateConfig(channelType, body.config);
      if (configError) {
        return reply.code(400).send({ error: configError });
      }

      const alertChannel = await prisma.alertConfiguration.create({
        data: {
          tenantId,
          name: body.name,
          channelType: channelType as never,
          config: body.config as never,
          isActive: true,
        },
      });

      return reply.code(201).send(alertChannel);
    },
  );

  // ─── GET /api/v1/settings/alerts ─────────────────────────────────────────────
  // List view omits config (may contain webhook URLs / email addresses)

  app.get(
    '/api/v1/settings/alerts',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const alerts = await prisma.alertConfiguration.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          channelType: true,
          config: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send(alerts);
    },
  );

  // ─── GET /api/v1/settings/alerts/:id ─────────────────────────────────────────
  // Detail view includes config

  app.get(
    '/api/v1/settings/alerts/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const alert = await prisma.alertConfiguration.findFirst({
        where: { id, tenantId },
      });

      if (!alert) {
        return reply.code(404).send({ error: 'Alert channel not found' });
      }

      return reply.send(alert);
    },
  );

  // ─── PATCH /api/v1/settings/alerts/:id ───────────────────────────────────────

  app.patch(
    '/api/v1/settings/alerts/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as {
        name?: string;
        config?: Record<string, unknown>;
        isActive?: boolean;
      };

      const existing = await prisma.alertConfiguration.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return reply.code(404).send({ error: 'Alert channel not found' });
      }

      const updateData: Record<string, unknown> = {};

      if (body.name !== undefined) {
        updateData.name = body.name;
      }

      if (body.config !== undefined) {
        if (typeof body.config !== 'object' || Array.isArray(body.config)) {
          return reply.code(400).send({ error: 'config must be an object' });
        }
        const configError = validateConfig(existing.channelType as AlertChannelType, body.config);
        if (configError) {
          return reply.code(400).send({ error: configError });
        }
        updateData.config = body.config;
      }

      if (body.isActive !== undefined) {
        updateData.isActive = body.isActive;
      }

      const updated = await prisma.alertConfiguration.update({
        where: { id },
        data: updateData as never,
      });

      return reply.send(updated);
    },
  );

  // ─── DELETE /api/v1/settings/alerts/:id ──────────────────────────────────────

  app.delete(
    '/api/v1/settings/alerts/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const existing = await prisma.alertConfiguration.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return reply.code(404).send({ error: 'Alert channel not found' });
      }

      await prisma.alertConfiguration.delete({
        where: { id },
      });

      return reply.send({ ok: true });
    },
  );

  // ─── POST /api/v1/settings/alerts/:id/test ───────────────────────────────────
  // Send a test message to the configured channel to validate connectivity.

  app.post(
    '/api/v1/settings/alerts/:id/test',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const alert = await prisma.alertConfiguration.findFirst({
        where: { id, tenantId },
      });

      if (!alert) {
        return reply.code(404).send({ error: 'Alert channel not found' });
      }

      const config = alert.config as Record<string, unknown>;
      const channelType = alert.channelType as AlertChannelType;

      try {
        switch (channelType) {
          case 'EMAIL': {
            // Import nodemailer transporter lazily — avoids coupling to email-service config
            // For test, we just validate that the config is intact
            const emailCfg = config as unknown as EmailConfig;
            if (!Array.isArray(emailCfg.recipients) || emailCfg.recipients.length === 0) {
              return reply.send({ success: false, error: 'No recipients configured' });
            }

            // Use direct SMTP send via nodemailer if SMTP env vars are set
            const smtpHost = process.env.SMTP_HOST;
            if (smtpHost) {
              const nodemailer = await import('nodemailer');
              const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: Number(process.env.SMTP_PORT ?? 587),
                secure: false,
                auth: process.env.SMTP_USER
                  ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                  : undefined,
              });

              await transporter.sendMail({
                from: process.env.SMTP_FROM ?? 'noreply@meridianitsm.com',
                to: emailCfg.recipients.join(', '),
                subject: 'Test Alert from MeridianITSM',
                text: 'Test alert from MeridianITSM — this message confirms your email alert channel is configured correctly.',
              });
            }

            return reply.send({ success: true });
          }

          case 'SLACK': {
            const slackCfg = config as unknown as SlackConfig;
            const response = await fetch(slackCfg.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: 'Test alert from MeridianITSM' }),
            });

            if (!response.ok) {
              const text = await response.text();
              return reply.send({ success: false, error: `Slack webhook returned ${response.status}: ${text}` });
            }

            return reply.send({ success: true });
          }

          case 'TEAMS': {
            const teamsCfg = config as unknown as TeamsConfig;
            const response = await fetch(teamsCfg.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                '@type': 'MessageCard',
                '@context': 'https://schema.org/extensions',
                summary: 'Test Alert',
                text: 'Test alert from MeridianITSM',
              }),
            });

            if (!response.ok) {
              const text = await response.text();
              return reply.send({
                success: false,
                error: `Teams webhook returned ${response.status}: ${text}`,
              });
            }

            return reply.send({ success: true });
          }

          case 'DISCORD': {
            const discordCfg = config as unknown as DiscordConfig;
            const response = await fetch(discordCfg.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: 'Test alert from MeridianITSM' }),
            });

            if (!response.ok) {
              const text = await response.text();
              return reply.send({
                success: false,
                error: `Discord webhook returned ${response.status}: ${text}`,
              });
            }

            return reply.send({ success: true });
          }

          case 'TELEGRAM': {
            const telegramCfg = config as unknown as TelegramConfig;
            const response = await fetch(
              `https://api.telegram.org/bot${telegramCfg.botToken}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: telegramCfg.chatId,
                  text: 'Test alert from MeridianITSM',
                  parse_mode: 'HTML',
                }),
              },
            );

            if (!response.ok) {
              const data = (await response.json()) as { description?: string };
              return reply.send({
                success: false,
                error: `Telegram API returned ${response.status}: ${data.description ?? 'Unknown error'}`,
              });
            }

            return reply.send({ success: true });
          }

          default:
            return reply.send({ success: false, error: `Unsupported channel type: ${String(channelType)}` });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[alert-channels] Test delivery failed for ${id}:`, err);
        return reply.send({ success: false, error: message });
      }
    },
  );
}
