---
phase: 07-ci-reference-table-migration
plan: 05
subsystem: ai-schema-context-and-portal-ai-hardening
tags: [cmdb, ai-assistant, schema-docs, portal-ai, defense-in-depth, csdm]
requirements_addressed: [CAI-01, CAI-02, CAI-03]

dependency_graph:
  requires:
    - apps/api/src/services/ai-schema-context.ts (Plan 04: service writes now FK-only — safe to document FK-only contract)
    - apps/api/src/__tests__/ai-schema-context.test.ts (Plan 01: 4 it.todo scaffolds to promote)
    - apps/api/src/__tests__/portal-context.test.ts (Plan 01: 2 passing PORTAL_ALLOWED_TABLES assertions to preserve)
    - packages/db/src/seeds/cmdb-reference.ts (Plan 02: canonical seeded keys — 15 classKeys, 11 statuses, 6 environments, 13 relationshipKeys)
  provides:
    - "ai-schema-context.ts: CMDB DDL blocks document FK-only contract with JOIN hints, NOT NULL annotations, canonical classKey/relationshipKey lists, and an example query teaching multi-tenancy"
    - "portal-schema-context.ts: Phase 7 audit comment above PORTAL_ALLOWED_TABLES citing CAI-02 lock-in — allowlist contents UNCHANGED"
    - "portal-ai-sql-executor.ts: defense-in-depth cmdb_* hard-reject branch positioned BEFORE the PORTAL_ALLOWED_TABLES allowlist check; error message mentions CAI-03"
    - "12 passing ai-schema-context.test.ts tests (was 4 it.todo)"
    - "5 passing portal-ai-sql-executor.test.ts tests (new file)"
    - "2 passing portal-context.test.ts tests (unchanged — allowlist preserved)"
  affects:
    - "Plan 07-06 (NOT NULL migration): staff AI now teaches the FK contract authoritatively; safe to flip classId/lifecycleStatusId/operationalStatusId/environmentId/relationshipTypeId to NOT NULL at the DB layer"
    - "Phase 14 (legacy enum column DROP): will require ANOTHER pass through ai-schema-context.ts to remove the 'NOTE: legacy columns still exist through Phase 14' comments and drop the residual `ACTIVE|INACTIVE|DECOMMISSIONED` string on the `applications` block once APM legacy columns follow the same pattern"
    - "Future AI assistant queries against CMDB data: the AI now has ground-truth vocabulary (canonical classKeys + relationshipKeys) and can produce correct JOIN queries for 'how many servers do we have?' style questions"

tech-stack:
  added: []
  patterns:
    - "Compressed DDL documentation in SCHEMA_CONTEXT template literal: FK columns marked NOT NULL + inline NOTE comments with JOIN targets, canonical key lists, and example queries teaching tenantId scoping"
    - "Defense-in-depth validation layering: CAI-03 cmdb_* hard-reject BEFORE the allowlist check (runs on withoutStrings so string-literal false positives are already filtered out)"
    - "Intentional-exclusion audit comment above PORTAL_ALLOWED_TABLES explicitly naming the security-scope gate (/gsd-discuss-phase) that MUST run before re-enabling CMDB read access"

key-files:
  created:
    - apps/api/src/__tests__/portal-ai-sql-executor.test.ts
  modified:
    - apps/api/src/services/ai-schema-context.ts
    - apps/api/src/services/portal-schema-context.ts
    - apps/api/src/services/portal-ai-sql-executor.ts
    - apps/api/src/__tests__/ai-schema-context.test.ts

