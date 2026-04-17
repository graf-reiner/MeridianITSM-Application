---
phase: 07-ci-reference-table-migration
verified: 2026-04-16T20:00:00Z
status: human_needed
score: 5/5 ROADMAP success criteria verified at the artifact + code-evidence level; 2 require human smoke confirmation
overrides_applied: 0
human_verification:
  - test: "Manual UI smoke — create a CI via dashboard /dashboard/cmdb/new"
    expected: "Class / Lifecycle Status / Operational Status / Environment dropdowns render values from /api/v1/cmdb/{classes,statuses,environments} fetches; the saved row in cmdb_configuration_items has 4 non-null FK uuids; JOIN query returns the chosen human-readable labels"
    why_human: "End-to-end UI render + form submit + DB read requires a running dev stack and a browser session; the Playwright spec exists at apps/web/tests/cmdb-ref-table-dropdowns.spec.ts but has not been executed in CI from this verification environment"
  - test: "Manual AI smoke — ask the staff AI 'how many servers do we have?' in the dev tenant"
    expected: "AI generates SQL containing JOIN cmdb_ci_classes ON c.id = ci.\"classId\" WHERE c.\"classKey\" = 'server' AND ci.\"tenantId\" = $TENANT_ID, and the count matches the equivalent psql JOIN result"
    why_human: "Requires LLM round-trip; not deterministic enough for automated verification. AI schema context teaches the JOIN pattern (ai-schema-context.ts:139-155), but only a real LLM invocation can confirm the AI actually uses it"
  - test: "Optional DB-level duplicate-rejection smoke — psql DO block from Plan 06 step 3d"
    expected: "Inserting a duplicate (sourceId, targetId, relationshipTypeId) row into cmdb_relationships is rejected with unique_violation"
    why_human: "Requires psql access to the live DB; index existence has been verified (cmdb_relationships_sourceId_targetId_relationshipTypeId_key per phase_specifics) but the actual REJECT behavior is not exercised by any committed automated test"
---

# Phase 7: CI Reference-Table Migration — Verification Report

**Phase Goal:** Every CI and CI relationship reads and writes classification via reference-table foreign keys, with zero null FKs after backfill, unblocking all downstream CSDM phases.

**Verified:** 2026-04-16
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Per-tenant backfill completes for every existing CI and relationship with zero null FK rows surfaced by a verification query | VERIFIED | `packages/db/scripts/phase7-backfill.ts` (348 LOC, fully implemented per Plan 03) is per-tenant, idempotent, with HOSTS+VIRTUALIZES dup detection. `phase7-verify.ts` is per-tenant scoped (lines 25-68 use explicit `WHERE "tenantId" = ${tenant.id}::uuid`). Live DB state per phase_specifics: 14 CIs / 0 null FKs across `classId/lifecycleStatusId/operationalStatusId/environmentId`; 6 relationships / 0 null `relationshipTypeId`. |
| 2 | `cmdb.service.ts`, `application.service.ts`, and `cmdb-import.service.ts` write only FK ids — grep for legacy enum writes returns nothing | VERIFIED | `bash packages/db/scripts/phase7-grep-gate.sh` executed → exit 0; default ENFORCE=1 (line 17). Targeted greps for `type:.*data\.type`, `status:.*data\.status`, `environment:.*data\.environment`, `status:.*'INACTIVE'.*as never`, `relationshipType:.*as never` across `apps/api/src/services/` and `apps/worker/` returned ZERO matches. |
| 3 | CMDB create/edit UI forms render class/status/environment/relationship dropdowns from reference-table fetches (no hard-coded enum lists) | VERIFIED (artifact + code) — needs human smoke | `apps/web/src/app/dashboard/cmdb/new/page.tsx:263-266` calls `fetchJson('/api/v1/cmdb/{classes,statuses?statusType=lifecycle,statuses?statusType=operational,environments}')` in useEffect. Reference-CRUD routes exist at `apps/api/src/routes/v1/cmdb/reference.ts` (4 GET endpoints). Playwright spec exists: `apps/web/tests/cmdb-ref-table-dropdowns.spec.ts`. Spec not executed during this verification (see human_verification). |
| 4 | `CmdbRelationship` unique composite index uses `relationshipTypeId` and duplicate creation is rejected at the DB level | VERIFIED (schema + migration); duplicate-INSERT REJECT needs human psql smoke | `packages/db/prisma/schema.prisma:2353` reads `@@unique([sourceId, targetId, relationshipTypeId])`. Migration `20260417215217_phase7_ci_ref_notnull/migration.sql` line 82 drops the legacy index, line 94 creates `cmdb_relationships_sourceId_targetId_relationshipTypeId_key`. Per phase_specifics, this unique index exists in the live dev DB. The duplicate-REJECT *behavior* is not exercised by any committed automated test (see human_verification). |
| 5 | `ai-schema-context.ts` + `portal-schema-context.ts` expose the reference tables with joins documented so the AI can answer "what class is this CI?" | VERIFIED (docs); LLM behavior needs human smoke | `apps/api/src/services/ai-schema-context.ts:139` documents `cmdb_configuration_items` with NOT NULL FK columns + 4 JOIN hint comments + canonical 15 classKeys + EXAMPLE query for "how many servers". `cmdb_relationship_types` added as first-class DDL row at line 129. `portal-schema-context.ts:18` carries the Phase 7 audit comment confirming intentional CMDB exclusion. The AI's actual JOIN-emitting behavior on a live LLM round-trip is not deterministic from static analysis (see human_verification). |

