import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions/completions.js';
import { prisma } from '@meridian/db';
import { decrypt } from '../lib/encryption.js';
import { getSchemaContext } from './ai-schema-context.js';
import { executeAiQuery } from './ai-sql-executor.js';
import { searchContent } from './ai-content-search.js';

// ─── Per-Tenant OpenAI Client ────────────────────────────────────────────────

async function getTenantAiConfig(tenantId: string): Promise<{ apiKey: string; model: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });

  const settings = (tenant?.settings as Record<string, unknown>) ?? {};
  const encryptedKey = settings.openaiApiKey as string | undefined;

  if (!encryptedKey) {
    throw new Error('AI Assistant is not configured. Please add your OpenAI API key in Settings > AI Assistant.');
  }

  const apiKey = decrypt(encryptedKey);
  const model = (settings.openaiModel as string) || 'gpt-4o-mini';

  return { apiKey, model };
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the MeridianITSM AI Assistant — a helpful, read-only assistant for an IT Service Management platform. You answer questions by querying the application database.

YOU HAVE TWO TOOLS:

1. **query_database** — Write a PostgreSQL SELECT query to answer structured data questions.
   Use this for: counts, lists, filters, aggregations, cross-table JOINs, date ranges, JSON field queries.
   Examples: "How many open tickets?", "List all servers", "Which CIs have open incidents?"

2. **search_content** — Full-text search across KB articles, ticket descriptions/comments, and PDF attachments.
   Use this for: finding information by topic or keyword in unstructured text content.
   Examples: "Find articles about VPN setup", "Search tickets mentioning password reset"

SQL RULES:
- Write PostgreSQL-compatible SELECT statements ONLY
- Column names are "camelCase" in double quotes: "ticketNumber", "assignedToId", "createdAt"
- Table names are snake_case WITHOUT quotes: tickets, cmdb_configuration_items
- TENANT FILTERING: ALWAYS include $TENANT_ID as the tenant UUID placeholder. Use table alias to qualify it.
  Single table: SELECT * FROM tickets WHERE "tenantId" = '$TENANT_ID'
  JOIN example: SELECT t."ticketNumber", ta.filename FROM tickets t JOIN ticket_attachments ta ON ta."ticketId" = t.id WHERE t."tenantId" = '$TENANT_ID'
  The system replaces $TENANT_ID with the real UUID — never hardcode a UUID.
- Use JOINs freely to combine data across tables
- Use GROUP BY / COUNT / SUM / AVG for aggregations
- For JSON array fields, use jsonb_array_elements() to expand and filter:
  Example — find machines with specific software:
    SELECT DISTINCT i.hostname, i."operatingSystem", elem->>'name' as sw_name, elem->>'version' as sw_version
    FROM inventory_snapshots i, jsonb_array_elements(i."installedSoftware") elem
    WHERE i."tenantId" = '$TENANT_ID' AND elem->>'name' ILIKE '%7-Zip%'
    ORDER BY i.hostname
  Note: inventory_snapshots may have multiple rows per agent — use DISTINCT ON("agentId") or GROUP BY to deduplicate.
- LIMIT results to 100 unless the user asks for more
- If a query fails, try a simpler version

RESPONSE GUIDELINES:
- Always use tools to query data before answering. Never guess or fabricate data.
- Cite specific records by their number or name (e.g., "SR-42", "CYBORSVR01")
- Format results clearly with tables or bullet lists for multiple items
- If a query returns no results, say so clearly
- You are read-only — you cannot create, update, or delete records
- Be concise but thorough

${getSchemaContext()}`;

// ─── Tool Definitions (2 tools replace 7) ────────────────────────────────────

const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'query_database',
      description:
        'Execute a read-only SQL SELECT query against the PostgreSQL database. Use this for ANY structured data question: counts, lists, filters, aggregations, cross-table JOINs, JSON field queries. You MUST include a WHERE "tenantId" = \'$TENANT_ID\' clause in every query — the system replaces $TENANT_ID with the real tenant UUID. Use table aliases to qualify tenantId in JOINs (e.g., t."tenantId" = \'$TENANT_ID\'). Column names use "camelCase" in double quotes. Table names use snake_case.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'A PostgreSQL SELECT statement. MUST include WHERE "tenantId" = \'$TENANT_ID\' for tenant filtering.',
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
        'Full-text search across unstructured content: knowledge base articles (title, summary, full content), ticket descriptions and comments, and PDF attachment text. Use when the user wants to find information by topic or keyword rather than by structured fields.',
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

async function executeTool(
  tenantId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case 'query_database': {
      const sql = args.sql as string;
      if (!sql) return JSON.stringify({ error: 'No SQL query provided' });

      const result = await executeAiQuery(tenantId, sql);

      if (result.error) {
        return JSON.stringify({ error: result.error, hint: 'Try a simpler query or check column/table names.' });
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

      const result = await searchContent(tenantId, query, scope, limit);
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

export async function streamChatResponse(params: {
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
    { role: 'system', content: SYSTEM_PROMPT },
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
      tools: TOOLS,
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

        const result = await executeTool(tenantId, fn.name, args);
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

// ─── Conversation CRUD ───────────────────────────────────────────────────────

export async function listConversations(tenantId: string, userId: string) {
  return prisma.chatConversation.findMany({
    where: { tenantId, userId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getConversation(tenantId: string, userId: string, conversationId: string) {
  return prisma.chatConversation.findFirst({
    where: { id: conversationId, tenantId, userId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          toolCalls: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function deleteConversation(tenantId: string, userId: string, conversationId: string) {
  const conv = await prisma.chatConversation.findFirst({
    where: { id: conversationId, tenantId, userId },
  });
  if (!conv) return null;

  await prisma.chatConversation.delete({
    where: { id: conversationId },
  });
  return conv;
}
