import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PORTAL_ALLOWED_TABLES } from '../services/portal-schema-context';

/**
 * Phase 7 — CAI-02 lock-in.
 *
 * Portal AI remains CMDB-free in Phase 7 (RESEARCH.md assumption A2 LOCKED).
 * These are REAL assertions — not `it.todo` — because they pass TODAY
 * (PORTAL_ALLOWED_TABLES already excludes cmdb_*). The test locks the
 * invariant against future regressions and is the canonical CAI-02 gate.
 */
describe('Portal AI schema context (CAI-02 lock-in)', () => {
  it('portal context excludes cmdb_*', () => {
    const cmdbLeaks = PORTAL_ALLOWED_TABLES.filter((t) => t.startsWith('cmdb_'));
    expect(cmdbLeaks).toEqual([]);
  });

  it('portal context excludes any reference-table cmdb_ci_classes / cmdb_statuses / cmdb_environments / cmdb_relationship_types', () => {
    const explicitForbidden = [
      'cmdb_configuration_items',
      'cmdb_relationships',
      'cmdb_ci_classes',
      'cmdb_statuses',
      'cmdb_environments',
      'cmdb_relationship_types',
    ];
    for (const table of explicitForbidden) {
      expect(PORTAL_ALLOWED_TABLES).not.toContain(table);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 8 — Portal context exclusions (CAI-02)
// ---------------------------------------------------------------------------
//
// Wave 0 scaffold: the Phase 8-specific exclusions (cmdb_software_installed,
// cmdb_migration_audit) MUST never appear in PORTAL_ALLOWED_TABLES. The
// exclusion comment in portal-schema-context.ts is added in Wave 4 (plan
// 08-05). These tests convert from `it.todo` to real `it(...)` assertions
// in Wave 4 once the comment lands.
describe('Phase 8 - portal context exclusions (CAI-02)', () => {
  it('PORTAL_ALLOWED_TABLES still excludes cmdb_software_installed', () => {
    expect(PORTAL_ALLOWED_TABLES).not.toContain('cmdb_software_installed');
  });

  it('PORTAL_ALLOWED_TABLES still excludes cmdb_migration_audit', () => {
    expect(PORTAL_ALLOWED_TABLES).not.toContain('cmdb_migration_audit');
  });

  it('portal-schema-context Phase 8 exclusion comment present', async () => {
    // Resolve via import.meta.url so the test works regardless of vitest's cwd
    const filePath = resolve(__dirname, '../services/portal-schema-context.ts');
    const fileContent = await readFile(filePath, 'utf8');
    expect(fileContent).toMatch(/PHASE 8 audit/);
  });
});
