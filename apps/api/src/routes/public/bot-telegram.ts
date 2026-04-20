import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { handleBotCommand } from '../../services/chat-bot.service.js';

/**
 * Telegram Bot Webhook Receiver (public — no auth required).
 *
 * Telegram sends Update objects to this endpoint when users interact with the bot.
 * The bot token in the URL path acts as a simple authentication mechanism.
 *
 * POST /api/public/webhooks/telegram/:botToken
 */
export async function botTelegramRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/public/webhooks/telegram/:botToken', async (request, reply) => {
    const { botToken } = request.params as { botToken: string };
    const update = request.body as {
      message?: {
        chat: { id: number };
        from?: { id: number; first_name?: string; last_name?: string; username?: string };
        text?: string;
      };
      callback_query?: {
        id: string;
        from: { id: number };
        message?: { chat: { id: number } };
        data?: string;
      };
    };

    // Find the tenant that owns this bot token
    const alertConfig = await prisma.alertConfiguration.findFirst({
      where: {
        channelType: 'TELEGRAM',
        isActive: true,
      },
    });

    if (!alertConfig) {
      return reply.status(200).send({ ok: true }); // Don't reveal config to attackers
    }

    const config = alertConfig.config as Record<string, unknown>;
    if (config.botToken !== botToken) {
      return reply.status(200).send({ ok: true }); // Silent reject
    }

    const tenantId = alertConfig.tenantId;

    // Handle callback_query (button presses)
    if (update.callback_query) {
      const chatId = String(update.callback_query.message?.chat.id ?? update.callback_query.from.id);
      const userId = String(update.callback_query.from.id);
      const data = update.callback_query.data ?? '';

      // Answer callback to remove loading state
      void fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: update.callback_query.id }),
      });

      const result = await handleBotCommand('telegram', userId, chatId, tenantId, data);
      await sendTelegramMessage(botToken, chatId, result.text, result.buttons);
      return reply.status(200).send({ ok: true });
    }

    // Handle text messages
    if (update.message?.text) {
      const chatId = String(update.message.chat.id);
      const userId = String(update.message.from?.id ?? update.message.chat.id);
      const text = update.message.text;

      const result = await handleBotCommand('telegram', userId, chatId, tenantId, text);
      await sendTelegramMessage(botToken, chatId, result.text, result.buttons);
    }

    return reply.status(200).send({ ok: true });
  });
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  buttons?: Array<{ label: string; data: string }>,
): Promise<void> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };

  if (buttons && buttons.length > 0) {
    payload.reply_markup = {
      inline_keyboard: [
        buttons.map((b) => ({ text: b.label, callback_data: b.data })),
      ],
    };
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[telegram] sendMessage failed: ${res.status} ${body}`);
  }
}
