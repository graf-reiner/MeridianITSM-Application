import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { planGate } from '../../../plugins/plan-gate.js';
import { redis } from '../../../lib/redis.js';
import {
  streamChatResponse,
  listConversations,
  getConversation,
  deleteConversation,
} from '../../../services/ai-chat.service.js';

// ─── Token Budget ────────────────────────────────────────────────────────────

/** Daily token budgets by plan tier */
const TOKEN_BUDGETS: Record<string, number> = {
  STARTER: 0,         // AI not available on Starter
  PROFESSIONAL: 50_000,
  BUSINESS: 100_000,
  ENTERPRISE: 500_000,
};

function getTokenBudgetKey(tenantId: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `ai:tokens:${tenantId}:${date}`;
}

async function checkTokenBudget(tenantId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  // Look up plan tier from planGate cache
  const cached = await redis.get(`plan:${tenantId}`);
  const tier = cached ? (JSON.parse(cached) as { tier: string }).tier : 'STARTER';
  const limit = TOKEN_BUDGETS[tier] ?? 50_000;

  const key = getTokenBudgetKey(tenantId);
  const used = Number(await redis.get(key)) || 0;

  return { allowed: used < limit, used, limit };
}

async function recordTokenUsage(tenantId: string, tokens: number): Promise<void> {
  const key = getTokenBudgetKey(tenantId);
  await redis.incrby(key, tokens);
  // Set TTL to 48 hours (so the key auto-expires the day after)
  await redis.expire(key, 48 * 60 * 60);
}

export async function aiChatRoutes(app: FastifyInstance): Promise<void> {
  // ─── List conversations ────────────────────────────────────────────────────
  app.get(
    '/api/v1/ai-chat/conversations',
    { preHandler: [planGate('ai_assistant')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, userId } = request.user as { tenantId: string; userId: string };
      const conversations = await listConversations(tenantId, userId);
      return reply.status(200).send(conversations);
    },
  );

  // ─── Get single conversation with messages ─────────────────────────────────
  app.get(
    '/api/v1/ai-chat/conversations/:id',
    { preHandler: [planGate('ai_assistant')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, userId } = request.user as { tenantId: string; userId: string };
      const { id } = request.params as { id: string };
      const conversation = await getConversation(tenantId, userId, id);
      if (!conversation) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }
      return reply.status(200).send(conversation);
    },
  );

  // ─── Send message (SSE streaming response) ────────────────────────────────
  app.post(
    '/api/v1/ai-chat/conversations/:id/messages',
    { preHandler: [planGate('ai_assistant')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, userId } = request.user as { tenantId: string; userId: string };
      const { id } = request.params as { id: string };
      const body = request.body as { message?: string };

      if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
        return reply.status(400).send({ error: 'message is required' });
      }
      if (body.message.length > 4000) {
        return reply.status(400).send({ error: 'message must not exceed 4000 characters' });
      }

      // Check daily token budget before processing
      const budget = await checkTokenBudget(tenantId);
      if (!budget.allowed) {
        return reply.status(429).send({
          error: 'AI_TOKEN_BUDGET_EXCEEDED',
          used: budget.used,
          limit: budget.limit,
          message: 'Daily AI token budget exceeded. Budget resets at midnight UTC.',
        });
      }

      const conversationId = id === 'new' ? null : id;

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      try {
        const result = await streamChatResponse({
          tenantId,
          userId,
          conversationId,
          message: body.message.trim(),
          onToken: (chunk) => {
            reply.raw.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`);
          },
          onToolCall: (name, args) => {
            reply.raw.write(`data: ${JSON.stringify({ type: 'tool_call', name, args })}\n\n`);
          },
          signal: request.raw.destroyed ? AbortSignal.abort() : undefined,
        });

        // Record token usage for budget tracking
        if (result.tokensUsed > 0) {
          void recordTokenUsage(tenantId, result.tokensUsed);
        }

        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'done',
            conversationId: result.conversationId,
            tokensUsed: result.tokensUsed,
          })}\n\n`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      }

      reply.raw.end();
      return reply;
    },
  );

  // ─── Start new conversation + send first message ───────────────────────────
  app.post(
    '/api/v1/ai-chat/conversations',
    { preHandler: [planGate('ai_assistant')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, userId } = request.user as { tenantId: string; userId: string };
      const body = request.body as { message?: string };

      if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
        return reply.status(400).send({ error: 'message is required' });
      }
      if (body.message.length > 4000) {
        return reply.status(400).send({ error: 'message must not exceed 4000 characters' });
      }

      // Check daily token budget before processing
      const budget = await checkTokenBudget(tenantId);
      if (!budget.allowed) {
        return reply.status(429).send({
          error: 'AI_TOKEN_BUDGET_EXCEEDED',
          used: budget.used,
          limit: budget.limit,
          message: 'Daily AI token budget exceeded. Budget resets at midnight UTC.',
        });
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      try {
        const result = await streamChatResponse({
          tenantId,
          userId,
          conversationId: null,
          message: body.message.trim(),
          onToken: (chunk) => {
            reply.raw.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`);
          },
          onToolCall: (name, args) => {
            reply.raw.write(`data: ${JSON.stringify({ type: 'tool_call', name, args })}\n\n`);
          },
        });

        // Record token usage for budget tracking
        if (result.tokensUsed > 0) {
          void recordTokenUsage(tenantId, result.tokensUsed);
        }

        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'done',
            conversationId: result.conversationId,
            tokensUsed: result.tokensUsed,
          })}\n\n`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      }

      reply.raw.end();
      return reply;
    },
  );

  // ─── Delete conversation ───────────────────────────────────────────────────
  app.delete(
    '/api/v1/ai-chat/conversations/:id',
    { preHandler: [planGate('ai_assistant')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, userId } = request.user as { tenantId: string; userId: string };
      const { id } = request.params as { id: string };
      const deleted = await deleteConversation(tenantId, userId, id);
      if (!deleted) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }
      return reply.status(204).send();
    },
  );
}
