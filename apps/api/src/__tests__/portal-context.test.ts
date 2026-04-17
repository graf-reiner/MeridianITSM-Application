import { describe, it, expect } from 'vitest';
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
