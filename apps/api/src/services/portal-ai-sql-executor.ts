/**
 * Portal AI SQL Executor — Governed, row-level-scoped SQL executor for portal users.
 *
 * Enforces:
 * - Table allowlist (only portal-permitted tables)
 * - SELECT-only queries
 * - Mandatory $TENANT_ID and $USER_ID placeholder substitution
 * - Ticket queries must include requestedById = userId
 * - Knowledge article queries must filter PUBLISHED + PUBLIC
 * - Ticket comment queries must filter PUBLIC visibility
 * - Statement timeout (5s) and row/byte size limits
 * - Transaction is READ ONLY
 */

import pg from 'pg';
import { PORTAL_ALLOWED_TABLES } from './portal-schema-context.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

// Same forbidden patterns as the staff executor
const FORBIDDEN_PATTERNS = [
  /\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bDROP\b/i, /\bALTER\b/i,
  /\bCREATE\b/i, /\bTRUNCATE\b/i, /\bGRANT\b/i, /\bREVOKE\b/i, /\bCALL\b/i,
  /\bCOPY\b/i, /\bVACUUM\b/i, /\bREINDEX\b/i, /\bCOMMENT\s+ON\b/i,
  /\bPREPARE\b/i, /\bDEALLOCATE\b/i, /\bLISTEN\b/i, /\bNOTIFY\b/i, /\bLOAD\b/i,
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 200;
const MAX_RESULT_BYTES = 50_000;
const STATEMENT_TIMEOUT_MS = 5000;

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  error?: string;
}

function validatePortalSql(sql: string): { valid: boolean; error?: string } {
  const trimmed = sql.trim();

  // Must be SELECT or WITH
  if (!/^\s*(SELECT|WITH)\b/i.test(trimmed)) {
    return { valid: false, error: 'Only SELECT queries are allowed' };
  }

  // Strip string literals for analysis
  const withoutStrings = trimmed.replace(/'[^']*'/g, '');

  // No multiple statements
  if (/;\s*\S/.test(withoutStrings)) {
    return { valid: false, error: 'Multiple statements are not allowed' };
  }

  // No forbidden keywords
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(withoutStrings)) {
      return { valid: false, error: 'Forbidden SQL keyword detected' };
    }
  }

  // Table allowlist: check that every table reference is in the allowed list
  // Extract table names from FROM and JOIN clauses
  const tableRefs = withoutStrings.match(/\b(?:FROM|JOIN)\s+(\w+)/gi) || [];
  for (const ref of tableRefs) {
    const tableName = ref.replace(/^(FROM|JOIN)\s+/i, '').trim();
    if (!PORTAL_ALLOWED_TABLES.includes(tableName)) {
      return {
        valid: false,
        error: `Access to table '${tableName}' is not available in the portal. You can only query: ${PORTAL_ALLOWED_TABLES.join(', ')}`,
      };
    }
  }

  return { valid: true };
}

function enforceLimit(sql: string): string {
  if (/\bLIMIT\b/i.test(sql)) return sql;
  return sql.replace(/;\s*$/, '') + ` LIMIT ${MAX_ROWS}`;
}

/**
 * Execute a portal-governed AI SQL query.
 * Enforces: table allowlist, $TENANT_ID + $USER_ID placeholders,
 * mandatory clause validation (userId in ticket queries, PUBLISHED/PUBLIC in KB queries).
 */
export async function executePortalQuery(
  tenantId: string,
  userId: string,
  sql: string,
): Promise<QueryResult> {
  // Step 1: Validate SQL structure and table allowlist
  const validation = validatePortalSql(sql);
  if (!validation.valid) {
    return { columns: [], rows: [], rowCount: 0, truncated: false, error: validation.error };
  }

  // Step 2: Validate UUID formats
  if (!UUID_RE.test(tenantId)) {
    return { columns: [], rows: [], rowCount: 0, truncated: false, error: 'Invalid tenantId format' };
  }
  if (!UUID_RE.test(userId)) {
    return { columns: [], rows: [], rowCount: 0, truncated: false, error: 'Invalid userId format' };
  }

  // Step 3: Replace placeholders
  let finalSql = sql.replaceAll('$TENANT_ID', tenantId).replaceAll('$USER_ID', userId);

  // Step 4: Verify tenant ID is present
  if (!finalSql.includes(tenantId)) {
    return {
      columns: [], rows: [], rowCount: 0, truncated: false,
      error: 'Query must include $TENANT_ID placeholder for tenant filtering.',
    };
  }

  // Step 5: Mandatory clause validation
  const sqlLower = sql.toLowerCase();

  // If touching tickets table, userId must be present after substitution
  if (/\btickets\b/i.test(sql) && !finalSql.includes(userId)) {
    return {
      columns: [], rows: [], rowCount: 0, truncated: false,
      error: 'Ticket queries must include WHERE "requestedById" = \'$USER_ID\' to scope to your tickets.',
    };
  }

  // If touching knowledge_articles, PUBLISHED and PUBLIC must be present
  if (/\bknowledge_articles\b/i.test(sql)) {
    if (!sqlLower.includes('published') || !sqlLower.includes('public')) {
      return {
        columns: [], rows: [], rowCount: 0, truncated: false,
        error: "Knowledge article queries must filter by status = 'PUBLISHED' AND visibility = 'PUBLIC'.",
      };
    }
  }

  // If touching ticket_comments, PUBLIC visibility must be present
  if (/\bticket_comments\b/i.test(sql) && !sqlLower.includes('public')) {
    return {
      columns: [], rows: [], rowCount: 0, truncated: false,
      error: "Ticket comment queries must filter by visibility = 'PUBLIC'.",
    };
  }

  // Step 6: Enforce LIMIT
  finalSql = enforceLimit(finalSql);

  // Step 7: Execute
  const client = await getPool().connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}'`);

    const result = await client.query(finalSql);
    await client.query('COMMIT');

    const columns = result.fields.map((f) => f.name);
    const rows = result.rows.map((row: Record<string, unknown>) =>
      columns.map((col) => row[col]),
    );

    let truncated = false;
    let finalRows = rows;

    if (rows.length > MAX_ROWS) {
      finalRows = rows.slice(0, MAX_ROWS);
      truncated = true;
    }

    const serialized = JSON.stringify({ columns, rows: finalRows });
    if (serialized.length > MAX_RESULT_BYTES) {
      while (finalRows.length > 1) {
        finalRows = finalRows.slice(0, Math.floor(finalRows.length * 0.75));
        if (JSON.stringify({ columns, rows: finalRows }).length <= MAX_RESULT_BYTES) break;
      }
      truncated = true;
    }

    return { columns, rows: finalRows, rowCount: result.rowCount ?? rows.length, truncated };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const message = err instanceof Error ? err.message : 'Query failed';
    if (message.includes('statement timeout')) {
      return {
        columns: [], rows: [], rowCount: 0, truncated: false,
        error: 'Query timed out (5s limit). Try simplifying or adding filters.',
      };
    }
    return { columns: [], rows: [], rowCount: 0, truncated: false, error: message };
  } finally {
    client.release();
  }
}
