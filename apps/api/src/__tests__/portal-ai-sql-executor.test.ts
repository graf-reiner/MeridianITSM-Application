import { describe, it, expect } from 'vitest';
import { executePortalQuery } from '../services/portal-ai-sql-executor';

/**
 * Phase 7 — CAI-03 lock-in.
 *
 * Defense-in-depth: even if PORTAL_ALLOWED_TABLES is ever mutated to
 * include a cmdb_* table (silent allowlist regression), the executor
 * MUST still reject any portal-AI query that touches cmdb_* tables.
 *
 * Note: executePortalQuery's contract returns a QueryResult with an
 * `error` string on rejection (it does NOT throw). These tests match
 * the real contract. The error message must mention CAI-03 or clearly
 * indicate CMDB is inaccessible so future debugging can trace back.
 *
 * These tests do NOT touch the database — the cmdb_* hard-reject is
 * implemented in the SQL validation step BEFORE any DB connection is
 * opened, so no pg mocking is required.
 */
describe('Portal AI SQL executor (CAI-03)', () => {
  const TENANT_ID = '11111111-1111-4111-8111-111111111111';
  const USER_ID = '22222222-2222-4222-8222-222222222222';

  it('rejects SELECT * FROM cmdb_configuration_items', async () => {
    const result = await executePortalQuery(
      TENANT_ID,
      USER_ID,
      `SELECT * FROM cmdb_configuration_items WHERE "tenantId" = '${TENANT_ID}' LIMIT 1`,
    );
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/CMDB tables are not accessible|CAI-03/i);
    expect(result.rows).toEqual([]);
  });

  it('rejects SELECT * FROM cmdb_ci_classes', async () => {
    const result = await executePortalQuery(
      TENANT_ID,
      USER_ID,
      `SELECT * FROM cmdb_ci_classes WHERE "tenantId" = '${TENANT_ID}'`,
    );
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/CMDB tables are not accessible|CAI-03/i);
  });

  it('rejects JOIN against cmdb_statuses', async () => {
    const result = await executePortalQuery(
      TENANT_ID,
      USER_ID,
      `SELECT t.id FROM tickets t JOIN cmdb_statuses s ON 1=1 WHERE t."tenantId" = '${TENANT_ID}' AND t."requestedById" = '${USER_ID}'`,
    );
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/CMDB tables are not accessible|CAI-03/i);
  });

  it('rejects cmdb_environments, cmdb_relationships, cmdb_relationship_types', async () => {
    for (const tbl of ['cmdb_environments', 'cmdb_relationships', 'cmdb_relationship_types']) {
      const result = await executePortalQuery(
        TENANT_ID,
        USER_ID,
        `SELECT * FROM ${tbl} WHERE "tenantId" = '${TENANT_ID}'`,
      );
      expect(result.error, `expected rejection for ${tbl}`).toBeDefined();
      expect(result.error, `expected CAI-03 message for ${tbl}`).toMatch(
        /CMDB tables are not accessible|CAI-03/i,
      );
    }
  });

  it('cmdb_* reject is positioned BEFORE the allowlist check (error mentions CMDB, not generic allowlist)', async () => {
    // If the cmdb_* reject fires first, the error should mention CMDB/CAI-03
    // (NOT the generic "Access to table 'cmdb_configuration_items' is not available" message
    // that would come from the allowlist check if the defense-in-depth branch did not exist).
    const result = await executePortalQuery(
      TENANT_ID,
      USER_ID,
      `SELECT * FROM cmdb_configuration_items`,
    );
    expect(result.error).toBeDefined();
    // The CMDB-specific branch must fire; accept either CAI-03 or the CMDB-tables phrase.
    expect(result.error).toMatch(/CMDB tables are not accessible|CAI-03/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 8 — Portal AI SQL executor cmdb_ regex coverage (CAI-03)
// ---------------------------------------------------------------------------
//
// Wave 0 scaffold: defense-in-depth for cmdb_software_installed and
// cmdb_migration_audit. The existing Phase 7 regex `cmdb_*` hard-reject
// already covers these two tables (the pattern fires on any table name
// starting with `cmdb_`). Wave 4 (plan 08-05) converts these to real
// assertions; Wave 0 keeps them as pending discovery.
describe('Phase 8 - portal AI SQL executor cmdb_ regex coverage (CAI-03)', () => {
  it.todo('executePortalQuery rejects cmdb_software_installed');
  it.todo('executePortalQuery rejects cmdb_migration_audit');
});
