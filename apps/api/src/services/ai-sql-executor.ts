import pg from 'pg';
import { EXCLUDED_TABLES } from './ai-schema-context.js';

const { Pool } = pg;

// ─── Connection Pool ─────────────────────────────────────────────────────────

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

// ─── SQL Validation ──────────────────────────────────────────────────────────

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
  /\bPREPARE\b/i,
  /\bDEALLOCATE\b/i,
  /\bLISTEN\b/i,
  /\bNOTIFY\b/i,
  /\bLOAD\b/i,
];

const EXCLUDED_TABLE_PATTERN = new RegExp(
  `\\b(${EXCLUDED_TABLES.join('|')})\\b`,
  'i',
);

function validateSql(sql: string): { valid: boolean; error?: string } {
  const trimmed = sql.trim();

  if (!/^\s*(SELECT|WITH)\b/i.test(trimmed)) {
    return { valid: false, error: 'Only SELECT queries are allowed' };
  }

  const withoutStrings = trimmed.replace(/'[^']*'/g, '');
  if (/;\s*\S/.test(withoutStrings)) {
    return { valid: false, error: 'Multiple statements are not allowed' };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(withoutStrings)) {
      return { valid: false, error: 'Forbidden SQL keyword detected' };
    }
  }

  if (EXCLUDED_TABLE_PATTERN.test(withoutStrings)) {
    return { valid: false, error: 'Access to that table is restricted' };
  }

  return { valid: true };
}

// ─── Query Execution ─────────────────────────────────────────────────────────

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

/**
 * Execute an AI-generated SQL query with security sandbox.
 *
 * The LLM writes $TENANT_ID as a placeholder — we replace it with the real
 * tenant UUID. This lets the LLM handle table aliases properly in JOINs
 * while we control the actual value.
 */
export async function executeAiQuery(
  tenantId: string,
  sql: string,
): Promise<QueryResult> {
  // Step 1: Validate
  const validation = validateSql(sql);
  if (!validation.valid) {
    return { columns: [], rows: [], rowCount: 0, truncated: false, error: validation.error };
  }

  // Step 2: Replace $TENANT_ID placeholder with actual tenant UUID
  const tenantedSql = replaceTenantPlaceholder(sql, tenantId);

  // Step 3: Safety check — the tenantId must appear in the final SQL
  if (!tenantedSql.includes(tenantId)) {
    return {
      columns: [], rows: [], rowCount: 0, truncated: false,
      error: 'Query must include $TENANT_ID placeholder for tenant filtering. Add WHERE "tenantId" = \'$TENANT_ID\' to your query.',
    };
  }

  // Step 4: Enforce LIMIT
  const limitedSql = enforceLimit(tenantedSql);

  const client = await getPool().connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}'`);

    const result = await client.query(limitedSql);
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
      return { columns: [], rows: [], rowCount: 0, truncated: false, error: 'Query timed out (5s limit). Try simplifying or adding filters.' };
    }
    return { columns: [], rows: [], rowCount: 0, truncated: false, error: message };
  } finally {
    client.release();
  }
}

// ─── Tenant Placeholder ──────────────────────────────────────────────────────

function replaceTenantPlaceholder(sql: string, tenantId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error('Invalid tenantId format');
  }
  return sql.replaceAll('$TENANT_ID', tenantId);
}

// ─── LIMIT Enforcement ───────────────────────────────────────────────────────

function enforceLimit(sql: string): string {
  if (/\bLIMIT\b/i.test(sql)) return sql;
  return sql.replace(/;\s*$/, '') + ` LIMIT ${MAX_ROWS}`;
}
