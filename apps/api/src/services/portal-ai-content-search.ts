/**
 * Portal AI Content Search — Row-level-scoped full-text search for portal users.
 *
 * Key governance differences from the staff ai-content-search.ts:
 * - Knowledge article queries always add: AND status = 'PUBLISHED' AND visibility = 'PUBLIC'
 * - Ticket queries always add: AND "requestedById" = $3::uuid
 * - Ticket comment queries always add: AND t."requestedById" = $3::uuid AND tc.visibility = 'PUBLIC'
 * - Document contents filtered to user's own tickets or published KB articles only
 * - userId is always a parameterized binding ($3), never interpolated into SQL
 *
 * Parameter positions: $1=tenantId, $2=query, $3=userId, $4=limit
 */

import pg from 'pg';
import { formatTicketNumber } from '@meridian/core';

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
 * Full-text search across portal-accessible content using PostgreSQL tsvector.
 * Falls back to ILIKE if tsvector columns don't exist yet.
 * All results are scoped to the given userId.
 */
export async function searchPortalContent(
  tenantId: string,
  userId: string,
  query: string,
  scope: SearchScope = 'all',
  limit: number = 20,
): Promise<{ results: ContentSearchResult[]; total: number }> {
  // Validate tenantId
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error('Invalid tenantId');
  }
  // Validate userId
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error('Invalid userId');
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
        ? await searchPortalKnowledgeFTS(client, tenantId, query, safeLimit)
        : await searchPortalKnowledgeLike(client, tenantId, query, safeLimit);
      results.push(...kbResults);
    }

    if (scope === 'all' || scope === 'tickets') {
      const ticketResults = hasTsvector
        ? await searchPortalTicketsFTS(client, tenantId, userId, query, safeLimit)
        : await searchPortalTicketsLike(client, tenantId, userId, query, safeLimit);
      results.push(...ticketResults);

      const commentResults = hasTsvector
        ? await searchPortalCommentsFTS(client, tenantId, userId, query, safeLimit)
        : await searchPortalCommentsLike(client, tenantId, userId, query, safeLimit);
      results.push(...commentResults);
    }

    if (scope === 'all' || scope === 'attachments') {
      const attachResults = await searchPortalDocumentContents(client, tenantId, userId, query, safeLimit);
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

// $1=tenantId, $2=query, $3=limit (no userId — KB is public, no user filter)
async function searchPortalKnowledgeFTS(
  client: pg.PoolClient, tenantId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT id, "articleNumber", title, summary,
       ts_rank(search_vector, websearch_to_tsquery('english', $2)) as rank,
       ts_headline('english', content, websearch_to_tsquery('english', $2),
         'MaxWords=40, MinWords=20, StartSel=**, StopSel=**') as snippet
     FROM knowledge_articles
     WHERE "tenantId" = $1::uuid
       AND status = 'PUBLISHED'
       AND visibility = 'PUBLIC'
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
    metadata: { articleNumber: r.articleNumber },
  }));
}

// $1=tenantId, $2=query, $3=userId, $4=limit
async function searchPortalTicketsFTS(
  client: pg.PoolClient, tenantId: string, userId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT id, "ticketNumber", title, status, priority,
       ts_rank(search_vector, websearch_to_tsquery('english', $2)) as rank,
       ts_headline('english', COALESCE(description, ''), websearch_to_tsquery('english', $2),
         'MaxWords=40, MinWords=20, StartSel=**, StopSel=**') as snippet
     FROM tickets
     WHERE "tenantId" = $1::uuid
       AND "requestedById" = $3::uuid
       AND search_vector @@ websearch_to_tsquery('english', $2)
     ORDER BY rank DESC
     LIMIT $4`,
    [tenantId, query, userId, limit],
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    source: 'ticket' as const,
    id: r.id as string,
    title: `${formatTicketNumber(r.ticketNumber)}: ${r.title}`,
    snippet: (r.snippet as string) || '',
    rank: r.rank as number,
    metadata: { ticketNumber: r.ticketNumber, status: r.status, priority: r.priority },
  }));
}

// $1=tenantId, $2=query, $3=userId, $4=limit
async function searchPortalCommentsFTS(
  client: pg.PoolClient, tenantId: string, userId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT tc.id, t."ticketNumber", t.title as ticket_title,
       ts_rank(tc.search_vector, websearch_to_tsquery('english', $2)) as rank,
       ts_headline('english', tc.content, websearch_to_tsquery('english', $2),
         'MaxWords=40, MinWords=20, StartSel=**, StopSel=**') as snippet
     FROM ticket_comments tc
     JOIN tickets t ON t.id = tc."ticketId"
     WHERE tc."tenantId" = $1::uuid
       AND t."requestedById" = $3::uuid
       AND tc.visibility = 'PUBLIC'
       AND tc.search_vector @@ websearch_to_tsquery('english', $2)
     ORDER BY rank DESC
     LIMIT $4`,
    [tenantId, query, userId, limit],
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    source: 'ticket_comment' as const,
    id: r.id as string,
    title: `Comment on ${formatTicketNumber(r.ticketNumber)}: ${r.ticket_title}`,
    snippet: (r.snippet as string) || '',
    rank: r.rank as number,
  }));
}

