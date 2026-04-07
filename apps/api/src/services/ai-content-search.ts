import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ContentSearchResult {
  source: string; // 'knowledge_article' | 'ticket' | 'ticket_comment' | 'attachment'
  id: string;
  title: string;
  snippet: string;
  rank: number;
  metadata?: Record<string, unknown>;
}

export type SearchScope = 'all' | 'knowledge_articles' | 'tickets' | 'attachments';

// ─── Main Search Function ────────────────────────────────────────────────────

/**
 * Full-text search across unstructured content using PostgreSQL tsvector.
 * Falls back to ILIKE if tsvector columns don't exist yet.
 */
export async function searchContent(
  tenantId: string,
  query: string,
  scope: SearchScope = 'all',
  limit: number = 20,
): Promise<{ results: ContentSearchResult[]; total: number }> {
  // Validate tenantId
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error('Invalid tenantId');
  }

  const safeLimit = Math.min(Math.max(1, limit), 50);
  const results: ContentSearchResult[] = [];

  const client = await getPool().connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '5000'`);

    // Check if tsvector columns exist (they may not exist yet on first deploy)
    const hasTsvector = await checkTsvectorColumns(client);

    if (scope === 'all' || scope === 'knowledge_articles') {
      const kbResults = hasTsvector
        ? await searchKnowledgeFTS(client, tenantId, query, safeLimit)
        : await searchKnowledgeLike(client, tenantId, query, safeLimit);
      results.push(...kbResults);
    }

    if (scope === 'all' || scope === 'tickets') {
      const ticketResults = hasTsvector
        ? await searchTicketsFTS(client, tenantId, query, safeLimit)
        : await searchTicketsLike(client, tenantId, query, safeLimit);
      results.push(...ticketResults);

      const commentResults = hasTsvector
        ? await searchCommentsFTS(client, tenantId, query, safeLimit)
        : await searchCommentsLike(client, tenantId, query, safeLimit);
      results.push(...commentResults);
    }

    if (scope === 'all' || scope === 'attachments') {
      const attachResults = await searchDocumentContents(client, tenantId, query, safeLimit);
      results.push(...attachResults);
    }

    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }

  // Sort by rank descending, take top N
  results.sort((a, b) => b.rank - a.rank);
  const topResults = results.slice(0, safeLimit);

  return { results: topResults, total: results.length };
}

// ─── Check for tsvector columns ──────────────────────────────────────────────

async function checkTsvectorColumns(client: pg.PoolClient): Promise<boolean> {
  const res = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tickets' AND column_name = 'search_vector'
    ) as has_fts
  `);
  return res.rows[0]?.has_fts === true;
}

// ─── Full-Text Search (with tsvector) ────────────────────────────────────────

async function searchKnowledgeFTS(
  client: pg.PoolClient, tenantId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT id, "articleNumber", title, summary,
       ts_rank(search_vector, websearch_to_tsquery('english', $2)) as rank,
       ts_headline('english', content, websearch_to_tsquery('english', $2),
         'MaxWords=40, MinWords=20, StartSel=**, StopSel=**') as snippet
     FROM knowledge_articles
     WHERE "tenantId" = $1::uuid
       AND search_vector @@ websearch_to_tsquery('english', $2)
     ORDER BY rank DESC
     LIMIT $3`,
    [tenantId, query, limit],
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    source: 'knowledge_article' as const,
    id: r.id as string,
    title: `KB-${r.articleNumber}: ${r.title}`,
    snippet: (r.snippet as string) || (r.summary as string) || '',
    rank: r.rank as number,
    metadata: { articleNumber: r.articleNumber, status: r.status },
  }));
}

async function searchTicketsFTS(
  client: pg.PoolClient, tenantId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT id, "ticketNumber", title, status, priority,
       ts_rank(search_vector, websearch_to_tsquery('english', $2)) as rank,
       ts_headline('english', COALESCE(description, ''), websearch_to_tsquery('english', $2),
         'MaxWords=40, MinWords=20, StartSel=**, StopSel=**') as snippet
     FROM tickets
     WHERE "tenantId" = $1::uuid
       AND search_vector @@ websearch_to_tsquery('english', $2)
     ORDER BY rank DESC
     LIMIT $3`,
    [tenantId, query, limit],
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    source: 'ticket' as const,
    id: r.id as string,
    title: `TKT-${r.ticketNumber}: ${r.title}`,
    snippet: (r.snippet as string) || '',
    rank: r.rank as number,
    metadata: { ticketNumber: r.ticketNumber, status: r.status, priority: r.priority },
  }));
}