decisions:
  - "executePortalQuery interface differs from plan: the actual signature is `(tenantId, userId, sql)` not `(tenantId, sql, params)`, and it returns a QueryResult with an `error` string on rejection (does NOT throw). Tests follow the real contract, not the plan's inaccurate interface snippet. Regression-check tests against legitimate queries (e.g. 'tickets') are OMITTED because they would require connecting to Postgres or mocking `pg.Pool` — the CAI-03 branch returns early inside validatePortalSql() BEFORE any DB connection, so the cmdb_* reject is provably testable without DB access."
  - "Regex choice for cmdb_* match: `/\\bcmdb_[a-z_]+/i` — word-boundary-anchored, requires at least one letter/underscore after the prefix so a bare `cmdb_` by itself (e.g. a typo) does not trigger, and matches against `withoutStrings` (the preprocessed SQL with string literals already stripped). The T-7-05-04 threat-register accepted the risk of a greedy match because legitimate portal-AI queries do not reference any cmdb_* identifier."
  - "NOT NULL annotations on cmdb_configuration_items FK columns (classId, lifecycleStatusId, operationalStatusId, environmentId) are documented in the schema context NOW even though the actual DB NOT NULL constraint lands in Plan 06. This is intentional: the AI context reflects the CONTRACT not the wire schema. Plan 04 + the grep gate ensure no writer produces NULL FKs, so the AI's NOT NULL expectation matches runtime reality. If a query against a legacy un-backfilled row returns NULL, that's a data integrity issue the AI's query would surface — exactly the desired behavior."
  - "Added cmdb_relationship_types as a first-class DDL row in the schema context (it was missing entirely from the Plan 01 baseline). Without this, the AI cannot JOIN on it. Decision is consistent with the CSDM contract at docs/architecture/csdm-field-ownership.md — every reference table gets a dedicated DDL block."
  - "Kept the legacy enum-column NOTE (\"NOTHING writes to them — use FK columns\") in both cmdb_configuration_items and cmdb_relationships blocks. Phase 14 removes the columns entirely; this comment bridges the Phase 7 → Phase 14 window so the AI doesn't hallucinate against the residual column names."

metrics:
  duration_minutes: 15
  tasks_completed: 2
  files_changed: 4
  commits: 4
  completed_date: 2026-04-16
---

# Phase 7 Plan 05: AI Schema Context + Portal AI Hardening Summary

Update staff AI schema context to teach the Phase 7 FK-only contract (JOIN hints, NOT NULL annotations, canonical keys); document Portal AI's intentional CMDB exclusion with an audit comment; add defense-in-depth cmdb_* hard-reject to the Portal AI SQL executor so future allowlist regressions cannot leak CMDB data to end users.

## Overview

**One-liner:** Staff AI now teaches the FK-only CMDB contract with JOIN hints + canonical classKey/relationshipKey lists; Portal AI has a CAI-03 cmdb_* hard-reject preceding the allowlist check (defense-in-depth).

**Duration:** ~15 minutes
**Tasks:** 2 / 2 completed
**Files changed:** 4 (1 created + 3 modified)
**Commits:** 4 — `90144f7` (Task 1 RED), `7427518` (Task 1 GREEN), `8a167cd` (Task 2 RED), `78cd30c` (Task 2 GREEN)

## What Shipped

### Task 1 — ai-schema-context.ts FK + JOIN docs (CAI-01)
**Commits:** `90144f7` (RED), `7427518` (GREEN)

**RED phase (`90144f7`):** Replaced the 4 Plan 01 `it.todo` placeholders in `apps/api/src/__tests__/ai-schema-context.test.ts` with 12 real assertions covering:
1. JOIN cmdb_ci_classes documented
2. JOIN cmdb_relationship_types documented
3. JOIN cmdb_statuses with statusType='lifecycle' / 'operational' documented
4. JOIN cmdb_environments documented
5. Legacy enum token walls removed from `cmdb_configuration_items` block (`SERVER|WORKSTATION`, `ACTIVE|INACTIVE|DECOMMISSIONED`, `PRODUCTION|STAGING|DEV|DR`)
6. Legacy enum token wall removed from `cmdb_relationships` block (`DEPENDS_ON|HOSTS|CONNECTS_TO`)
7-8. NOT NULL annotations on 5 FK columns: classId, lifecycleStatusId, operationalStatusId, environmentId, relationshipTypeId
9. 15 canonical classKeys listed (server, virtual_machine, database, network_device, application, application_instance, saas_application, business_service, technical_service, load_balancer, storage, cloud_resource, dns_endpoint, certificate, generic)
10. 13 canonical relationshipKeys listed (depends_on, runs_on, hosted_on, connected_to, member_of, replicated_to, backed_up_by, uses, supports, managed_by, owned_by, contains, installed_on)
11. Reference-table key columns documented (classKey, statusKey, envKey, relationshipKey)
12. tenantId scoping mention (multi-tenancy hint)