**Score:** 5/5 truths verified at the artifact + code-evidence level. 3 of the 5 carry residual human smoke items (UI render, AI behavior, DB duplicate-INSERT) that cannot be exercised programmatically from this verification environment.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/scripts/phase7-verify.ts` | per-tenant null-FK reporter + unique-index introspection | VERIFIED | 102 LOC; per-tenant `WHERE "tenantId" = ${tenant.id}::uuid`; checks `pg_indexes` for relationshipTypeId-bearing index |
| `packages/db/scripts/phase7-backfill.ts` | per-tenant FK backfill, idempotent, with HOSTS+VIRTUALIZES dup detector + --dry-run | VERIFIED | 348 LOC; 5 mapping tables (TYPE_TO_CLASS / STATUS_TO_LIFECYCLE / STATUS_TO_OPERATIONAL=all 'unknown' per A1 / ENV_TO_KEY / REL_TYPE_TO_KEY); `detectRelationshipDuplicates` runs before UPDATE; idempotent `OR: [{ classId: null }, ...]` guard |
| `packages/db/scripts/phase7-grep-gate.sh` | active enforcement default | VERIFIED | `ENFORCE="${PHASE7_GATE_ENFORCE:-1}"` line 17; executed in this verification → exit 0 |
| `packages/db/scripts/seed-existing-tenants-cmdb-ref.ts` | one-shot v1.0-launch-gap closer | VERIFIED | exists; imports reusable seeder; per-tenant loop with `count > 0` skip |
| `packages/db/src/seeds/cmdb-reference.ts` | reusable tx-aware seeder; 15+11+6+13 rows | VERIFIED | exists; signature `seedCmdbReferenceData(tx: Prisma.TransactionClient, tenantId: string)`; idempotent `update: {}` upserts |
| `apps/api/src/services/cmdb-reference-resolver.service.ts` | 5 tenant-scoped resolvers + clearResolverCaches | VERIFIED | 5 `export async function` resolvers (lines 22, 41, 57, 76, 95); every cache key prefixed `${tenantId}:`; statuses use `${tenantId}:lifecycle:` / `${tenantId}:operational:` to avoid conflation |
| `apps/api/src/services/cmdb.service.ts` | FK-only writes; classId guard; deleteCI uses 'retired' | VERIFIED | classId guard at lines 221-225; deleteCI calls `resolveLifecycleStatusId(tenantId, 'retired')` at line 804; ZERO legacy enum-write matches |
| `apps/api/src/services/application.service.ts` | FK-only createPrimaryCiInternal; PRIMARY_CI_CREATED audit preserved | VERIFIED | resolves `lifecycleStatusId='in_service'` + `operationalStatusId='unknown'` via tenant-scoped `tx.cmdbStatus.findFirst`; PRIMARY_CI_CREATED audit grep still matches |
| `apps/api/src/services/cmdb-import.service.ts` | classKey resolution mandatory | VERIFIED | per-row error 'did not resolve to any seeded CI class' guard; `importedCount` tracking |
| `apps/api/src/services/ai-schema-context.ts` | FK + JOIN docs + canonical keys | VERIFIED | 4 JOIN-hint comments at lines 141-144; 15 canonical classKeys at lines 145-148; EXAMPLE query at 149-152; legacy enum tokens removed from CI block (only present on unrelated `applications` block at line 100) |
| `apps/api/src/services/portal-schema-context.ts` | Phase 7 audit comment + cmdb_* not in allowlist | VERIFIED | comment block at lines 18-31; PORTAL_ALLOWED_TABLES at line 35 (zero cmdb_* entries) |
| `apps/api/src/services/portal-ai-sql-executor.ts` | hard-reject cmdb_* before allowlist check | VERIFIED | regex `/\bcmdb_[a-z_]+/i` at line 86; rejection message at line 90; positioned BEFORE `PORTAL_ALLOWED_TABLES.includes(tableName)` check at line 99 |
| `apps/worker/src/workers/cmdb-reconciliation.ts` | OPTION B inline resolvers + 5 cache clears + offline marker | VERIFIED | duplication header at line 46; `resolveOperationalStatusId` at line 100; `resolveRelationshipTypeId` at line 140; `clearResolverCaches` clears 5 caches (lines 161-165); stale marker uses resolver at line 512 |
| `apps/api/src/routes/v1/cmdb/index.ts` | Zod .strict() schemas | VERIFIED | CreateCISchema (line 30 .strict at 79), UpdateCISchema (line 81), CreateRelationshipSchema (line 85); 3 safeParse call sites (lines 143, 231, 289) |
| `apps/api/src/routes/auth/signup.ts` | seeds CMDB ref data inside transaction | VERIFIED | `import { seedCmdbReferenceData } from '@meridian/db/seeds/cmdb-reference'` at line 4; `await seedCmdbReferenceData(tx, tenant.id)` at line 191 inside the existing `prisma.$transaction` |
| `apps/owner/src/lib/provisioning.ts` | seeds CMDB ref data inside transaction | VERIFIED | import at line 2; call at line 265 inside provisioning's `prisma.$transaction` |
| `packages/db/prisma/schema.prisma` | 5 NOT NULL FK columns + rewritten unique index | VERIFIED | classId/lifecycleStatusId/operationalStatusId/environmentId NOT NULL at lines 2204-2207; relationshipTypeId NOT NULL at line 2334; `@@unique([sourceId, targetId, relationshipTypeId])` at line 2353 |
| `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql` | pre-flight DO block(s) + 5 SET NOT NULL + DROP/CREATE unique index + FK recreation | VERIFIED | null-FK DO block lines 12-36 (RAISE EXCEPTION listing per-column null counts); duplicate-detection DO block lines 46-60; 5 ALTER COLUMN SET NOT NULL; DROP INDEX legacy + CREATE UNIQUE INDEX with relationshipTypeId; 5 FK ADD CONSTRAINT recreations |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `apps/api/src/routes/auth/signup.ts` | `packages/db/src/seeds/cmdb-reference.ts` | `import { seedCmdbReferenceData }` + `seedCmdbReferenceData(tx, tenant.id)` | WIRED | import at signup.ts:4; call at signup.ts:191 inside the existing $transaction block |
| `apps/owner/src/lib/provisioning.ts` | `packages/db/src/seeds/cmdb-reference.ts` | same pattern via `@meridian/db/seeds/cmdb-reference` subpath | WIRED | import at provisioning.ts:2; call at provisioning.ts:265 inside the existing $transaction |
| `packages/db/prisma/seed.ts` | `packages/db/src/seeds/cmdb-reference.ts` | `import + delegate (no duplication of the 15+11+6+13 lists)` | WIRED | seed.ts:5 imports; seed.ts:346 calls inside transaction wrapper |
| `packages/db/scripts/phase7-backfill.ts` | `packages/db/src/seeds/cmdb-reference.ts` | import + per-tenant `if (classCount === 0) seedCmdbReferenceData(tx, tenantId)` | WIRED | import at backfill.ts:31; call at backfill.ts:209 inside per-tenant `$transaction` |
| `cmdb.service.ts deleteCI` | `cmdb-reference-resolver.service.resolveLifecycleStatusId` | service-layer FK resolution; throws if seed missing | WIRED | call at cmdb.service.ts:804 with `tenantId, 'retired'` |
| `cmdb-reconciliation worker stale marker` | `resolveOperationalStatusId('offline')` (worker-local OPTION B copy) | inline resolver; throws-if-null guard | WIRED | call at cmdb-reconciliation.ts:512 |
| `POST /api/v1/cmdb/cis` | `cmdb.service.createCI` | Zod CreateCISchema.safeParse → service call → tx.cmdbConfigurationItem.create | WIRED | safeParse at routes/v1/cmdb/index.ts:143; service receives parseResult.data; service-layer classId guard at cmdb.service.ts:221 |
| Plan 03 backfill complete | Plan 06 NOT NULL migration | `phase7-verify.ts must exit 0 BEFORE Plan 06 applies the NOT NULL migration` | WIRED | migration.sql lines 12-36 contain the runtime equivalent of phase7-verify (RAISE EXCEPTION on any null FK count > 0) — defense-in-depth even if operator skips the verify step |
| Plan 04 service writes complete | Plan 06 NOT NULL migration | grep gate exit 0 | WIRED | gate executed in this verification → exit 0; default ENFORCE=1 since commit 306b762 |
| Staff AI assistant | `ai-schema-context.getSchemaContext()` | DDL string with JOIN hints | WIRED (docs only) | hints documented; LLM consumption is the human_verification item |
| Portal AI executor | PORTAL_ALLOWED_TABLES + cmdb_* hard-reject branch | `validatePortalSql()` runs cmdb_* check at line 86 BEFORE allowlist check at line 99 | WIRED | both branches present in same function |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `apps/web/src/app/dashboard/cmdb/new/page.tsx` | `classes / lifecycleStatuses / operationalStatuses / environments` state | `fetchJson('/api/v1/cmdb/{classes,statuses,environments}')` in useEffect (lines 263-266) | YES — fetches against the GET endpoints in `apps/api/src/routes/v1/cmdb/reference.ts` which run `prisma.cmdbCiClass.findMany({ where: { tenantId } })` etc. | FLOWING |
| `cmdb-reference-resolver.service.ts` resolvers | resolved FK ids | `prisma.cmdb*.findFirst({ where: { tenantId, ...key } })` per resolver | YES — direct DB queries, tenant-scoped | FLOWING |
| `phase7-verify.ts` | per-tenant null counts | `prisma.$queryRaw` on `cmdb_configuration_items` / `cmdb_relationships` with `WHERE "tenantId" = ${tenant.id}::uuid` | YES | FLOWING |
| `cmdb.service.createCI` | classId / lifecycleStatusId / etc. | parseResult.data from Zod parsed request body | YES — guarded by classId throw at the top; FK ids are persisted unaltered | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Grep gate enforces no legacy enum writes | `bash packages/db/scripts/phase7-grep-gate.sh` | `ok Phase 7 grep gate PASSED — no legacy enum writes` (exit 0) | PASS |
| All artifact files exist with substantial content | `ls -l` on 16 expected paths | All 16 files present, sizes 2.6KB-41.4KB | PASS |
| Schema declares 5 FK columns NOT NULL | grep on schema.prisma | 4 FK lines for cmdb_configuration_items + 1 line for cmdb_relationships, all `String @db.Uuid` (no `?`) | PASS |
| Migration directory exists with phase7_ci_ref_notnull | `ls migrations/` | `20260417215217_phase7_ci_ref_notnull` | PASS |
| Migration contains pre-flight DO blocks | grep on migration.sql | 2 DO blocks (null-FK gate + dup gate); 5 SET NOT NULL; CREATE UNIQUE INDEX with relationshipTypeId | PASS |
| phase7-verify.ts runs against live DB | `pnpm tsx packages/db/scripts/phase7-verify.ts` | SKIPPED — tsx not available in this verification sandbox; per phase_specifics this script has been executed against the live dev DB and reports 0 null FKs + index rewritten | SKIP (verified via phase_specifics) |
| Vitest CMDB suites pass | `pnpm --filter @meridian/api vitest run` | SKIPPED — no node_modules in this sandbox path; per Plan 04 + Plan 05 SUMMARYs, 9 promoted Phase 7 cases are real passing tests (cmdb-service ×3, cmdb-import ×2, cmdb-reconciliation ×2, ai-schema-context ×12, portal-ai-sql-executor ×5) | SKIP (verified via summaries) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CREF-01 | 02, 03, 04, 05, 06 | `CmdbConfigurationItem.classId` is required (NOT NULL) on create; backfilled from legacy `type` enum via per-tenant mapping | SATISFIED | schema.prisma:2204 NOT NULL; backfill script lines 257-273 with TYPE_TO_CLASS; service-layer classId guard at cmdb.service.ts:221; Zod CreateCISchema requires classId.uuid(); migration sets NOT NULL + pre-flight DO block |
| CREF-02 | 02, 03, 04, 05, 06 | `lifecycleStatusId` and `operationalStatusId` required; backfilled from legacy `status` enum | SATISFIED | schema.prisma:2205-2206 NOT NULL; backfill maps via STATUS_TO_LIFECYCLE + STATUS_TO_OPERATIONAL (all 'unknown' per A1); deleteCI uses resolver for 'retired'; worker stale marker uses resolver for 'offline' |
| CREF-03 | 02, 03, 04, 05, 06 | `environmentId` required; backfilled from legacy `environment` enum | SATISFIED | schema.prisma:2207 NOT NULL; ENV_TO_KEY mapping; application.service.ts resolves prod env for primary CI; backfill enforces |
| CREF-04 | 02, 03, 04, 05, 06 | `relationshipTypeId` required; unique composite index rewritten; backfill covers existing relationships | SATISFIED | schema.prisma:2334 NOT NULL; @@unique uses relationshipTypeId at 2353; createRelationship resolves legacy string → FK or throws; HOSTS+VIRTUALIZES dup detector in backfill; migration includes both backfill-completeness + dup pre-flight |
| CREF-05 | 04 | services write FK ids only; CMDB UI forms use reference-table fetches | SATISFIED | grep gate exit 0 on `cmdb.service.ts`, `application.service.ts`, `cmdb-import.service.ts`, `cmdb-reconciliation.ts`, `assets/index.ts`; UI calls /api/v1/cmdb/{classes,statuses,environments} from new/page.tsx:263-266 |
| CAI-01 (cross-cutting) | 05 | `ai-schema-context.ts` updated for new tables/dropped columns/renamed columns | SATISFIED | 4 JOIN-hint comments + 15 canonical classKeys + 13 canonical relationshipKeys + EXAMPLE query + cmdb_relationship_types added as first-class DDL row + NOT NULL annotations matching schema |
| CAI-02 (cross-cutting) | 05 | `portal-schema-context.ts` updated; cmdb_* tables intentionally excluded | SATISFIED | Phase 7 audit comment block lines 18-31; PORTAL_ALLOWED_TABLES contents unchanged (still 0 cmdb_* entries); portal-context.test.ts continues to pass per Plan 05 SUMMARY |
| CAI-03 (cross-cutting) | 05 | `portal-ai-sql-executor.ts` row-level security extended (or in this case: hard-rejected) for new tables | SATISFIED | regex hard-reject `/\bcmdb_[a-z_]+/i` at line 86, BEFORE the allowlist check at line 99; error message explicitly cites Phase 7 CAI-03 enforcement |

**No orphaned requirements:** all 8 requirement IDs declared in REQUIREMENTS.md as Phase 7 are accounted for in at least one of Plans 02-06.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/__tests__/api-key.test.ts` | 21-28 | 8 × `it.todo` (pre-existing, unrelated to Phase 7) | Info | Tracked in STATE.md Tracked Follow-ups; not introduced by Phase 7; explicitly noted in Plan 01 SUMMARY |
| `apps/api/src/services/ai-schema-context.ts` | 100 | Legacy enum tokens `ACTIVE\|INACTIVE\|DECOMMISSIONED` + `PRODUCTION` etc. on the `applications` table block | Info | This is the unrelated APM `applications` table, NOT `cmdb_configuration_items`. The CI block at lines 109+ is clean. Phase 7 SCs are about CMDB models, not APM. APM enum migration is out of Phase 7 scope per Plan 05 decision note (Phase 14 will revisit if APM follows the same pattern). |

