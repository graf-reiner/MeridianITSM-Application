import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { planGate } from '../../../plugins/plan-gate.js';
import {
  streamChatResponse,
  listConversations,
  getConversation,
  deleteConversation,
} from '../../../services/ai-chat.service.js';

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
