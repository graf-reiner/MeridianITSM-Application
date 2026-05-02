/**
 * Portal AI Chat Service — Governed AI chatbot for end-user self-service portal.
 *
 * Structurally mirrors ai-chat.service.ts but uses restricted, row-level-scoped
 * executors to ensure portal users only see their own data and published content.
 *
 * Governance enforced:
 * - Only portal user's own tickets (requestedById = userId)
 * - Only PUBLISHED + PUBLIC knowledge articles
 * - Only PUBLIC ticket comments
 * - Table allowlist enforced at query execution level
 * - No access to CMDB, assets, changes, users, or internal systems
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions/completions.js';
import { prisma } from '@meridian/db';
import { decrypt } from '../lib/encryption.js';
import { getPortalSchemaContext } from './portal-schema-context.js';
import { executePortalQuery } from './portal-ai-sql-executor.js';
import { searchPortalContent } from './portal-ai-content-search.js';

// ─── Per-Tenant OpenAI Client ────────────────────────────────────────────────

async function getTenantAiConfig(tenantId: string): Promise<{ apiKey: string; model: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });

  const settings = (tenant?.settings as Record<string, unknown>) ?? {};
  const encryptedKey = settings.openaiApiKey as string | undefined;

  if (!encryptedKey) {
    throw new Error('AI Assistant is not configured. Please contact your IT support team.');
  }

  const apiKey = decrypt(encryptedKey);
  const model = (settings.openaiModel as string) || 'gpt-4o-mini';

  return { apiKey, model };
}

// ─── System Prompt ───────────────────────────────────────────────────────────

function buildPortalSystemPrompt(): string {
  return `You are the MeridianITSM Self-Service Portal Assistant — a helpful, read-only assistant for end users of an IT Service Management platform.

IMPORTANT GOVERNANCE RULES:
- You can ONLY access the logged-in user's own tickets (where "requestedById" = your user ID)
- You can ONLY access published public knowledge articles (status = 'PUBLISHED' AND visibility = 'PUBLIC')
- You have NO access to other users' data, CMDB, assets, changes, or internal systems

YOU HAVE TWO TOOLS:

1. **query_database** — Write a PostgreSQL SELECT query.
   ALWAYS include BOTH:
   - WHERE "tenantId" = '$TENANT_ID'
   - AND "requestedById" = '$USER_ID' (when querying tickets)
   - AND status = 'PUBLISHED' AND visibility = 'PUBLIC' (when querying knowledge_articles)
   - AND visibility = 'PUBLIC' (when querying ticket_comments)

   Example ticket query:
     SELECT "ticketNumber", title, status, priority FROM tickets WHERE "tenantId" = '$TENANT_ID' AND "requestedById" = '$USER_ID' ORDER BY "createdAt" DESC

   Example knowledge query:
     SELECT "articleNumber", title, summary FROM knowledge_articles WHERE "tenantId" = '$TENANT_ID' AND status = 'PUBLISHED' AND visibility = 'PUBLIC' ORDER BY "helpfulCount" DESC

2. **search_content** — Full-text search across your tickets and published knowledge articles.

SQL RULES:
- PostgreSQL SELECT only
- Column names are "camelCase" in double quotes
- Table names are snake_case WITHOUT quotes
- $TENANT_ID = tenant UUID placeholder (replaced automatically)
- $USER_ID = your user UUID placeholder (replaced automatically)
- LIMIT results to 100 unless asked for more

RESPONSE GUIDELINES:
- Always use tools before answering
- Never guess or fabricate data
- Cite records by number (e.g., "SR-42", "KB-15")
- You are read-only — you cannot create, update, or delete records
- Be helpful and concise

${getPortalSchemaContext()}`;
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

const PORTAL_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'query_database',
      description:
        'Execute a read-only SQL SELECT query against the portal database. Use this for structured data questions about YOUR tickets and published knowledge articles. ' +
        'You MUST include BOTH: (1) WHERE "tenantId" = \'$TENANT_ID\' for tenant filtering AND (2) AND "requestedById" = \'$USER_ID\' when querying tickets (the system replaces these placeholders with real UUIDs). ' +
        'For knowledge_articles, add: AND status = \'PUBLISHED\' AND visibility = \'PUBLIC\'. ' +
        'For ticket_comments, add: AND visibility = \'PUBLIC\'. ' +
        'Column names use "camelCase" in double quotes. Table names use snake_case. ' +
        'Only these tables are available: tickets, ticket_comments, ticket_attachments, categories, knowledge_articles, document_contents.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description:
              'A PostgreSQL SELECT statement. MUST include WHERE "tenantId" = \'$TENANT_ID\' for tenant filtering AND "requestedById" = \'$USER_ID\' when querying tickets.',
          },
          description: {
            type: 'string',
            description: 'Brief description of what this query answers',
          },
        },
        required: ['sql', 'description'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_content',
      description:
        'Full-text search across your tickets and published knowledge articles. ' +
        'Searches ticket titles/descriptions (only your own tickets), public ticket comments, published public KB articles, and PDF attachment text. ' +
        'Use when the user wants to find information by topic or keyword.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query — natural language or keywords',
          },
          scope: {
            type: 'string',
            enum: ['all', 'knowledge_articles', 'tickets', 'attachments'],
            description: 'Limit search to a specific content type (default: all)',
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default: 20, max: 50)',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
];

// ─── Tool Executor ───────────────────────────────────────────────────────────

async function executePortalTool(
  tenantId: string,
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case 'query_database': {
      const sql = args.sql as string;
      if (!sql) return JSON.stringify({ error: 'No SQL query provided' });

      const result = await executePortalQuery(tenantId, userId, sql);

      if (result.error) {
        return JSON.stringify({
          error: result.error,
          hint: 'Make sure to include both $TENANT_ID and $USER_ID placeholders. Only portal tables are accessible.',
        });
      }

      return JSON.stringify({
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
      });
    }

    case 'search_content': {
      const query = args.query as string;
      if (!query) return JSON.stringify({ error: 'No search query provided' });

      const scope = (args.scope as 'all' | 'knowledge_articles' | 'tickets' | 'attachments') || 'all';
      const limit = Math.min((args.limit as number) || 20, 50);

      const result = await searchPortalContent(tenantId, userId, query, scope, limit);
      return JSON.stringify(result);
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─── Conversation Management ─────────────────────────────────────────────────

async function getOrCreateConversation(
  tenantId: string,
  userId: string,
  conversationId: string | null,
): Promise<{ id: string; messages: ChatCompletionMessageParam[] }> {
  if (conversationId) {
    const conv = await prisma.chatConversation.findFirst({
      where: { id: conversationId, tenantId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
      },
    });

    if (conv) {
      const messages: ChatCompletionMessageParam[] = conv.messages.map((m) => {
        if (m.role === 'assistant' && m.toolCalls) {
          return {
            role: 'assistant' as const,
            content: m.content ?? null,
            tool_calls: m.toolCalls as never,
          };
        }
        if (m.role === 'tool') {
          return {
            role: 'tool' as const,
            tool_call_id: m.toolCallId ?? '',
            content: m.content ?? '',
          };
        }
        return {
          role: m.role as 'user' | 'assistant',
          content: m.content ?? '',
        };
      });
      return { id: conv.id, messages };
    }
  }

  const conv = await prisma.chatConversation.create({
    data: { tenantId, userId },
  });
  return { id: conv.id, messages: [] };
}

async function saveMessage(
  conversationId: string,
  role: string,
  content: string | null,
  toolCalls?: unknown,
  toolCallId?: string,
  tokenUsage?: number,
) {
  await prisma.chatMessage.create({
    data: {
      conversationId,
      role,
      content,
      toolCalls: toolCalls ? (toolCalls as object) : undefined,
      toolCallId,
      tokenUsage,
    },
  });
}

// ─── Main Streaming Function ─────────────────────────────────────────────────

export async function streamPortalChatResponse(params: {
  tenantId: string;
  userId: string;
  conversationId: string | null;
  message: string;
  onToken: (chunk: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  signal?: AbortSignal;
}): Promise<{ conversationId: string; tokensUsed: number }> {
  const { tenantId, userId, message, onToken, onToolCall, signal } = params;

  // Resolve tenant's OpenAI API key and model
  const aiConfig = await getTenantAiConfig(tenantId);
  const openai = new OpenAI({ apiKey: aiConfig.apiKey });
  const model = aiConfig.model;

  // Get or create conversation
  const conv = await getOrCreateConversation(tenantId, userId, params.conversationId);

  // Set title from first message
  if (conv.messages.length === 0) {
    const title = message.length > 80 ? message.slice(0, 77) + '...' : message;
    await prisma.chatConversation.update({
      where: { id: conv.id },
      data: { title },
    });
  }

  // Save user message
  await saveMessage(conv.id, 'user', message);

  // Build message array for OpenAI
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: buildPortalSystemPrompt() },
    ...conv.messages,
    { role: 'user', content: message },
  ];

  let totalTokens = 0;

  // Phase 1: Tool-calling loop (non-streaming, max 5 rounds)
  let round = 0;
  for (; round < 5; round++) {
    const response = await openai.chat.completions.create({
      model,
      messages,
      tools: PORTAL_TOOLS,
      stream: false,
    });

    totalTokens += response.usage?.total_tokens ?? 0;
    const choice = response.choices[0];
    if (!choice) break;

    // If the model wants to call tools, execute them and loop
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCalls = choice.message.tool_calls;

      messages.push({
        role: 'assistant',
        content: choice.message.content,
        tool_calls: toolCalls,
      });
      await saveMessage(conv.id, 'assistant', choice.message.content, toolCalls);

      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function') continue;
        const fn = toolCall.function;
        const args = JSON.parse(fn.arguments) as Record<string, unknown>;
        onToolCall?.(fn.name, args);

        const result = await executePortalTool(tenantId, userId, fn.name, args);
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
        await saveMessage(conv.id, 'tool', result, undefined, toolCall.id);
      }
      continue; // next round will synthesize
    }

    // Model returned a final answer without tools — emit it directly
    if (choice.message.content) {
      const content = choice.message.content;
      onToken(content);
      await saveMessage(conv.id, 'assistant', content, undefined, undefined, totalTokens);
      return { conversationId: conv.id, tokensUsed: totalTokens };
    }

    break;
  }

  // If we exhausted all 5 rounds without producing an answer, show friendly error
  if (round >= 5) {
    const errorMsg = "I wasn't able to fulfill your request. Please try rephrasing your question.";
    onToken(errorMsg);
    await saveMessage(conv.id, 'assistant', errorMsg, undefined, undefined, totalTokens);
    return { conversationId: conv.id, tokensUsed: totalTokens };
  }

  // Phase 2: Stream the final synthesis after tool calls
  const stream = await openai.chat.completions.create({
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  });

  let fullContent = '';
  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      onToken(delta);
      fullContent += delta;
    }
    if (chunk.usage) {
      totalTokens += chunk.usage.total_tokens;
    }
  }

  await saveMessage(conv.id, 'assistant', fullContent, undefined, undefined, totalTokens);
  return { conversationId: conv.id, tokensUsed: totalTokens };
}

// ─── Re-export Conversation CRUD from the staff service ─────────────────────
// Portal users share the same ChatConversation/ChatMessage tables —
// the userId scoping in getOrCreateConversation above ensures isolation.

export { listConversations, getConversation, deleteConversation } from './ai-chat.service.js';
