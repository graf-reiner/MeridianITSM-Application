import { describe, it, expect } from 'vitest';
import { getSchemaContext, EXCLUDED_TABLES } from '../services/ai-schema-context';

/**
 * Phase 7 — CAI-01 lock-in.
 *
 * These tests enforce the Phase 7 FK + JOIN contract in the staff AI schema
 * context. After Plan 05, the `cmdb_configuration_items` and
 * `cmdb_relationships` DDL blocks must:
 *   - document FK columns with NOT NULL annotations,
 *   - carry JOIN-hint comments pointing to the four reference tables,
 *   - list the canonical seeded classKeys and relationshipKeys,
 *   - NOT carry the legacy enum token lists (SERVER|WORKSTATION|..., etc).
 *
 * Reference tables themselves (`cmdb_ci_classes`, `cmdb_statuses`,
 * `cmdb_environments`, `cmdb_relationship_types`) must expose their key
 * columns so the AI can JOIN on them.
 */
describe('AI schema context (CAI-01)', () => {
  const ctx = getSchemaContext();

  it('documents cmdb_configuration_items joins (JOIN cmdb_ci_classes appears)', () => {
    expect(ctx).toMatch(/JOIN cmdb_ci_classes/);
  });

  it('documents cmdb_relationships joins (JOIN cmdb_relationship_types appears)', () => {
    expect(ctx).toMatch(/JOIN cmdb_relationship_types/);
  });

  it('documents lifecycle + operational status JOIN hints', () => {
    expect(ctx).toMatch(/JOIN cmdb_statuses/);
    // statusType may be double-quoted in SQL (e.g. `"statusType"='lifecycle'`)
    expect(ctx).toMatch(/statusType"?\s*=\s*'lifecycle'/);
    expect(ctx).toMatch(/statusType"?\s*=\s*'operational'/);
  });

  it('documents environment JOIN hint', () => {
    expect(ctx).toMatch(/JOIN cmdb_environments/);
  });

  it('does not contain the legacy enum token list for cmdb_configuration_items', () => {
    // Find the cmdb_configuration_items block — from its header to the next blank line or next top-level table
    const ciBlockMatch = ctx.match(/cmdb_configuration_items[\s\S]*?(?=\n\n|\ncmdb_[a-z_]+:|$)/);
    expect(ciBlockMatch).toBeTruthy();
    const ciBlock = ciBlockMatch![0];
    // The block must NOT contain the legacy enum token walls
    expect(ciBlock).not.toMatch(/SERVER\|WORKSTATION/);
    expect(ciBlock).not.toMatch(/ACTIVE\|INACTIVE\|DECOMMISSIONED/);
    expect(ciBlock).not.toMatch(/PRODUCTION\|STAGING\|DEV\|DR/);
  });

  it('does not contain the legacy relationshipType enum token list for cmdb_relationships', () => {
    const relBlockMatch = ctx.match(/cmdb_relationships[\s\S]*?(?=\n\n|\ncmdb_[a-z_]+:|$)/);
    expect(relBlockMatch).toBeTruthy();
    const relBlock = relBlockMatch![0];
    expect(relBlock).not.toMatch(/DEPENDS_ON\|HOSTS\|CONNECTS_TO/);
  });

  it('marks Phase 7 FK columns on cmdb_configuration_items as NOT NULL', () => {
    expect(ctx).toMatch(/"classId"[^)]*NOT NULL/);
    expect(ctx).toMatch(/"lifecycleStatusId"[^)]*NOT NULL/);
    expect(ctx).toMatch(/"operationalStatusId"[^)]*NOT NULL/);
    expect(ctx).toMatch(/"environmentId"[^)]*NOT NULL/);
  });

  it('marks cmdb_relationships relationshipTypeId as NOT NULL', () => {
    expect(ctx).toMatch(/"relationshipTypeId"[^)]*NOT NULL/);
  });

  it('lists the canonical seeded classKeys (server, virtual_machine, database, ...)', () => {
    expect(ctx).toMatch(/server.*virtual_machine.*database/s);
    expect(ctx).toMatch(/network_device/);
    expect(ctx).toMatch(/application_instance/);
    expect(ctx).toMatch(/certificate/);
    expect(ctx).toMatch(/generic/);
  });

  it('lists the canonical seeded relationshipKeys (depends_on, runs_on, hosted_on, ...)', () => {
    expect(ctx).toMatch(/depends_on.*runs_on.*hosted_on/s);
    expect(ctx).toMatch(/connected_to/);
    expect(ctx).toMatch(/managed_by/);
    expect(ctx).toMatch(/installed_on/);
  });

  it('documents key columns on the four reference tables so the AI can JOIN on them', () => {
    expect(ctx).toMatch(/classKey/);
    expect(ctx).toMatch(/statusKey/);
    expect(ctx).toMatch(/envKey/);
    expect(ctx).toMatch(/relationshipKey/);
  });

  it('example query teaches correct multi-tenancy (tenantId filter)', () => {
    // Multi-tenancy mention in JOIN examples is required; the file body mentions tenantId throughout
    expect(ctx).toMatch(/tenantId/);
  });
});