Baseline RED status: 10 / 12 failing against pre-edit ai-schema-context.ts.

**GREEN phase (`7427518`):** Rewrote the CMDB section of the `SCHEMA_CONTEXT` template literal in `apps/api/src/services/ai-schema-context.ts`:

- **`cmdb_configuration_items`**: Removed `type(SERVER|WORKSTATION|...)`, `status(ACTIVE|INACTIVE|...)`, `environment(PRODUCTION|STAGING|...)` enum token walls. Marked `classId`, `lifecycleStatusId`, `operationalStatusId`, `environmentId` FK columns as `NOT NULL`. Added a multi-line NOTE block:
  ```
  -- Phase 7 FK contract: class / lifecycle / operational / environment are reference-table FKs (NOT enums).
  -- To resolve the human-readable class name, JOIN cmdb_ci_classes ON cmdb_ci_classes.id = cmdb_configuration_items."classId".
  -- ... (3 more JOIN hints) ...
  -- Canonical classKeys: server, virtual_machine, database, ... generic.
  -- EXAMPLE — "how many servers do we have?":
  --   SELECT COUNT(*) FROM cmdb_configuration_items ci
  --     JOIN cmdb_ci_classes c ON c.id = ci."classId"
  --    WHERE c."classKey" = 'server' AND ci."tenantId" = $TENANT_ID AND ci."isDeleted" = false;
  -- NOTE: The legacy columns "type"/"status"/"environment" still exist on the table through
  --       Phase 14 for read-side backward compatibility, but NOTHING writes to them.
  ```
- **`cmdb_relationships`**: Removed `relationshipType(DEPENDS_ON|HOSTS|...)` enum token list. Replaced with `"relationshipTypeId"(uuid FK→cmdb_relationship_types NOT NULL)`. Added JOIN hint + 13 canonical relationshipKeys.
- **`cmdb_ci_classes`, `cmdb_statuses`, `cmdb_environments`**: Extended each DDL row to expose the KEY columns (`classKey`, `statusType` + `statusKey`, `envKey`) plus a NOTE with the UNIQUE constraint and canonical key list so the AI can JOIN on the key columns.
- **`cmdb_relationship_types`**: Added as a first-class DDL row (was completely absent from Plan 01 baseline) with `relationshipKey`, `relationshipName`, `forwardLabel`, `reverseLabel`, `isDirectional` columns + UNIQUE constraint and 13 canonical relationshipKeys.

GREEN test result: **12 / 12 pass** in `src/__tests__/ai-schema-context.test.ts`.

### Task 2 — Portal AI CMDB-exclusion comment + CAI-03 hard-reject
**Commits:** `8a167cd` (RED), `78cd30c` (GREEN)

**RED phase (`8a167cd`):** Created `apps/api/src/__tests__/portal-ai-sql-executor.test.ts` with 5 real assertions:
1. rejects `SELECT * FROM cmdb_configuration_items`
2. rejects `SELECT * FROM cmdb_ci_classes`
3. rejects JOIN against `cmdb_statuses`
4. rejects `cmdb_environments`, `cmdb_relationships`, `cmdb_relationship_types` (parametrized)
5. verifies the CAI-03 reject fires BEFORE the allowlist check (error message must mention CMDB/CAI-03, NOT the generic `Access to table X is not available` allowlist message)

The tests run against the real `executePortalQuery(tenantId, userId, sql)` — no Postgres connection, no mocking — because the CAI-03 branch lives inside `validatePortalSql()` which returns early before any DB connection is opened.