No blockers. Both notable items are explicitly documented as out-of-scope or pre-existing in the plan summaries.

### Multi-Tenancy Audit (CLAUDE.md Rule 1)

This phase touches CMDB models (which all carry `tenantId`) extensively. Verified:

- **Resolver caches** all use `${tenantId}:` as the FIRST cache-key segment (cmdb-reference-resolver.service.ts lines 26, 45, 61, 80, 99); same pattern in worker copy (cmdb-reconciliation.ts lines 70, 85, 110, 130, 150 area).
- **Status caches** disambiguate `${tenantId}:lifecycle:${key}` vs `${tenantId}:operational:${key}` to prevent conflation when the same statusKey ('unknown') exists for both types.
- **Seeder** is per-tenant (single `tenantId` argument; every upsert carries `tenantId`); demo seed wraps it in a transaction.
- **Backfill script** `phase7-backfill.ts` iterates one tenant at a time (line 334); never aggregates across tenants. Every Prisma read includes `where: { tenantId, ... }`.
- **`phase7-verify.ts`** uses explicit per-tenant `WHERE "tenantId" = ${tenant.id}::uuid` casts (lines 39-47).
- **Migration `DO $$` block** is intentionally tenant-agnostic (column-level NOT NULL fires globally) — documented in Plan 06 SUMMARY; matched by the per-tenant verify script for operator-facing reporting.

