import { describe, it } from 'vitest';

/**
 * Phase 7 — CAI-01 scaffold.
 *
 * Real assertions land in Plan 05 once ai-schema-context.ts is updated to
 * replace the legacy enum token lists for cmdb_configuration_items and
 * cmdb_relationships with JOIN-hint comments plus the canonical classKey /
 * relationshipKey lists. Until then the cases are surfaced as `it.todo`
 * pending so Vitest does not report a silent green.
 *
 * Do NOT replace with `it(..., () => expect(true).toBe(true))` — see
 * STATE.md Tracked Follow-up about api-key.test.ts green-lie placeholders.
 */
describe('AI schema context (CAI-01)', () => {
  it.todo('ai-schema-context documents cmdb_configuration_items joins (JOIN cmdb_ci_classes appears)');
  it.todo('ai-schema-context documents cmdb_relationships joins (JOIN cmdb_relationship_types appears)');
  it.todo('ai-schema-context does not contain the legacy enum token list for cmdb_configuration_items');
  it.todo('ai-schema-context lists the canonical seeded classKeys (server, virtual_machine, database, ...)');
});