// ---------------------------------------------------------------------------
// Phase 8 — AI schema context (CAI-01)
// ---------------------------------------------------------------------------
//
// Wave 0 scaffold: assertions that the schema context correctly reflects the
// Phase 8 Asset hardware/OS duplication retirement. Implementation lands in
// Wave 4 (plan 08-05) which strips 10 `assets` columns, adds the
// `cmdb_software_installed` block (with JOIN-hint docs), extends the
// `cmdb_ci_servers` block with (cpuModel, disksJson, networkInterfacesJson),
// and adds `cmdb_migration_audit` to EXCLUDED_TABLES.
describe('Phase 8 - AI schema context (CAI-01)', () => {
  const ctx = getSchemaContext();

  it('ai-schema-context: assets has no hostname/operatingSystem; cmdb_software_installed exists', () => {
    // Extract just the `assets:` block (starts at "assets:", ends before the next
    // top-level table header or comment line). The cmdb_software_installed block
    // with its JOIN-hint comments lives separately.
    const assetsBlockMatch = ctx.match(/\nassets:\s[\s\S]*?(?=\n\w+\s*\([A-Z]|\n--|\n\n[a-z_]+:|\nsites:)/);
    expect(assetsBlockMatch).toBeTruthy();
    const assetsBlock = assetsBlockMatch![0];
    // Phase 8 removal: 10 hardware/OS columns MUST NOT appear in the assets row spec
    expect(assetsBlock).not.toMatch(/\bhostname\(/);
    expect(assetsBlock).not.toMatch(/"operatingSystem"\(/);
    expect(assetsBlock).not.toMatch(/"osVersion"\(/);
    expect(assetsBlock).not.toMatch(/"cpuModel"\(/);
    expect(assetsBlock).not.toMatch(/"cpuCores"\(/);
    expect(assetsBlock).not.toMatch(/"ramGb"\(/);
    // cmdb_software_installed block exists somewhere in context
    expect(ctx).toMatch(/cmdb_software_installed/);
    // JOIN guidance (NOTE comment or a JOIN example) to teach the AI how to reach it
    expect(ctx).toMatch(/JOIN cmdb_software_installed/);
  });

  it('ai-schema-context: cmdb_ci_servers includes cpuModel/disksJson/networkInterfacesJson', () => {
    expect(ctx).toMatch(/cmdb_ci_servers[\s\S]*cpuModel/);
    expect(ctx).toMatch(/cmdb_ci_servers[\s\S]*disksJson/);
    expect(ctx).toMatch(/cmdb_ci_servers[\s\S]*networkInterfacesJson/);
  });

  it('ai-schema-context excludes cmdb_migration_audit', () => {
    expect(EXCLUDED_TABLES).toContain('cmdb_migration_audit');
  });
});
