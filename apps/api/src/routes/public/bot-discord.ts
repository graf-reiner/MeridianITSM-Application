import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { handleBotCommand } from '../../services/chat-bot.service.js';

/**
 * Discord Bot Interaction Receiver (public — no auth required).
 *
 * Discord sends interaction events to this endpoint. The Discord Application's
 * Interactions Endpoint URL should be set to:
 *   https://your-api.com/api/public/webhooks/discord
 *
 * POST /api/public/webhooks/discord
 */
export async function botDiscordRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/public/webhooks/discord', async (request, reply) => {
    const body = request.body as {
      type: number;
      data?: {
        name?: string;
        options?: Array<{ name: string; value: string }>;
      };
      member?: { user?: { id: string; username?: string } };
      user?: { id: string; username?: string };
      channel_id?: string;
      guild_id?: string;
      token?: string;
    };

    // Type 1: PING — Discord verification handshake
    if (body.type === 1) {
      return reply.status(200).send({ type: 1 });
    }

    // Type 2: APPLICATION_COMMAND — Slash command invocation
    if (body.type === 2 && body.data) {
      const userId = body.member?.user?.id ?? body.user?.id ?? 'unknown';
      const channelId = body.channel_id ?? '';
      const commandName = body.data.name ?? '';
      const args = body.data.options?.map((o) => o.value).join(' ') ?? '';

      // Find tenant by Discord alert configuration
      const alertConfig = await prisma.alertConfiguration.findFirst({
        where: {
          channelType: 'DISCORD',
          isActive: true,
        },
      });

      if (!alertConfig) {
        return reply.status(200).send({
          type: 4,
          data: { content: 'Bot is not configured. Please contact your administrator.' },
        });
      }

      const tenantId = alertConfig.tenantId;
      const fullCommand = `/${commandName} ${args}`.trim();

      const result = await handleBotCommand('discord', userId, channelId, tenantId, fullCommand);

      // Type 4: CHANNEL_MESSAGE_WITH_SOURCE — respond with message
      return reply.status(200).send({
        type: 4,
        data: {
          content: result.text,
          components: result.buttons && result.buttons.length > 0
            ? [{
                type: 1, // ACTION_ROW
                components: result.buttons.slice(0, 5).map((b, i) => ({
                  type: 2, // BUTTON
                  style: 1, // PRIMARY
                  label: b.label,
                  custom_id: `btn_${i}_${b.data}`,
                })),
              }]
            : undefined,
        },
      });
    }

    // Type 3: MESSAGE_COMPONENT — Button click
    if (body.type === 3) {
      const customId = (body as any).data?.custom_id as string ?? '';
      const userId = body.member?.user?.id ?? body.user?.id ?? 'unknown';
      const channelId = body.channel_id ?? '';

      // Extract original command from custom_id (format: btn_0_/command args)
      const commandMatch = customId.match(/^btn_\d+_(.+)$/);
      const command = commandMatch?.[1] ?? '';

      const alertConfig = await prisma.alertConfiguration.findFirst({
        where: { channelType: 'DISCORD', isActive: true },
      });

      if (!alertConfig || !command) {
        return reply.status(200).send({ type: 6 }); // DEFERRED_UPDATE_MESSAGE
      }

      const result = await handleBotCommand('discord', userId, channelId, alertConfig.tenantId, command);

      return reply.status(200).send({
        type: 4,
        data: { content: result.text },
      });
    }

    // Unknown type
    return reply.status(200).send({ type: 1 });
  });
}