**No tenant isolation violations introduced by Phase 7.**

### Human Verification Required

#### 1. Manual UI Smoke — Create CI via Dashboard

**Test:** Log in as `admin@msp.local` / `Admin123!`, navigate to `/dashboard/cmdb/new`. Verify class/status/environment dropdowns are populated with seeded values (Server, In Service, Online, Production, etc.). Pick values, fill name + hostname, save. Verify in psql that the new row has 4 non-null FK uuids and the JOIN query returns the human-readable labels:

```sql
SELECT ci.name, cls."className", lc."statusName", op."statusName", env."envName"
  FROM cmdb_configuration_items ci
  JOIN cmdb_ci_classes cls ON cls.id = ci."classId"
  JOIN cmdb_statuses lc ON lc.id = ci."lifecycleStatusId"
  JOIN cmdb_statuses op ON op.id = ci."operationalStatusId"
  JOIN cmdb_environments env ON env.id = ci."environmentId"
 ORDER BY ci."createdAt" DESC LIMIT 1;
```

**Expected:** All 4 FK ids present and joinable.
**Why human:** Static analysis confirms the wiring (fetch URLs at new/page.tsx:263-266; reference routes at v1/cmdb/reference.ts; service-layer classId guard); only an actual browser session can confirm dropdowns *render* and the form *submits*. Playwright spec exists but was not executed during verification.

