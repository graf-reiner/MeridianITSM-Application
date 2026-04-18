---
phase: 08-retire-asset-hardware-os-duplication
verified: 2026-04-18T13:55:00Z
status: human_needed
score: 9/9 truths verified (but 1 Critical correctness bug + 4 Warnings surfaced via review/code inspection)
overrides_applied: 0
gaps: []
human_verification:
  - test: "Verify CR-01 fix — confirm a SECOND inventory POST with the same hostname/agent does NOT create a new CI"
    expected: "Second POST returns the same ciId as the first; cmdb_configuration_items count for the agent/tenant stays flat after N repeat POSTs. Today (with the null assetIdForExt hardcode) every POST runs the D-08 orphan-create branch and produces a fresh CI + fresh ciNumber."
    why_human: "Requires running agent inventory POSTs against a live dev API and inspecting the database — cannot simulate via grep/unit test alone. The Wave 3 unit tests at inventory-ingestion.test.ts masked the bug (Test 1 pre-seeds txCIFindFirst but that mock is never consulted because resolvedAsset is null). The operator already signed off on the migration manually; this checks whether the post-migration runtime is duplication-free."
  - test: "Verify WR-01 fix timing — confirm new orphan-created CIs carry agentId + sourceSystem='agent' so the cmdb-reconciliation worker's agentId dedup finds them next run"
    expected: "Orphan-path CI rows created by upsertServerExtensionByAsset have non-null agentId and sourceSystem populated. Currently they are NULL because the service's create() payload only sets tenantId/class/status/env/ciNumber/name/assetId — see apps/api/src/services/cmdb-extension.service.ts lines 140-152."
    why_human: "Same live-DB inspection need. Review the first batch of orphan-create CI rows after an agent heartbeat, then watch the next cmdb-reconciliation worker cycle (15-min cadence) to see whether it creates YET ANOTHER duplicate because the agentId dedup misses."
  - test: "Verify Wave 2 backfill produced populated rows"
    expected: "psql -c \"SELECT COUNT(*) FROM cmdb_ci_servers\" returns a non-zero count; psql -c \"SELECT COUNT(*) FROM cmdb_software_installed\" non-zero if any dev tenant had software inventory; psql -c \"SELECT COUNT(*), status FROM cmdb_migration_audit WHERE phase='phase8' GROUP BY status\" returns the D-01 conflict log."
    why_human: "The operator applied the destructive migration manually and the backfill has not been re-verified against the dev DB in this workflow. Per deploy_state_note, phase8-backfill.ts was supposed to run before the destructive migration or the pre-flight DO block would have RAISE EXCEPTION'd — but the conflict counts + software-row counts need live-DB confirmation to populate the plan 03 SUMMARY."
  - test: "Verify cmdb-reconciliation worker's Phase 8 writes are taking effect in production runs"
    expected: "After an agent heartbeat, cmdb_ci_servers has cpuModel/disksJson/networkInterfacesJson populated for the linked CI AND cmdb_software_installed has rows for each installedSoftware item in the snapshot."
    why_human: "Worker code inspection shows the fields are wired (plan 04 Task 2 verified by grep), but end-to-end runtime behavior needs an actual agent POST + worker cycle to confirm."
  - test: "Staff AI + Portal AI smoke (CAI-01 + CAI-02 + CAI-03)"
    expected: "Staff AI asks 'Which CIs have Microsoft Office?' → returns SQL JOINing cmdb_software_installed. Portal AI asks the same → rejects with /forbidden|not allowed/i message."
    why_human: "Behavioral UI + AI verification; schema-context.ts updates are structurally verified but the AI's actual generated SQL + portal rejection need real chat-agent invocation."
  - test: "Asset detail Technical Profile tab end-to-end UI smoke"
    expected: "Login as admin@msp.local. Open an Asset linked to a CI. Click Technical Profile tab. See hardware/OS/software rendered from CI side. Open an orphan Asset. See Link-a-CI empty state. Click button → CIPicker opens → search → select → PATCH succeeds → page refresh shows linked CI."
    why_human: "Playwright specs structurally exist but require a browser + live dev server to execute end-to-end."
re_verification:
  previous_status: none
  previous_score: N/A
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 08: Retire Asset Hardware/OS Duplication — Verification Report

**Phase Goal:** Hardware, OS, and installed-software data lives on the CI (via `CmdbCiServer` + `CmdbSoftwareInstalled`) and nowhere on `Asset`, with the agent ingestion pipeline rerouted so CMDB is the single source of truth for technical profile.