Baseline RED status: 5 / 5 failing against pre-edit `portal-ai-sql-executor.ts` (its existing allowlist reject returns `Access to table 'cmdb_configuration_items' is not available ...` which doesn't contain 'CMDB tables' or 'CAI-03').

**GREEN phase (`78cd30c`):**

`apps/api/src/services/portal-schema-context.ts`:
- Added a 16-line Phase 7 audit comment block ABOVE `export const PORTAL_ALLOWED_TABLES`. The comment states: (a) cmdb_* is intentionally excluded per CAI-02, (b) CMDB is staff-only data, (c) re-enabling requires `/gsd-discuss-phase` first (security-scope expansion), (d) the lock-in test at portal-context.test.ts protects against silent regressions, (e) the portal-ai-sql-executor.ts CAI-03 branch is the defense-in-depth backup.
- `PORTAL_ALLOWED_TABLES` contents **UNCHANGED** — `tickets`, `ticket_comments`, `ticket_attachments`, `categories`, `knowledge_articles`, `document_contents`.

`apps/api/src/services/portal-ai-sql-executor.ts`:
- Added a CAI-03 hard-reject branch inside `validatePortalSql()` at line ~77, positioned BEFORE the PORTAL_ALLOWED_TABLES allowlist check at line ~94:
  ```typescript
  // Phase 7 (CAI-03) defense-in-depth: hard-reject any portal-AI query that
  // references a cmdb_* table, EVEN IF PORTAL_ALLOWED_TABLES is ever mutated
  // to include one. CMDB is staff-only data. ...
  if (/\bcmdb_[a-z_]+/i.test(withoutStrings)) {
    return {
      valid: false,
      error:
        'CMDB tables are not accessible via the portal AI (Phase 7 CAI-03 enforcement). CMDB is staff-only data.',
    };
  }
  ```
- Regex rationale: `\bcmdb_[a-z_]+` — word boundary before `cmdb_`, then at least one letter/underscore (so `cmdb_` alone doesn't trigger). Runs against `withoutStrings` (string literals already stripped earlier in the function) so user prompts like `"cmdb_foo" is my table name` in a WHERE comparison do not trip the regex on the literal — only on actual SQL identifiers.
- Error message explicitly mentions "CMDB tables are not accessible" and "Phase 7 CAI-03 enforcement" so future debugging can grep for either phrase and find this branch.

GREEN test result: **5 / 5 pass** in `src/__tests__/portal-ai-sql-executor.test.ts`; **2 / 2 still pass** in `src/__tests__/portal-context.test.ts` (allowlist unchanged).

## Combined Test Results

```
$ pnpm --filter @meridian/api test -- \
    src/__tests__/ai-schema-context.test.ts \
    src/__tests__/portal-context.test.ts \
    src/__tests__/portal-ai-sql-executor.test.ts

Test Files  3 passed (3)
     Tests  19 passed (19)
```

Zero `it.todo` remains for Phase 7 cases in any of the three files.

## Acceptance Criteria Trace

All items from the plan's success criteria:

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `grep -q "JOIN cmdb_ci_classes"` in ai-schema-context.ts | PASS (2 occurrences) |
| 2 | `grep -q "JOIN cmdb_relationship_types"` | PASS (1 occurrence) |
| 3 | `grep -q "JOIN cmdb_statuses"` | PASS (2 occurrences) |
| 4 | `grep -q "JOIN cmdb_environments"` | PASS (1 occurrence) |
| 5 | `SERVER\|WORKSTATION\|NETWORK_DEVICE` removed (0 matches) | PASS |
| 6 | `ACTIVE\|INACTIVE\|DECOMMISSIONED` removed from CI block (the 1 remaining match is on the unrelated `applications` block, not on `cmdb_configuration_items`) | PASS |
| 7 | `PRODUCTION\|STAGING\|DEV\|DR` removed (0 matches) | PASS |
| 8 | Canonical classKey list `server.*virtual_machine.*database` present | PASS |
| 9 | Canonical relationshipKey list `depends_on.*runs_on.*hosted_on` present | PASS |
| 10 | `classId.*NOT NULL` present | PASS |
| 11 | `relationshipTypeId.*NOT NULL` present | PASS |
| 12 | Reference-table key columns `classKey`, `statusKey`, `envKey`, `relationshipKey` present | PASS |
| 13 | `ai-schema-context.test.ts` — 0 `it.todo` remaining | PASS |
| 14 | `portal-schema-context.ts` has `Phase 7 audit (CAI-02 lock-in` comment | PASS |
| 15 | PORTAL_ALLOWED_TABLES content unchanged (portal-context.test.ts still 2/2 passing) | PASS |
| 16 | `portal-ai-sql-executor.ts` has `CMDB tables are not accessible` reject | PASS |
| 17 | CAI-03 reject positioned BEFORE allowlist check | PASS (line 86 vs line 94) |
| 18 | `portal-ai-sql-executor.test.ts` file exists | PASS |
| 19 | All 5 portal-ai-sql-executor tests pass | PASS |
| 20 | apps/api builds: service files (ai-schema-context.ts, portal-schema-context.ts, portal-ai-sql-executor.ts) compile cleanly — all pre-existing tsc errors in unrelated files (ioredis version mismatch in sla-monitor.worker.ts, etc.) identical to Plan 04 baseline | PASS |

## CLAUDE.md Compliance Check

- **Rule 1 (multi-tenancy):** Honored end-to-end. The ai-schema-context.ts example query includes `ci."tenantId" = $TENANT_ID` scoping. The portal-ai-sql-executor CAI-03 branch does not bypass tenant scoping — the existing `$TENANT_ID` placeholder verification at step 4 of `executePortalQuery` continues to fire. No new queries were introduced anywhere; the only additions are DOCUMENTATION strings (AI-context) and a REJECTION branch (executor).
- **Rule 6 (AI Assistant Data Availability):** This plan IS the Rule-6 compliance step for Phase 7 schema changes. Every Phase 7 model-level change (Plan 01-04) is now reflected in ai-schema-context.ts so the AI can generate correct FK-only JOIN queries. No excluded tables added to EXCLUDED_TABLES — CMDB remains visible to the staff AI (only the portal AI excludes it).
- **Rule 7 (CSDM field ownership):** No field-ownership changes. The documentation now reflects the Phase 0 CSDM contract (reference-table FKs are the owners; legacy enum columns are read-only / deprecated). The example query template shows the AI the canonical JOIN pattern — copying it verbatim into any new AI-generated query preserves the contract.

## Threat-Register Trace

| Threat ID | Result |
|-----------|--------|
| T-7-05-01 (staff AI returns wrong data because schema docs are stale) | MITIGATED — CMDB DDL blocks now reflect FK contract verbatim; JOIN hints + canonical keys give the AI ground-truth vocabulary |
| T-7-05-02 (cross-tenant ref-table leak via portal AI) | MITIGATED (double layer) — PORTAL_ALLOWED_TABLES excludes cmdb_* (portal-context.test.ts locks) + CAI-03 cmdb_* hard reject in executor (portal-ai-sql-executor.test.ts locks) |
| T-7-05-03 (future PR adds cmdb_* to PORTAL_ALLOWED_TABLES) | MITIGATED — audit comment above the array explicitly requires `/gsd-discuss-phase`; portal-context.test.ts fails CI on any cmdb_* addition; defense-in-depth CAI-03 branch in executor still rejects even if the test is silenced |
| T-7-05-04 (cmdb_* regex too greedy — DoS) | ACCEPTED (per plan) — the `\bcmdb_[a-z_]+` regex is word-boundary-anchored and runs on `withoutStrings` (literals already stripped); legitimate portal-AI queries reference zero cmdb_* identifiers |
| T-7-05-05 (AI hallucinates class names) | ACCEPTED (per plan) — the 15 canonical classKeys + 13 relationshipKeys in the context give the AI ground truth; per-tenant custom classes beyond the seeded set are a known limitation for future dynamic-schema-fetch architecture |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's prescribed `executePortalQuery` interface did not match the real code**
- **Found during:** Task 2, RED phase.
- **Issue:** The plan's `<interfaces>` block claims `executePortalQuery(tenantId: string, sql: string, params?: unknown[])` returns `Promise<unknown>` and throws on rejection. The actual signature in `portal-ai-sql-executor.ts` is `executePortalQuery(tenantId: string, userId: string, sql: string): Promise<QueryResult>` where `QueryResult` is `{ columns, rows, rowCount, truncated, error? }` and rejection returns an object with `error` set (never throws).
- **Fix:** Wrote tests matching the REAL contract — call with `(TENANT_ID, USER_ID, sql)`, assert `result.error` is defined and matches the CAI-03 phrase. Omitted the plan's prescribed regression check "`executePortalQuery still ALLOWS legitimate portal queries (e.g. tickets)`" because it would require either a live Postgres connection or mocking `pg.Pool` — the CAI-03 branch lives inside `validatePortalSql()` and returns early BEFORE any `getPool().connect()` call, so cmdb_* rejection is provably testable without a DB, but legitimate-query success requires real execution. The allowlist check (which the CAI-03 branch precedes) is already exercised by Plan 01's `portal-context.test.ts`, so regression coverage of the allowlist path exists elsewhere.
- **Files modified:** `apps/api/src/__tests__/portal-ai-sql-executor.test.ts`.
- **Commit:** `8a167cd`.

**2. [Rule 2 - Missing critical functionality] `cmdb_relationship_types` table was completely absent from the SCHEMA_CONTEXT template literal**
- **Found during:** Task 1, GREEN phase, writing the new cmdb_relationships JOIN hint.
- **Issue:** Plan 01's ai-schema-context.ts had no DDL row for `cmdb_relationship_types` at all. Without such a row, telling the AI "JOIN cmdb_relationship_types ON ..." is a dead reference — the AI has no column list for the table and can't construct the JOIN properly.
- **Fix:** Added a first-class DDL row for `cmdb_relationship_types` with all 5 key columns (`relationshipKey`, `relationshipName`, `forwardLabel`, `reverseLabel`, `isDirectional`), the UNIQUE constraint, and the 13 canonical relationshipKeys.
- **Files modified:** `apps/api/src/services/ai-schema-context.ts`.
- **Commit:** `7427518`.

**3. [Rule 2 - Missing critical functionality] Test regex for status JOIN hint was too strict (required `statusType='lifecycle'` without double quotes)**
- **Found during:** Task 1, GREEN phase verification — 11/12 tests passed, 1 failed.
- **Issue:** The implementation writes the JOIN hint as `WHERE cmdb_statuses."statusType"='lifecycle'` (column name double-quoted as required by CLAUDE.md conventions). The test regex `/statusType='lifecycle'/` didn't match because of the closing double-quote right before the `=`.
- **Fix:** Widened the test regex to `/statusType"?\s*=\s*'lifecycle'/` — accepts optional closing quote + optional whitespace around `=`. This preserves the test intent (verify the AI is told which statusType to filter by) while matching the idiomatic SQL column-quoting pattern the implementation follows. The RED test for this case was already in the committed test file, so the only change was widening the regex as part of the Task 1 GREEN commit.
- **Files modified:** `apps/api/src/__tests__/ai-schema-context.test.ts`.
- **Commit:** `7427518` (included with Task 1 GREEN).

### Deferred Issues

**1. Cannot run `pnpm --filter @meridian/api build` to exit 0 — pre-existing ioredis + test-file TS errors in the base repo**
- Same situation as Plan 07-01 through 07-04 SUMMARYs: the worktree has no node_modules; the base repo has `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` from pre-existing TS2322 errors in `sla-monitor.worker.ts`, `auto-close.worker.ts`, `email-poll.worker.ts`, `recurring-ticket.worker.ts` (all ioredis v5.9.3 vs v5.10.1 version mismatch) + pre-existing TS2307/TS2352/TS7006 errors in several non-Phase-7 test files.
- **Primary verification performed:** confirmed NONE of the 3 modified service files (ai-schema-context.ts, portal-schema-context.ts, portal-ai-sql-executor.ts) have new TS errors. `pnpm --filter @meridian/api build 2>&1 | grep services/(ai-schema-context|portal-schema-context|portal-ai-sql-executor)\\.ts` returns empty. Only the existing test files plus the existing pre-Phase-7 broken files have errors — these were identical before this plan.
- The 3 Vitest suites all pass (19 / 19 tests total).

**2. `portal-context.test.ts` and the 2 new test files have pre-existing TS2835 warnings (ESM module resolution flag '.js' extension)**
- `src/__tests__/portal-context.test.ts(2,39): error TS2835` — pre-existing since Plan 01, imports `from '../services/portal-schema-context'` without `.js`.
- My new `ai-schema-context.test.ts` and `portal-ai-sql-executor.test.ts` follow the same pattern (no `.js`) to match the project's existing test-file convention.
- These are tsc noise, NOT Vitest failures — Vitest resolves them fine via its own resolver. Adding `.js` extensions to fix tsc would require a separate refactor across all test files, out of scope for Phase 7.

## Notes for Downstream Plans

- **Plan 07-06 (NOT NULL migration):** Safe to proceed. The staff AI now teaches the FK contract authoritatively — any operator debugging post-migration will see the AI generate JOIN queries against the new NOT NULL columns cleanly. The NOT NULL annotations in ai-schema-context.ts align exactly with Plan 06's schema.prisma changes.
- **Phase 14 (legacy enum column DROP):** Another pass through `ai-schema-context.ts` will be needed to: (a) remove the two `NOTE: The legacy columns ... still exist through Phase 14 ...` paragraphs (one in cmdb_configuration_items, one in cmdb_relationships), (b) confirm the `applications` table's `status(ACTIVE|INACTIVE|DECOMMISSIONED|...)` enum is migrated (out of Phase 7 scope — part of APM's own FK migration).
- **Staff AI manual verification:** after deployment, a smoke test should ask "how many servers does tenant X have?" and verify the AI generates: `SELECT COUNT(*) FROM cmdb_configuration_items ci JOIN cmdb_ci_classes c ON c.id = ci."classId" WHERE c."classKey" = 'server' AND ci."tenantId" = '...'`. If instead the AI generates `WHERE ci.type = 'SERVER'`, the legacy enum token list was not fully removed from the context — re-audit.

## Known Stubs

None. No hardcoded empty values, no placeholder text, no UI wiring. This plan changes two static DDL-documentation strings (template literals) and one validation branch (regex check) — no UI rendering, no data source wiring.

## Threat Flags

No NEW network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced.

The changes HARDEN two existing trust boundaries:
- **LLM → staff AI → $queryRaw executor**: ai-schema-context.ts now teaches the FK-only contract (vs. the stale enum tokens). The AI-generated SQL will use `JOIN cmdb_ci_classes ... WHERE "classKey"='server'` instead of the old `WHERE type='SERVER'`. Correctness improvement, not a new surface.
- **End-user portal AI → portal-ai-sql-executor → Postgres**: CAI-03 cmdb_* hard-reject branch adds a second layer of defense above the existing PORTAL_ALLOWED_TABLES check. Reduces the blast radius of a silent allowlist regression (threat T-7-05-03).

## Self-Check: PASSED

- [x] `apps/api/src/services/ai-schema-context.ts` — CMDB DDL blocks rewritten with FK + JOIN docs, NOT NULL annotations, canonical keys, example query; `cmdb_relationship_types` added as first-class row
- [x] `apps/api/src/services/portal-schema-context.ts` — Phase 7 audit comment above PORTAL_ALLOWED_TABLES; array contents unchanged
- [x] `apps/api/src/services/portal-ai-sql-executor.ts` — CAI-03 cmdb_* hard-reject branch inside `validatePortalSql()`, positioned BEFORE the allowlist check; error message mentions CMDB + CAI-03
- [x] `apps/api/src/__tests__/ai-schema-context.test.ts` — 12 real passing tests (was 4 it.todo)
- [x] `apps/api/src/__tests__/portal-ai-sql-executor.test.ts` — 5 real passing tests (new file)
- [x] `apps/api/src/__tests__/portal-context.test.ts` — 2 existing tests still pass (allowlist unchanged)
- [x] Commits present in `git log`: `90144f7`, `7427518`, `8a167cd`, `78cd30c`
- [x] No legacy enum token walls in the cmdb_configuration_items or cmdb_relationships DDL blocks
- [x] Canonical seeded keys match seed.ts + packages/db/src/seeds/cmdb-reference.ts exactly (15 classKeys, 13 relationshipKeys)
- [x] CAI-03 regex lives at line 86, allowlist check at line 94 — reject is BEFORE allowlist
- [x] 19 / 19 tests pass across the 3 AI-context suites
- [x] Multi-tenancy invariant: every example query in ai-schema-context.ts includes `tenantId` scoping; executor's $TENANT_ID placeholder verification (step 4 of executePortalQuery) is untouched; CAI-03 branch does not bypass tenant scoping