// ─── ILIKE Fallback (no tsvector) ────────────────────────────────────────────

async function searchPortalKnowledgeLike(
  client: pg.PoolClient, tenantId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT id, "articleNumber", title, summary,
       LEFT(content, 200) as snippet
     FROM knowledge_articles
     WHERE "tenantId" = $1::uuid
       AND status = 'PUBLISHED'
       AND visibility = 'PUBLIC'
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

async function searchPortalTicketsLike(
  client: pg.PoolClient, tenantId: string, userId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT id, "ticketNumber", title, status, priority,
       LEFT(COALESCE(description, ''), 200) as snippet
     FROM tickets
     WHERE "tenantId" = $1::uuid
       AND "requestedById" = $3::uuid
       AND (title ILIKE '%' || $2 || '%' OR description ILIKE '%' || $2 || '%')
     ORDER BY "createdAt" DESC
     LIMIT $4`,
    [tenantId, query, userId, limit],
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    source: 'ticket' as const,
    id: r.id as string,
    title: `${formatTicketNumber(r.ticketNumber)}: ${r.title}`,
    snippet: (r.snippet as string) || '',
    rank: 1,
    metadata: { ticketNumber: r.ticketNumber, status: r.status, priority: r.priority },
  }));
}

async function searchPortalCommentsLike(
  client: pg.PoolClient, tenantId: string, userId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  const res = await client.query(
    `SELECT tc.id, t."ticketNumber", t.title as ticket_title,
       LEFT(tc.content, 200) as snippet
     FROM ticket_comments tc
     JOIN tickets t ON t.id = tc."ticketId"
     WHERE tc."tenantId" = $1::uuid
       AND t."requestedById" = $3::uuid
       AND tc.visibility = 'PUBLIC'
       AND tc.content ILIKE '%' || $2 || '%'
     ORDER BY tc."createdAt" DESC
     LIMIT $4`,
    [tenantId, query, userId, limit],
  );

  return res.rows.map((r: Record<string, unknown>) => ({
    source: 'ticket_comment' as const,
    id: r.id as string,
    title: `Comment on ${formatTicketNumber(r.ticketNumber)}: ${r.ticket_title}`,
    snippet: (r.snippet as string) || '',
    rank: 1,
  }));
}

// ─── Document Content Search ─────────────────────────────────────────────────

/**
 * Search document_contents filtered to:
 * - Attachments on the user's own tickets (sourceType = 'ticket_attachment')
 * - Attachments on published public KB articles (sourceType = 'knowledge_article')
 * userId is passed as $3 — never interpolated.
 */
async function searchPortalDocumentContents(
  client: pg.PoolClient, tenantId: string, userId: string, query: string, limit: number,
): Promise<ContentSearchResult[]> {
  // Check if table exists
  const tableExists = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'document_contents'
    ) as exists
  `);

  if (!tableExists.rows[0]?.exists) return [];

  // Only return docs from:
  // 1. Ticket attachments where the ticket belongs to this user
  // 2. Knowledge article attachments where the article is PUBLISHED + PUBLIC
  const res = await client.query(
    `SELECT dc.id, dc.filename, dc."sourceType", dc."sourceId",
       LEFT(dc."extractedText", 200) as snippet
     FROM document_contents dc
     WHERE dc."tenantId" = $1::uuid
       AND dc."extractedText" ILIKE '%' || $2 || '%'
       AND (
         (
           dc."sourceType" = 'ticket_attachment'
           AND EXISTS (
             SELECT 1 FROM ticket_attachments ta
             JOIN tickets t ON t.id = ta."ticketId"
             WHERE ta.id = dc."sourceId"
               AND t."requestedById" = $3::uuid
               AND t."tenantId" = $1::uuid
           )
         )
         OR (
           dc."sourceType" = 'knowledge_article'
           AND EXISTS (
             SELECT 1 FROM knowledge_articles ka
             WHERE ka.id = dc."sourceId"
               AND ka.status = 'PUBLISHED'
               AND ka.visibility = 'PUBLIC'
               AND ka."tenantId" = $1::uuid
           )
         )
       )
     ORDER BY dc."extractedAt" DESC
     LIMIT $4`,
    [tenantId, query, userId, limit],
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