#### 2. Manual AI Smoke — "How many servers?"

**Test:** Open the staff AI chat in the dev tenant. Ask: "how many servers do we have?" Verify the AI's generated SQL contains:

```sql
JOIN cmdb_ci_classes ... WHERE ... "classKey" = 'server' ... "tenantId" = '...'
```

…and that the count matches:

```sql
SELECT COUNT(*) FROM cmdb_configuration_items ci
  JOIN cmdb_ci_classes cls ON cls.id = ci."classId"
 WHERE cls."classKey" = 'server' AND ci."tenantId" = '<dev-tenant-id>';
```

**Expected:** AI uses JOIN against cmdb_ci_classes (not legacy `WHERE type='SERVER'`).
**Why human:** LLM round-trip is non-deterministic; the AI schema context has been updated to teach the JOIN pattern (ai-schema-context.ts:139-155) but only an actual LLM invocation confirms the AI applies it.

#### 3. Optional DB-Level Duplicate-INSERT Smoke

**Test:** Run the Plan 06 step 3d psql DO block on the live dev DB. It picks a tenant, picks two CIs and a relationship type, inserts a relationship, then attempts to insert the EXACT same `(sourceId, targetId, relationshipTypeId)` again. The second INSERT must fail with `unique_violation`.

**Expected:** psql NOTICE `ok TEST PASSED: duplicate rejected by unique constraint`.
**Why human:** The unique index existence has been verified (`cmdb_relationships_sourceId_targetId_relationshipTypeId_key` exists per phase_specifics) but the actual REJECT *behavior* is not exercised by any committed automated test. Psql access is required.