async function searchCommentsFTS(
  client: pg.PoolClient, tenantId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT tc.id, t."ticketNumber", t.title as ticket_title,
       ts_rank(tc.search_vector, websearch_to_tsquery('english', $2)) as rank,
       ts_headline('english', tc.content, websearch_to_tsquery('english', $2),
         'MaxWords=40, MinWords=20, StartSel=**, StopSel=**') as snippet
     FROM ticket_comments tc
     JOIN tickets t ON t.id = tc."ticketId"
     WHERE tc."tenantId" = $1::uuid
       AND tc.search_vector @@ websearch_to_tsquery('english', $2)
     ORDER BY rank DESC
     LIMIT $3`,
    [tenantId, query, limit],
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    source: 'ticket_comment' as const,
    id: r.id as string,
    title: `Comment on TKT-${r.ticketNumber}: ${r.ticket_title}`,
    snippet: (r.snippet as string) || '',
    rank: r.rank as number,
  }));
}

// ─── ILIKE Fallback (no tsvector) ────────────────────────────────────────────

async function searchKnowledgeLike(
  client: pg.PoolClient, tenantId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT id, "articleNumber", title, summary,
       LEFT(content, 200) as snippet
     FROM knowledge_articles
     WHERE "tenantId" = $1::uuid
       AND (title ILIKE '%' || $2 || '%' OR summary ILIKE '%' || $2 || '%' OR content ILIKE '%' || $2 || '%')
     ORDER BY "createdAt" DESC
     LIMIT $3`,
    [tenantId, query, limit],
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    source: 'knowledge_article' as const,
    id: r.id as string,
    title: `KB-${r.articleNumber}: ${r.title}`,
    snippet: (r.snippet as string) || (r.summary as string) || '',
    rank: 1,
  }));
}

async function searchTicketsLike(
  client: pg.PoolClient, tenantId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT id, "ticketNumber", title, status, priority,
       LEFT(COALESCE(description, ''), 200) as snippet
     FROM tickets
     WHERE "tenantId" = $1::uuid
       AND (title ILIKE '%' || $2 || '%' OR description ILIKE '%' || $2 || '%')
     ORDER BY "createdAt" DESC
     LIMIT $3`,
    [tenantId, query, limit],
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    source: 'ticket' as const,
    id: r.id as string,
    title: `TKT-${r.ticketNumber}: ${r.title}`,
    snippet: (r.snippet as string) || '',
    rank: 1,
    metadata: { ticketNumber: r.ticketNumber, status: r.status, priority: r.priority },
  }));
}

async function searchCommentsLike(
  client: pg.PoolClient, tenantId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT tc.id, t."ticketNumber", t.title as ticket_title,
       LEFT(tc.content, 200) as snippet
     FROM ticket_comments tc
     JOIN tickets t ON t.id = tc."ticketId"
     WHERE tc."tenantId" = $1::uuid
       AND tc.content ILIKE '%' || $2 || '%'
     ORDER BY tc."createdAt" DESC
     LIMIT $3`,
    [tenantId, query, limit],
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    source: 'ticket_comment' as const,
    id: r.id as string,
    title: `Comment on TKT-${r.ticketNumber}: ${r.ticket_title}`,
    snippet: (r.snippet as string) || '',
    rank: 1,
  }));
}

// ─── Document Content Search ─────────────────────────────────────────────────

async function searchDocumentContents(
  client: pg.PoolClient, tenantId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  // Check if table exists
  const tableExists = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'document_contents'
    ) as exists
  `);

  if (!tableExists.rows[0]?.exists) return [];

  const res = await client.query(
    `SELECT id, filename, "sourceType", "sourceId",
       LEFT("extractedText", 200) as snippet
     FROM document_contents
     WHERE "tenantId" = $1::uuid
       AND "extractedText" ILIKE '%' || $2 || '%'
     ORDER BY "extractedAt" DESC
     LIMIT $3`,
    [tenantId, query, limit],
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    source: 'attachment' as const,
    id: r.id as string,
    title: `PDF: ${r.filename}`,
    snippet: (r.snippet as string) || '',
    rank: 1,
    metadata: { sourceType: r.sourceType, sourceId: r.sourceId },
  }));
}
