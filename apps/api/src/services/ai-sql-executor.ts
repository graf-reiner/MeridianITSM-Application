import pg from 'pg';
import { EXCLUDED_TABLES } from './ai-schema-context.js';

const { Pool } = pg;

// ─── Connection Pool ─────────────────────────────────────────────────────────

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3, // Small pool — AI queries are infrequent
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

// ─── SQL Validation ──────────────────────────────────────────────────────────

/** Dangerous SQL keywords that indicate mutation or DDL */
const FORBIDDEN_PATTERNS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bTRUNCATE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bCALL\b/i,
  /\bCOPY\b/i,
  /\bVACUUM\b/i,
  /\bREINDEX\b/i,
  /\bCOMMENT\s+ON\b/i,
  /\bRESET\b/i,
  /\bPREPARE\b/i,
  /\bDEALLOCATE\b/i,
  /\bLISTEN\b/i,
  /\bNOTIFY\b/i,
  /\bLOAD\b/i,
];

/** Tables the AI must not access */
const EXCLUDED_TABLE_PATTERN = new RegExp(
  `\\b(${EXCLUDED_TABLES.join('|')})\\b`,
  'i',
);

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateSql(sql: string): ValidationResult {
  const trimmed = sql.trim();

  // Must start with SELECT or WITH (for CTEs)
  if (!/^\s*(SELECT|WITH)\b/i.test(trimmed)) {
    return { valid: false, error: 'Only SELECT queries are allowed' };
  }

  // Reject multi-statement (semicolon followed by another statement)
  const withoutStrings = trimmed.replace(/'[^']*'/g, ''); // Remove string literals
  if (/;\s*\S/.test(withoutStrings)) {
    return { valid: false, error: 'Multiple statements are not allowed' };
  }

  // Check for forbidden keywords (outside string literals)
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(withoutStrings)) {
      return { valid: false, error: `Forbidden SQL keyword detected` };
    }
  }

  // Check for excluded tables
  if (EXCLUDED_TABLE_PATTERN.test(withoutStrings)) {
    return { valid: false, error: 'Access to that table is restricted' };
  }

  return { valid: true };
}

// ─── Query Execution ─────────────────────────────────────────────────────────

const MAX_ROWS = 200;
const MAX_RESULT_BYTES = 50_000; // 50KB
const STATEMENT_TIMEOUT_MS = 5000; // 5 seconds

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  error?: string;
}

/**
 * Execute an AI-generated SQL query with full security sandbox.
 *
 * Security layers:
 * 1. SQL validation (SELECT-only, no forbidden keywords, no excluded tables)
 * 2. Read-only transaction
 * 3. Tenant isolation via WHERE injection
 * 4. Statement timeout (5s)
 * 5. Row limit (200)
 * 6. Result size cap (50KB)
 */
export async function executeAiQuery(
  tenantId: string,
  sql: string,
): Promise<QueryResult> {
  // Step 1: Validate
  const validation = validateSql(sql);
  if (!validation.valid) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      error: validation.error,
    };
  }

  // Step 2: Inject tenant filter
  const tenantedSql = injectTenantFilter(sql, tenantId);

  // Step 3: Enforce LIMIT
  const limitedSql = enforceLimit(tenantedSql);

  const client = await getPool().connect();
  try {
    // Step 4: Read-only transaction with timeout
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}'`);

    const result = await client.query(limitedSql);
    await client.query('COMMIT');

    // Step 5: Format result
    const columns = result.fields.map((f) => f.name);
    const rows = result.rows.map((row: Record<string, unknown>) =>
      columns.map((col) => row[col]),
    );

    // Step 6: Check result size
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
        const check = JSON.stringify({ columns, rows: finalRows });
        if (check.length <= MAX_RESULT_BYTES) break;
      }
      truncated = true;
    }

    return {
      columns,
      rows: finalRows,
      rowCount: result.rowCount ?? rows.length,
      truncated,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const message = err instanceof Error ? err.message : 'Query failed';

    if (message.includes('statement timeout')) {
      return { columns: [], rows: [], rowCount: 0, truncated: false, error: 'Query timed out (5s limit). Try simplifying or adding filters.' };
    }
    return { columns: [], rows: [], rowCount: 0, truncated: false, error: message };
  } finally {
    client.release();
  }
}

// ─── Tenant Filter Injection ─────────────────────────────────────────────────

/**
 * Injects "tenantId" = '<tenantId>' into the WHERE clause.
 * The LLM is instructed NOT to add tenantId — we add it here for safety.
 */
function injectTenantFilter(sql: string, tenantId: string): string {
  // Validate tenantId is a UUID to prevent injection
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error('Invalid tenantId format');
  }

  const tenantCondition = `"tenantId" = '${tenantId}'::uuid`;

  // Find the main (outermost) WHERE
  const whereIdx = findMainWhereIndex(sql);

  if (whereIdx >= 0) {
    // Insert tenant condition right after WHERE
    return (
      sql.slice(0, whereIdx + 5) +
      ` ${tenantCondition} AND` +
      sql.slice(whereIdx + 5)
    );
  }

  // No WHERE — insert before GROUP BY, ORDER BY, LIMIT, or at end
  const insertPatterns = [
    /\bGROUP\s+BY\b/i,
    /\bHAVING\b/i,
    /\bORDER\s+BY\b/i,
    /\bLIMIT\b/i,
    /\bOFFSET\b/i,
  ];

  for (const pattern of insertPatterns) {
    const match = pattern.exec(sql);
    if (match) {
      return (
        sql.slice(0, match.index) +
        `WHERE ${tenantCondition} ` +
        sql.slice(match.index)
      );
    }
  }

  // No modifiers — append WHERE at end
  const trimmed = sql.replace(/;\s*$/, '');
  return `${trimmed} WHERE ${tenantCondition}`;
}

/**
 * Find the index of the main (outermost) WHERE keyword,
 * skipping WHERE inside subqueries (parentheses).
 */
function findMainWhereIndex(sql: string): number {
  let depth = 0;
  const upper = sql.toUpperCase();

  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') depth--;
    else if (depth === 0 && upper.slice(i, i + 5) === 'WHERE') {
      const before = i > 0 ? sql[i - 1] : ' ';
      const after = i + 5 < sql.length ? sql[i + 5] : ' ';
      if (/[\s(]/.test(before) && /\s/.test(after)) {
        return i;
      }
    }
  }
  return -1;
}

// ─── LIMIT Enforcement ───────────────────────────────────────────────────────

function enforceLimit(sql: string): string {
  if (/\bLIMIT\b/i.test(sql)) return sql;
  const trimmed = sql.replace(/;\s*$/, '');
  return `${trimmed} LIMIT ${MAX_ROWS}`;
}