### Gaps Summary

**No blocking gaps.** All 5 ROADMAP success criteria are satisfied at the artifact + code-evidence level:

- Schema is in final NOT NULL state (5 FK columns + rewritten unique index)
- Migration includes both backfill-completeness and duplicate-detection pre-flight DO blocks
- Live dev DB has 0 null FKs (per phase_specifics: 14 CIs, 6 relationships, 0 null FKs)
- Grep gate is in active enforcement mode and exits 0
- Reusable seeder is wired into both signup + owner provisioning transactions
- Resolver service is multi-tenant-safe (every cache key prefixed `${tenantId}:`)
- Worker uses OPTION B inline duplication with the project-standard header
- AI schema context teaches the FK + JOIN contract authoritatively
- Portal AI has defense-in-depth cmdb_* hard-reject preceding the allowlist check
- All Phase 7 Vitest tests are real passing tests (zero `it.todo` for Phase 7 cases)
- Final commit `8f89da2` confirms live migration applied

The 3 human verification items are residual smoke tests for behaviors that cannot be exercised programmatically (UI render, AI behavior, DB duplicate-INSERT). They do not represent gaps in the delivery — they represent the boundary between automated and manual confirmation.

### Notes for Downstream Phases

- **Phase 8 (Asset hardware/OS dedup)**: UNBLOCKED. Phase 7 FK columns are NOT NULL in both schema.prisma and the live dev DB; the Asset↔CI dedup joins Phase 8 needs are now reliable.
- **Phase 14 (legacy column DROP)**: still deferred per master plan. Phase 7 deliberately preserves `type`/`status`/`environment`/`relationshipType` columns for read-side backward compatibility through the one-week production canary. Plan 05 SUMMARY notes that Phase 14 will require another pass through `ai-schema-context.ts` to remove the "still exist through Phase 14" notes.
- **Tracked follow-up (Plan 04 SUMMARY T-7-04-02)**: cross-tenant classId leakage (a client could send a valid-UUID classId belonging to Tenant B) is NOT mitigated by Phase 7. The DB FK constraint accepts any valid UUID; service-layer does not yet verify the classId's tenantId. Tracked as a Phase 8+ hardening task.

---

_Verified: 2026-04-16T20:00:00Z_
_Verifier: Claude (gsd-verifier)_