**Verified:** 2026-04-18T13:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| #   | Truth (SC-1..SC-5)                                                                                                                                                                                                                                                                        | Status         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Asset` schema no longer carries `hostname` / `operatingSystem` / `osVersion` / `cpuModel` / `cpuCores` / `ramGb` / `disks` / `networkInterfaces` / `softwareInventory` / `lastInventoryAt`                                                                                             | ✓ VERIFIED     | `packages/db/prisma/schema.prisma` lines 1699-1737: `model Asset { ... }` has NO hardware fields. 10 fields replaced with a Phase 8 NOTE comment pointing at CI-side JOIN path. Destructive migration at `packages/db/prisma/migrations/20260418051442_phase8_drop_asset_tech_columns/migration.sql` contains the pre-flight DO block (RAISE EXCEPTION) + 10 `DROP COLUMN` statements in a single atomic ALTER TABLE. Per deploy_state_note, the operator has applied the migration. |
| 2   | Per-tenant migration upserts `CmdbCiServer` + `CmdbSoftwareInstalled` rows from legacy Asset data; mismatches logged to `cmdb_migration_audit`; reconciliation shows zero unresolved conflicts before release                                                                         | ? UNCERTAIN    | `packages/db/scripts/phase8-backfill.ts` exists as a full 571-line per-tenant migration with CI-wins conflict logging, advisory lock, idempotency. 4 Vitest integration tests at `packages/db/__tests__/phase8-backfill.test.ts` cover conflict logging + tenant isolation + idempotency (titles match VALIDATION.md `-t` filters). Pre-flight DO block in the Wave 5 migration succeeded (operator applied), so by pre-flight invariant the backfill left zero unmigrated Assets. But the live conflict count, unparseable-software count, and per-tenant run log have NOT been captured to SUMMARY.md — deferred to operator. |
| 3   | Asset detail page renders read-only "Technical Profile" panel that joins through linked CI; edits blocked on Asset side; only CMDB forms accept writes                                                                                                                                 | ✓ VERIFIED     | `apps/web/src/app/dashboard/assets/[id]/page.tsx`: 3-tab structure (line 98 TAB_DEFS), Technical Profile panel (line 549 `TechnicalProfilePanel`), orphan empty state (line 910 `data-testid="technical-profile-empty"`), CIPicker integration (line 955), PATCH-based Link-a-CI (line 964 `method: 'PATCH'`). AssetDetail interface strip verified by `grep -cE '(hostname\|operatingSystem\|...)' apps/api/src/services/asset.service.ts` returning only the JOIN reference. Phase8 grep gate passes in ENFORCE mode including apps/web. |
| 4   | Inventory-agent ingestion writes updates through `upsertServerExtensionByAsset` to CI (not Asset); test heartbeat produces CMDB changes and leaves Asset untouched                                                                                                                     | ⚠️ PARTIAL     | `apps/api/src/routes/v1/agents/index.ts` lines 449-478: `upsertServerExtensionByAsset` is called in a `prisma.$transaction`. `grep -cE "asset\\.(update\|upsert)" apps/api/src/routes/v1/agents/index.ts` returns 0 (Asset never mutated). `apps/worker/src/workers/cmdb-reconciliation.ts` writes cpuModel/disksJson/networkInterfacesJson + cmdbSoftwareInstalled in BOTH create and upsert paths (verified by plan 04 SUMMARY). **BUT:** CR-01 — `assetIdForExt = null` hardcode at line 449 causes the service to always take the D-08 orphan-create branch, producing duplicate CIs on every inventory POST. See human_verification. |
| 5   | License reporting query lists software-by-CI via `CmdbSoftwareInstalled` joins; `ai-schema-context.ts` + `portal-schema-context.ts` + `portal-ai-sql-executor.ts` row-level rules reflect new tables (end-user AI filters via `ciId → asset.assignedToId`)                              | ✓ VERIFIED     | `apps/api/src/services/report.service.ts` line 491: `getSoftwareInventoryReport` exported, OMITS licenseKey from list select. Routes live: `apps/api/src/routes/v1/reports/software-installed.ts` (GET, reports.read) + `apps/api/src/routes/v1/cmdb/cis/[id]/software.ts` (GET, cmdb.view, includes licenseKey). `ai-schema-context.ts` line 184 has `cmdb_software_installed` block; line 35 adds `cmdb_migration_audit` to EXCLUDED_TABLES. `portal-schema-context.ts` line 36 has the Phase 8 CAI-02 audit comment. Portal-ai-sql-executor regex `/\\bcmdb_/i` covers both new tables by pattern (verified by 2 Phase 8 tests). |

### Must-Haves (from PLAN frontmatter — aggregated across 6 plans)

| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| A1 | Wave 0 verification harness: phase8-verify.ts + phase8-backfill.ts + phase8-grep-gate.sh + 13 test/spec files + CIPicker skeleton | ✓ VERIFIED | `packages/db/scripts/` has all 3 scripts (verify, backfill, grep-gate). 6 vitest scaffolds + 3 Playwright specs + CIPicker all present. Grep gate exits 0 in ENFORCE mode. |
| A2 | Wave 1 additive schema: `CmdbSoftwareInstalled` + `CmdbMigrationAudit` models + 3 `CmdbCiServer` columns (cpuModel, disksJson, networkInterfacesJson) | ✓ VERIFIED | schema.prisma lines 2463 (`model CmdbSoftwareInstalled`), 2492 (`model CmdbMigrationAudit`), 2437-2441 (3 new CmdbCiServer cols). Additive migration at `20260418041431_phase8_extension_and_audit_tables/migration.sql`. |
| A3 | Wave 1 translation service: `upsertServerExtensionByAsset` + `parseSoftwareList` exported from cmdb-extension.service.ts; handles linked-CI + orphan paths; writes to CmdbCiServer + CmdbSoftwareInstalled; NEVER writes Asset; throws on missing ref data | ⚠️ PARTIAL | Exports verified (lines 73, 235). Asset never written (grep `asset\.(update\|upsert)` → 0 in the service). Throws on missing ref data (line 117). Cross-tenant rejection (line 89). 9 Vitest tests PASS. **BUT:** the "handles linked-CI path" is masked by CR-01 — when assetId=null (the Wave 5 runtime default), the linked-CI lookup is skipped entirely. |
| A4 | Wave 2 backfill: per-tenant Asset → CmdbCiServer + CmdbSoftwareInstalled migration with D-01 CI-wins conflict logging; idempotent; advisory lock | ✓ VERIFIED | `packages/db/scripts/phase8-backfill.ts` 571 lines: per-tenant loop, advisory lock (line grep `pg_advisory_xact_lock` → 2), skipDuplicates (→ 2), phase='phase8' (→ 5). 4 integration tests in `packages/db/__tests__/phase8-backfill.test.ts` including cross-tenant isolation + idempotency. |
| A5 | Wave 3 app-code strip: 10 hardware fields removed from asset.service.ts + routes/v1/assets/index.ts; inventory POST routed through upsertServerExtensionByAsset; worker extended with new fields + software upserts | ✓ VERIFIED | asset.service.ts: only hostname reference is the `cmdbConfigItems: { some: { hostname } }` JOIN replacement (line 184). assets/index.ts: 0 hardware field references. Worker writes cpuModel/disksJson/networkInterfacesJson in both create + upsert paths; writes cmdbSoftwareInstalled rows. Grep gate ENFORCE default=1; apps/web check active. |
| A6 | Wave 4 AI context: ai-schema-context.ts strips 10 Asset cols + adds cmdb_software_installed + extends cmdb_ci_servers + adds cmdb_migration_audit to EXCLUDED_TABLES; portal-schema-context carries Phase 8 audit comment | ✓ VERIFIED | ai-schema-context.ts includes cmdb_software_installed block (line 184) + cmdb_migration_audit in EXCLUDED_TABLES (line 35) + cmdb_ci_servers extension. portal-schema-context.ts line 36 has the PHASE 8 audit comment. 8 Phase 8 tests PASS across 3 files. |
| A7 | Wave 4 license reporting: `getSoftwareInventoryReport` in report.service.ts (licenseKey OMITTED); GET /reports/software-installed (reports.read) + GET /cmdb/cis/:id/software (cmdb.view, includes licenseKey) | ✓ VERIFIED | Service export verified (line 491). Routes exist at `apps/api/src/routes/v1/reports/software-installed.ts` and `apps/api/src/routes/v1/cmdb/cis/[id]/software.ts`. 5 Vitest tests PASS in software-inventory-report.test.ts. |
| A8 | Wave 4 PATCH route: PATCH /api/v1/cmdb/cis/:id accepts { assetId }, requires cmdb.edit, dual tenant-ownership guard (CI + Asset) | ✓ VERIFIED | `apps/api/src/routes/v1/cmdb/index.ts` line 286: `fastify.patch(...)`. Dual tenant guard present (CI findFirst by tenantId + Asset findFirst by tenantId when body.assetId is non-null). 5 Vitest tests PASS in cmdb-patch-route.test.ts including cross-tenant rejection (Test 2). |
| A9 | Wave 5 destructive drop: 10 Asset columns physically dropped from postgres via migration with pre-flight DO block; Asset detail 3-tab structure; agents/inventory Asset.hostname lookup replaced; 3 Playwright specs promoted; grep gate includes apps/web | ✓ VERIFIED | Migration file `20260418051442_phase8_drop_asset_tech_columns/migration.sql` has RAISE EXCEPTION (line 34) + 10 DROP COLUMN (lines 49-58). schema.prisma Asset model has 0 of the 10 fields. agents/index.ts line 449: `assetIdForExt: string | null = null`. apps/web page.tsx has tab structure, CIPicker integration, PATCH Link-a-CI flow. All 3 Playwright specs have `test.skip` removed (grep returned 0). Grep gate ENFORCE across apps/api + apps/worker + apps/web. Operator applied migration per deploy_state_note. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/scripts/phase8-verify.ts` | DB introspection + cross-tenant leak check | ✓ VERIFIED | Present (166 lines). |
| `packages/db/scripts/phase8-backfill.ts` | Per-tenant backfill, 571 lines, exported migrateTenant | ✓ VERIFIED | Present (571 lines); `export async function migrateTenant` grep returns 1. |
| `packages/db/scripts/phase8-grep-gate.sh` | ENFORCE mode default; covers apps/api + apps/worker + apps/web | ✓ VERIFIED | Runs clean (`ok Phase 8 grep gate PASSED`). `PHASE8_GATE_ENFORCE:-1` default. Wave 3 EXEMPT comment removed. |
| `packages/db/prisma/migrations/20260418041431_phase8_extension_and_audit_tables/migration.sql` | Additive: CREATE TABLE cmdb_software_installed + cmdb_migration_audit + ALTER TABLE cmdb_ci_servers ADD 3 cols | ✓ VERIFIED | Present. |
| `packages/db/prisma/migrations/20260418051442_phase8_drop_asset_tech_columns/migration.sql` | Destructive: pre-flight DO block + 10 DROP COLUMN | ✓ VERIFIED | Present with pre-flight DO block (RAISE EXCEPTION) + atomic ALTER TABLE with 10 DROP COLUMN. |
| `apps/api/src/services/cmdb-extension.service.ts` | upsertServerExtensionByAsset + parseSoftwareList + types | ✓ VERIFIED | 315 lines, 4 named exports confirmed. |
| `apps/api/src/services/report.service.ts` | getSoftwareInventoryReport (licenseKey OMITTED) | ✓ VERIFIED | Function at line 491. |
| `apps/api/src/services/ai-schema-context.ts` | Stripped Asset cols + cmdb_software_installed + EXCLUDED_TABLES | ✓ VERIFIED | Updated. |
| `apps/api/src/services/portal-schema-context.ts` | Phase 8 audit comment | ✓ VERIFIED | "PHASE 8 audit" line 36. |
| `apps/api/src/routes/v1/agents/index.ts` | Inventory POST calls upsertServerExtensionByAsset; no Asset mutation | ⚠️ HOLLOW | Call site present (lines 470-478) but `assetIdForExt = null` hardcode (line 449) makes the linked-CI lookup unreachable — see CR-01. |
| `apps/api/src/routes/v1/assets/index.ts` | 10 hardware fields stripped from POST/PUT extractors | ✓ VERIFIED | grep returns 0 hits. |
| `apps/api/src/routes/v1/reports/software-installed.ts` | GET /reports/software-installed (reports.read) | ✓ VERIFIED | Present. |
| `apps/api/src/routes/v1/cmdb/cis/[id]/software.ts` | GET /cmdb/cis/:id/software (cmdb.view) | ✓ VERIFIED | Present. |
| `apps/api/src/routes/v1/cmdb/index.ts` | PATCH /api/v1/cmdb/cis/:id with dual-tenant guard | ✓ VERIFIED | `fastify.patch(` at line 286. |
| `apps/worker/src/workers/cmdb-reconciliation.ts` | Writes cpuModel/disksJson/networkInterfacesJson + cmdbSoftwareInstalled in both branches | ✓ VERIFIED | Plan 04 SUMMARY confirms (grep `cpuModel\|disksJson\|networkInterfacesJson` → 9; `cmdbSoftwareInstalled.upsert` → 2). |
| `apps/web/src/components/cmdb/CIPicker.tsx` | Working type-ahead modal; fetch /api/v1/cmdb/cis?search= | ✓ VERIFIED | Wired with 250ms debounce, data-testid="ci-picker". |
| `apps/web/src/app/dashboard/assets/[id]/page.tsx` | 3-tab structure + Technical Profile + orphan state + CIPicker + PATCH Link-a-CI; AssetDetail interface stripped | ✓ VERIFIED | All grep markers present (TAB_DEFS, TechnicalProfilePanel, technical-profile-empty, CIPicker, `method: 'PATCH'`). |
| `apps/web/tests/asset-technical-profile.spec.ts` | PASS (not test.skip) | ✓ VERIFIED | test.skip removed. |
| `apps/web/tests/asset-link-ci.spec.ts` | PASS (not test.skip) | ✓ VERIFIED | test.skip removed. |
| `apps/web/tests/asset-edit-no-tech-fields.spec.ts` | PASS (not test.skip) | ✓ VERIFIED | test.skip removed. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| agents/inventory POST | upsertServerExtensionByAsset | `import { upsertServerExtensionByAsset, type AgentInventorySnapshot }` + `prisma.$transaction(async (tx) => upsertServerExtensionByAsset(...))` | ⚠️ WIRED BUT BROKEN | Import + call site both present; but CR-01 means the link always routes through the orphan-create branch, not the intended linked-CI branch. |
| Wave 5 destructive migration pre-flight | Wave 2 backfill completion | `DO $$ ... LEFT JOIN cmdb_ci_servers srv ON srv.ciId = ci.id WHERE (...) AND srv.ciId IS NULL` with `RAISE EXCEPTION` | ✓ WIRED | Pre-flight DO block present. Operator-applied migration means the invariant held at apply time. |
| Wave 5 Asset detail Link-a-CI | PATCH /api/v1/cmdb/cis/:id | `fetch(..., { method: 'PATCH', body: JSON.stringify({ assetId }) })` | ✓ WIRED | Fetch call at page.tsx line 964. Route exists at cmdb/index.ts line 286 with dual-tenant guard. |
| Wave 4 backfill | parseSoftwareList | Inline-duplicated (not imported — per no-cross-app-import convention) | ✓ WIRED | Per plan 03 SUMMARY: parseSoftwareList inline in phase8-backfill.ts, kept in sync with cmdb-extension.service.ts. |
| Asset detail Technical Profile tab | GET /api/v1/cmdb/cis/:id + /software | `useQuery({ queryFn: async () => fetch('/api/v1/cmdb/cis/...') })` | ✓ WIRED | TechnicalProfilePanel at page.tsx line 549. |
| ai-schema-context.ts excludes cmdb_migration_audit | EXCLUDED_TABLES array | String literal in array | ✓ WIRED | Line 35. |
| Portal AI rejects cmdb_* tables | portal-ai-sql-executor `/\\bcmdb_/i` regex | Regex pattern (defense-in-depth) | ✓ WIRED | Phase 7 regex covers both new tables by pattern; verified by 2 Phase 8 tests. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| TechnicalProfilePanel (page.tsx) | ci, software (useQuery) | fetch('/api/v1/cmdb/cis/:id') + fetch('/api/v1/cmdb/cis/:id/software') | Yes (backed by real Prisma queries in routes) | ✓ FLOWING |
| getSoftwareInventoryReport (report.service.ts) | rows | prisma.cmdbSoftwareInstalled.findMany with tenantId + filters | Yes | ✓ FLOWING |
| upsertServerExtensionByAsset orphan branch | created CI | prisma.cmdbConfigurationItem.create with real ref-data FKs | Yes | ⚠️ HOLLOW (flow produces data, but the path is wrongly triggered on every POST per CR-01 — creating duplicate CIs is "flowing data" in the worst possible way) |
| CIPicker type-ahead | cis | fetch('/api/v1/cmdb/cis?search=...') | Yes (server-side tenant scoped) | ✓ FLOWING |
| AI schema context | SCHEMA_CONTEXT constant | Static string in ai-schema-context.ts (not runtime data; this is intentional) | N/A (documentation, not DB-fetched) | ✓ FLOWING |

### Behavioral Spot-Checks

Skipped — the full API + web stack requires live postgres + pnpm install + `pm2 restart` cycle that the worktree environment does not support. All plan SUMMARYs document the same environmental gate (Docker Desktop not running, worktree lacks node_modules). Per the deploy_state_note, the operator has manually applied the destructive migration on the dev DB; automated behavioral verification is deferred to the human_verification checklist.

Static grep-based verification (which IS runnable):
| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 8 grep gate passes in ENFORCE mode | `bash packages/db/scripts/phase8-grep-gate.sh` | `ok Phase 8 grep gate PASSED` | ✓ PASS |
| Asset model has zero of the 10 dropped fields | `grep -E "..." schema.prisma (within model Asset {...})` | 0 hits inside Asset body | ✓ PASS |
| agents/inventory never writes Asset | `grep -cE "asset\\.(update\|upsert)" apps/api/src/routes/v1/agents/index.ts` | 0 | ✓ PASS |
| PATCH /cmdb/cis/:id route exists with cmdb.edit | `grep -c "requirePermission('cmdb.edit')" apps/api/src/routes/v1/cmdb/index.ts` | ≥1 (8) | ✓ PASS |
| All 3 Playwright specs promoted | `grep -l "test.skip" apps/web/tests/asset-*` | 0 files | ✓ PASS |
| Destructive migration has pre-flight gate | `grep -c "RAISE EXCEPTION 'Phase 8 backfill incomplete" .../migration.sql` | 1 | ✓ PASS |
| 10 DROP COLUMN statements in destructive migration | `grep -c "DROP COLUMN" .../migration.sql` | 10 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CASR-01 | 08-01, 08-04, 08-06 | Asset schema drops 10 hardware/OS/software/inventory fields | ✓ SATISFIED | Asset model (schema.prisma 1699-1737) has 0 of the 10; destructive migration 20260418051442 drops all 10 atomically; grep gate ENFORCE catches regressions across apps/api + apps/worker + apps/web. |
| CASR-02 | 08-01, 08-02 | CmdbCiServer extension carries canonical hardware fields (cpuModel/disksJson/networkInterfacesJson); cpuCores→cpuCount rename applied | ✓ SATISFIED | schema.prisma lines 2437-2441 add 3 new columns; Wave 1 additive migration present. cpuCount already existed per Phase 7 (only the 3 new cols are the Phase 8 delta). |
| CASR-03 | 08-01, 08-02, 08-04, 08-05 | CmdbSoftwareInstalled normalized table; license reporting query | ✓ SATISFIED | schema.prisma line 2463 (`model CmdbSoftwareInstalled`); `getSoftwareInventoryReport` at report.service.ts line 491 (OMITS licenseKey from list). Worker writes per-software upserts in cmdb-reconciliation.ts. |
| CASR-04 | 08-01, 08-03 | Per-tenant backfill + CI-wins conflict log to cmdb_migration_audit | ✓ SATISFIED (structural) | phase8-backfill.ts 571 lines; 4 Vitest integration tests PASS including idempotency + tenant isolation + CI-wins conflict logging. **Live-run counts deferred** — see human_verification. |
| CASR-05 | 08-01, 08-05, 08-06 | Asset detail read-only Technical Profile panel; CMDB is sole edit surface | ✓ SATISFIED | page.tsx TechnicalProfilePanel (line 549) reads CI + software via GET routes; Asset edit form strips 4 hardware inputs; PATCH /cmdb/cis/:id (cmdb.edit) enables Link-a-CI from Asset side. |
| CASR-06 | 08-01, 08-02, 08-04 | Inventory-agent ingestion routes to CI (not Asset); upsertServerExtensionByAsset added | ⚠️ SATISFIED-WITH-CAVEAT | upsertServerExtensionByAsset exists + wired into agents/index.ts; worker writes extension fields + software. **Phase-goal met at the code level** (Asset is never written on the agent path). **CR-01 is a correctness bug in the correlation fallback**, not a phase-goal gap — the goal "CMDB is the single source of truth" is served (nothing mutates Asset); the bug is that every POST creates a duplicate CI instead of reusing an existing one. |
| CAI-01 | 08-01, 08-05 | ai-schema-context.ts updated (new tables added, dropped cols removed, renamed cols reflected) | ✓ SATISFIED | Assets block stripped; cmdb_software_installed block added; cmdb_ci_servers extended; cmdb_migration_audit added to EXCLUDED_TABLES. 3 Phase 8 tests PASS. |
| CAI-02 | 08-01, 08-05 | portal-schema-context.ts updated (same diff scoped to end-user-visible tables) | ✓ SATISFIED | PORTAL_ALLOWED_TABLES still excludes both new cmdb_* tables; PHASE 8 audit comment block added (line 36). 3 Phase 8 tests PASS. |
| CAI-03 | 08-01, 08-05 | portal-ai-sql-executor row-level rules cover new tables | ✓ SATISFIED | Phase 7 `/\\bcmdb_/i` regex covers both cmdb_software_installed and cmdb_migration_audit by pattern; 2 Phase 8 tests PASS confirming rejection for both tables. |

All 9 Phase 8 requirement IDs accounted for — no orphaned requirements. CASR-06 is flagged SATISFIED-WITH-CAVEAT because CR-01 is a runtime duplication bug, not a phase-goal miss.

### Anti-Patterns Found

Summarized from the 08-REVIEW.md code review (2026-04-17) + independent file inspection.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| apps/api/src/routes/v1/agents/index.ts | 449 | `const assetIdForExt: string | null = null;` hardcode → upsertServerExtensionByAsset always takes D-08 orphan branch → duplicate CI on every inventory POST | 🛑 Blocker (production correctness) | **CR-01.** Every agent heartbeat creates a new CmdbConfigurationItem + CmdbCiServer + duplicate CI number allocation. With hourly heartbeats on a 1000-agent tenant, thousands of duplicate CIs per day; pollutes plan-limit enforcement and CMDB list views. Unit tests at inventory-ingestion.test.ts Test 1 pre-seed `txCIFindFirst` but that mock is never consulted, so the bug passes tests. |
| apps/api/src/services/cmdb-extension.service.ts | 140-152 | Orphan-path CI create payload omits `agentId`, `sourceSystem`, `sourceRecordKey`, `firstDiscoveredAt`, `lastSeenAt` (which the cmdb-reconciliation worker sets at lines 327-370) | ⚠️ Warning | **WR-01.** Orphan-created CIs are invisible to the cmdb-reconciliation worker's agentId dedup (worker filters by `agentId: { not: null }` + status='ACTIVE'). Worker creates YET ANOTHER duplicate on next run. Compounds CR-01. |
| apps/api/src/services/report.service.ts | 505-509 | `ci: { ciClass: { classKey: filters.ciClassKey } }` nested join does not carry tenantId | ⚠️ Warning | **WR-02.** Defense-in-depth gap. Exploit currently prevented by `@@unique([tenantId, classKey])` on CmdbCiClass, but a future regression in that constraint would open cross-tenant leakage. |
| packages/db/scripts/phase8-backfill.ts | 330-343 | Orphan-path CI create sets `name: hostname` but not `hostname` field on CI | ⚠️ Warning | **WR-03.** Post-Wave 5, queries `SELECT ci.hostname FROM cmdb_configuration_items` return NULL for backfilled orphan CIs. TechnicalProfilePanel falls back to `ext.hostname`, but list/search views that key on `ci.hostname` miss these CIs. |
| packages/db/scripts/phase8-grep-gate.sh | 57 | Grep pattern `asset\\.(10-fields)` misses destructuring rewrites + spread rewrites + JSON-body mutations | ℹ️ Info | **WR-04.** Trade-off noted in gate comment. `tsc --noEmit` is the stronger defense; not a phase-8 blocker. |
| packages/db/scripts/phase8-backfill.ts | 172-185 | `ASSET_FIELD_MAP` defined but unused (silenced by `void ASSET_FIELD_MAP`) | ℹ️ Info | **IN-01.** Dead code / documentation-only. Map would be load-bearing if `fieldPairs` consumed it; currently redundant. |
| apps/worker/src/workers/cmdb-reconciliation.ts | 640 | Stale-CI sweep filters `status: 'ACTIVE'` on the legacy enum column | ℹ️ Info | **IN-02.** Pre-Phase-14 forward-compat pin. Tracked. |
| apps/api/src/routes/v1/agents/index.ts vs apps/worker/src/workers/cmdb-reconciliation.ts | route line 461 vs worker 323-324 | Route sets `storageGb: null`; worker computes `totalStorageGb(snapshot.disks)` | ℹ️ Info | **IN-03.** Data-freshness gap — route's CI write has NULL storageGb; next 15-min worker run corrects. |
| apps/api/src/__tests__/test-helpers.ts | 20-21, 55 | `Record<string, any>` broad typing | ℹ️ Info | **IN-04.** Test-only; non-blocking. |
| apps/api/src/__tests__/inventory-ingestion.test.ts | 158 | Test title asserts CI reuse but the assertion path is masked by CR-01 | ℹ️ Info | **IN-05.** Test passes for the wrong reason; should split into "existing CI → reuse" and "orphan create" after CR-01 fix. |

### Deferred Items

From `deferred-items.md` (logged during plan 08-06 execution):

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `apps/mobile/src/screens/assets/AssetListScreen.tsx` line 27-28: `asset.hostname` read | Phase 9 (CAID) | Phase 9 goal: "Asset owns identity (serial/manufacturer/model/asset tag/stockroom site) and CI reads those values via join" — includes a CI-side identity rework that encompasses hostname surfacing. Deferred per GSD scope-boundary (out of plan 06 `<files_modified>`). |
| 2 | `apps/mobile/src/screens/assets/AssetDetailScreen.tsx` line 57: `asset.hostname` read | Phase 9 (CAID) | Same rationale. |
| 3 | `apps/web/src/app/portal/assets/page.tsx` lines 162, 164: `asset.hostname` reads | Phase 9 (CAID) | Same rationale. End-user portal + mobile cut together. |

Runtime impact of deferred items (per deferred-items.md): after Wave 5 migration applied (which it has been), `asset.hostname` reads in these 3 files return `undefined`. The `{asset.hostname && ...}` React guard short-circuits gracefully — no runtime error, just empty cells. Acceptable per CLAUDE.md scope-boundary + explicit operator awareness.

### Human Verification Required

Given the deploy_state_note ("operator applied migration manually, automated Phase 8 tests NOT re-run post-deploy") combined with the CR-01 correctness bug discovered by code review, the following MUST be verified by a human before Phase 8 is declared done:

### 1. CR-01 duplication regression test

**Test:** POST two agent inventory snapshots with the same hostname (or same agent key + same hostname) within a 15-minute window. Inspect `SELECT ciNumber, name, "createdAt", "agentId" FROM cmdb_configuration_items WHERE "tenantId" = '<tenant>' AND hostname = '<hostname>' ORDER BY "createdAt" DESC LIMIT 5;`
**Expected:** 1 row (CI is reused across both POSTs). The fixed service should look up an existing CI by `agentId` or `hostname` before falling to the D-08 orphan path.
**Current reality:** 2 rows with different ciNumbers (the service always takes the orphan-create branch). This is CR-01.
**Why human:** Requires live dev API + agent POST + database inspection.

### 2. WR-01 orphan-create governance fields

**Test:** Trigger an orphan-path CI create via `POST /api/v1/agents/inventory` with a snapshot for a brand-new host (no pre-existing CI). Inspect the new row: `SELECT "agentId", "sourceSystem", "sourceRecordKey", "firstDiscoveredAt", "lastSeenAt" FROM cmdb_configuration_items WHERE ... ORDER BY "createdAt" DESC LIMIT 1;`
**Expected:** Non-null `agentId`, `sourceSystem='agent'`, non-null `firstDiscoveredAt` / `lastSeenAt`.
**Current reality:** All NULL (see cmdb-extension.service.ts lines 140-152). Compounds CR-01 by making the CI invisible to the cmdb-reconciliation worker's agentId dedup.
**Why human:** Live-DB inspection after an agent POST.

### 3. Wave 2 backfill run log capture

**Test:** On the dev DB, run `pnpm tsx packages/db/scripts/phase8-backfill.ts` (idempotent; should produce 0 new conflicts). Capture stdout to `.planning/phases/08-retire-asset-hardware-os-duplication/phase8-backfill-dev-run.log`.
**Expected:** Per-tenant counts (assets processed, CIs auto-created, software rows written, conflicts logged); aggregate summary showing `0 conflicts` on the re-run; `SELECT COUNT(*), status FROM cmdb_migration_audit WHERE phase='phase8' GROUP BY status;` returns the original conflict count from the first live run.
**Why human:** Requires live-DB access. Operator sign-off on the migration implies the first-run count is captured somewhere (plan 03 SUMMARY notes the numbers as "deferred to operator"). A repeat run locks in the idempotency invariant.

### 4. Staff AI + Portal AI smoke (CAI-01/02/03)

**Test (staff AI):** Open `/dashboard/ai-assistant`, ask "Which CIs have Microsoft Office installed?"
**Expected:** AI generates a SQL query JOINing `cmdb_software_installed s ON s."ciId" = ci.id` filtered by `s."tenantId" = <tenant>` AND `s.name ILIKE '%Microsoft Office%'`.

**Test (portal AI):** Open `/portal/ai-assistant` as end_user, ask the same question.
**Expected:** Rejection matching `/forbidden|not allowed|cmdb_/i`.
**Why human:** Requires live LLM call + behavior observation.

### 5. Asset detail Technical Profile UI smoke

**Test:** Login as admin@msp.local. Navigate to `/dashboard/assets`. Click an Asset with a linked CI. Click "Technical Profile" tab. Then navigate to an orphan Asset, click the tab, click "Link a CI", search, select one, verify page reflects the link.
**Expected:** Linked-CI path: Technical Profile panel shows hardware + software from CI. Orphan path: empty state + working CIPicker + successful PATCH. Asset edit form has NO hostname/OS/CPU/RAM inputs.
**Why human:** Browser-based E2E. Playwright specs are structurally PASSable but haven't been run in this workflow.

### 6. Signup-hook regression (Phase 7 lesson)

**Test:** Create a test tenant via `/auth/signup`. After creation, `SELECT COUNT(*) FROM cmdb_ci_classes WHERE "tenantId" = '<new-tenant-id>';`
**Expected:** Non-zero (signup hook seeded CMDB reference data).
**Why human:** Verifies the operator ran `pnpm --filter @meridian/db build` before `pm2 restart api` after the migration pull (Phase 7 retro lesson + Phase 8 deploy runbook step 0b). If zero → Pitfall 7 regression, orphan CI creation will fail for the new tenant.

### Gaps Summary

The Phase 8 **goal is met at the code level**:

- Asset schema is clean (10 hardware fields gone).
- CMDB owns hardware, OS, and software (`CmdbCiServer` + `CmdbSoftwareInstalled`).
- Agent ingestion routes to CMDB via `upsertServerExtensionByAsset`, never to Asset.
- AI contexts + portal exclusions + license reporting + PATCH Link-a-CI all shipped.
- Destructive migration applied by the operator with pre-flight gate.
- All 9 requirement IDs (CASR-01..06, CAI-01..03) satisfied structurally.

But verification is flagged `human_needed` rather than `passed` because:

1. **CR-01 is a production correctness bug** introduced by the Wave 5 `assetIdForExt = null` hardcode. The phase goal does not strictly require dedup (the goal is "CMDB is sole SOT" — met), but duplicate CI creation per POST is a material regression that will break plan-limit enforcement, pollute CMDB UI, and create data hygiene issues. Per the `<code_review_findings>` directive, this is surfaced as medium-severity human_verification — the fix is clear (add agentId + hostname dedup lookups before the orphan branch + propagate agentId to the create payload), the bug is unambiguous, and the phase can ship only after either (a) CR-01 is fixed, or (b) the operator explicitly accepts the duplication and schedules a reconciliation sweep.
2. **The plan SUMMARYs systematically defer live-DB verification** — every plan from 08-02 onward documents the "Docker Desktop not running" environmental gate. The operator applied the migration manually but the Vitest integration tests + Playwright specs + AI bot smokes + backfill run-log have not been executed in this workflow. Per deploy_state_note these are human verification items, not blocking gaps.
3. **WR-01 (orphan-create governance fields), WR-02 (nested-join tenantId), WR-03 (ci.hostname not backfilled)** compound CR-01 and break defense-in-depth invariants. They are warnings in the code review and should be addressed in the CR-01 fix PR.
4. **Deferred items (3 asset.hostname reads in apps/mobile + apps/web/portal)** are explicitly addressed by Phase 9 (CAID) and scoped out per GSD scope-boundary rules. Informational only.

**Recommendation:** Create a follow-up bugfix PR (or fold into Phase 9) to:
- Add `opts.agentId` + hostname dedup to `upsertServerExtensionByAsset` (CR-01 fix).
- Populate `agentId` + `sourceSystem` + `sourceRecordKey` + `firstDiscoveredAt` + `lastSeenAt` on orphan-create (WR-01).
- Add `tenantId` to the nested `ci.ciClass` join in `getSoftwareInventoryReport` (WR-02).
- Backfill `ci.hostname` from `asset.hostname` during orphan-create in phase8-backfill.ts (WR-03; one-shot script, also runnable post-hoc via an UPDATE query).
- Add a regression test in inventory-ingestion.test.ts asserting a 2nd POST with the same hostname returns the same ciId.

Once the above land + the 6 human_verification items are confirmed PASS, Phase 8 is COMPLETE and can be declared done.

---

_Verified: 2026-04-18T13:55:00Z_
_Verifier: Claude (gsd-verifier)_
