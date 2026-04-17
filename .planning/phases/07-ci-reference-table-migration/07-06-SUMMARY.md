---
phase: 07-ci-reference-table-migration
plan: 06
subsystem: cmdb-ref-fk-notnull-schema-flip
tags: [cmdb, prisma, ddl-migration, not-null-constraint, defense-in-depth, csdm, checkpoint]
requirements_addressed: [CREF-01, CREF-02, CREF-03, CREF-04, CREF-05]

dependency_graph:
  requires:
    - packages/db/scripts/phase7-backfill.ts (Plan 03: per-tenant FK backfill implemented + HOSTS/VIRTUALIZES dup detector)
    - packages/db/scripts/phase7-verify.ts (Plan 01: per-tenant null-FK report + unique-index introspection)
    - packages/db/scripts/phase7-grep-gate.sh (Plan 04: ENFORCE mode; exits 0 on this worktree)
    - apps/api/src/services/cmdb.service.ts (Plan 04: FK-only writes)
    - apps/api/src/services/application.service.ts (Plan 04: FK-only createPrimaryCiInternal)
    - apps/api/src/services/cmdb-import.service.ts (Plan 04: FK-only writes)
    - apps/worker/src/workers/cmdb-reconciliation.ts (Plan 04: FK-only worker writes)
    - apps/api/src/routes/v1/cmdb/index.ts (Plan 04: Zod .strict() schemas)
  provides:
    - "packages/db/prisma/schema.prisma: 5 FK columns promoted to NOT NULL (classId / lifecycleStatusId / operationalStatusId / environmentId / relationshipTypeId); matching relation fields made non-optional; @@unique on CmdbRelationship rewritten from legacy enum to FK column"
    - "packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql: offline-generated via prisma migrate diff; contains the per-tenant pre-flight DO block + duplicate-detection DO block + Prisma's standard DROP CONSTRAINT / DROP INDEX / ALTER COLUMN SET NOT NULL / CREATE UNIQUE INDEX / ADD CONSTRAINT sequence"
  affects:
    - "OPERATOR ACTION REQUIRED: migration has NOT been applied to any database. The dev DB (configured at 10.1.200.153:5432) was unreachable from this Windows worktree sandbox; Docker is not running locally. Operator must run 'cd packages/db && pnpm prisma migrate deploy' (or 'prisma migrate dev' for shadow-DB verification) on the main tree where DATABASE_URL resolves."
    - "Plan 07-07 / Phase 8 Asset dedup: BLOCKED until operator applies this migration and phase7-verify.ts confirms zero null FKs + unique index uses relationshipTypeId."
    - "Phase 14 (destructive DROP of legacy enum columns): still deferred per master plan; this migration does NOT drop type/status/environment/relationshipType columns — they remain for read-side backward compatibility through the one-week canary window."

tech-stack:
  added: []
  patterns:
    - "Prisma 7 offline migration generation: 'prisma migrate diff --from-schema <old> --to-schema <new> --script' produces executable SQL without needing a live DATABASE_URL (A6 verification: clean DROP+CREATE, no CREATE INDEX CONCURRENTLY)."
    - "Actionable-error PL/pgSQL pre-flight: DO $$ block with RAISE EXCEPTION listing per-column null counts so a missed backfill produces a clear 'run phase7-backfill.ts' message instead of a cryptic Prisma error."
    - "Defense-in-depth duplicate detection: second DO $$ block verifies no (sourceId, targetId, relationshipTypeId) compound duplicates exist before the new UNIQUE INDEX is created — catches any HOSTS + VIRTUALIZES collapse that Plan 03's backfill missed."

key-files:
  created:
    - packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql
  modified:
    - packages/db/prisma/schema.prisma

decisions:
  - "CHECKPOINT decision: this agent runs inside a Windows sandbox that cannot reach the dev DB at 10.1.200.153:5432 (network timeout) and has no local Docker postgres. The plan's [BLOCKING] task 2e ('prisma migrate dev' apply) and task 3 ('phase7-verify.ts must report zero nulls + new index') cannot run here. Executed the OFFLINE portion of the plan (schema edits + migration SQL generation via 'prisma migrate diff') and committed it, then surfaced a CHECKPOINT so the operator can apply the migration from the main tree where the DB is reachable."
  - "A6 VERIFIED: Prisma 7.5.0's migrate-diff output for this schema change is clean: DROP FK CONSTRAINT × 5, DROP INDEX × 1, ALTER COLUMN SET NOT NULL × 5 (bundled into 2 ALTER TABLE statements), CREATE UNIQUE INDEX × 1 (non-concurrent), ADD FK CONSTRAINT × 5. No CREATE INDEX CONCURRENTLY, so the standard DO $$ wrapping works without needing to split into multiple migrations."
  - "Relation-field optionality must match FK optionality (Prisma requirement). In addition to flipping the 5 FK columns from 'String?' to 'String', also flipped the matching relation fields: ciClass / lifecycleStatus / operationalStatus / cmdbEnvironment / relationshipTypeRef lost their '?'. Plan did not call this out explicitly but Prisma refuses to validate a schema where a required FK scalar has an optional relation field."
  - "Worktree-vs-base path hazard recurrence (Plan 04 deviation #1 pattern): the Edit and Write tools resolved absolute paths rooted at 'C:\\Users\\greiner\\OneDrive\\ClaudeAI\\MeridianITSM-Application\\' to the BASE repo rather than the worktree at '.claude\\worktrees\\agent-a26685f7\\'. Applied the same per-file fix: edit in base → cp to worktree → 'git checkout' in base to restore → verify worktree has the change via md5sum + grep. Applied once for schema.prisma and once for the migration.sql directory."
  - "Duplicate-detection DO block added as a second pre-flight gate even though Plan 03's backfill already includes HOSTS/VIRTUALIZES duplicate detection. Rationale: the phase7-backfill.ts detector runs BEFORE UPDATEs; the schema migration's detector runs BEFORE the CREATE UNIQUE INDEX. The window between them is where a buggy writer could introduce a new duplicate. Cheap belt-and-suspenders — one extra aggregation query on a table with an indexed tenantId."

metrics:
  duration_minutes: 5
  tasks_completed: "1.5 / 3 (Task 1 partial: grep gate only; Task 2 offline-partial: schema + migration written + committed, live apply deferred; Task 3 fully deferred to operator)"
  files_changed: 2
  commits: 1
  completed_date: 2026-04-17
  status: "CHECKPOINT — dev DB unreachable from worktree sandbox; offline deliverables committed"
---

# Phase 7 Plan 06: CMDB Reference FK NOT NULL Schema Flip — CHECKPOINT Summary

**Status: CHECKPOINT (not COMPLETE).** Schema.prisma edits + Prisma migration file are written, committed, and ready to apply. The live `prisma migrate dev` step + post-migration `phase7-verify.ts` confirmation are DEFERRED to the operator because the dev DB (10.1.200.153:5432) is unreachable from this Windows sandbox and Docker is not running locally.

## Overview

**One-liner:** Schema flipped 5 FK columns from nullable to NOT NULL and rewrote the CmdbRelationship unique index from legacy enum to FK column; migration SQL generated offline via `prisma migrate diff` with a per-tenant pre-flight DO block + duplicate-detection DO block; live migration apply + final verification DEFERRED to the operator (DB unreachable from sandbox).

**Duration:** 5 minutes (schema edits, offline SQL generation, commit)
**Tasks:** 1.5 / 3 completed (see Task Breakdown below)
**Files changed:** 2 (1 modified: schema.prisma; 1 created: migration.sql)
**Commits:** 1 (`856ebaf`)

## Task Breakdown

### Task 1 — Pre-flight gate (PARTIAL)

**Grep gate (COMPLETE):**
```
$ bash packages/db/scripts/phase7-grep-gate.sh
ok Phase 7 grep gate PASSED — no legacy enum writes
$ echo $?
0
```

Confirms Plan 04's ENFORCE mode remains green — zero legacy enum writes in the 4 watched files (`cmdb.service.ts`, `application.service.ts`, `cmdb-import.service.ts`, `cmdb-reconciliation.ts`) plus the audit-only `routes/v1/assets/index.ts`.

**phase7-verify.ts (DEFERRED):** Could not run — requires a reachable DATABASE_URL. The worktree's sandbox cannot reach the configured dev DB at `10.1.200.153:5432` (connection timeout), and no local Docker postgres is running. See "Environment Blockers" below.

**Backfill idempotency re-run (DEFERRED):** Same DB-unreachable reason.

### Task 2 — Schema + migration (OFFLINE-COMPLETE, live apply DEFERRED)

**Step 2a — schema.prisma edits (DONE, committed in `856ebaf`):**

Applied the following in the worktree at `packages/db/prisma/schema.prisma`:

| Line | Model | Before | After |
|-----:|-------|--------|-------|
| 2204 | CmdbConfigurationItem | `classId             String? @db.Uuid` | `classId             String @db.Uuid` |
| 2205 | CmdbConfigurationItem | `lifecycleStatusId   String? @db.Uuid` | `lifecycleStatusId   String @db.Uuid` |
| 2206 | CmdbConfigurationItem | `operationalStatusId String? @db.Uuid` | `operationalStatusId String @db.Uuid` |
| 2207 | CmdbConfigurationItem | `environmentId       String? @db.Uuid` | `environmentId       String @db.Uuid` |
| 2263 | CmdbConfigurationItem | `ciClass           CmdbCiClass?     @relation(...)` | `ciClass           CmdbCiClass      @relation(...)` |
| 2264 | CmdbConfigurationItem | `lifecycleStatus   CmdbStatus?      @relation("CmdbCiLifecycleStatus", ...)` | `lifecycleStatus   CmdbStatus       @relation("CmdbCiLifecycleStatus", ...)` |
| 2265 | CmdbConfigurationItem | `operationalStatus CmdbStatus?      @relation("CmdbCiOperationalStatus", ...)` | `operationalStatus CmdbStatus       @relation("CmdbCiOperationalStatus", ...)` |
| 2266 | CmdbConfigurationItem | `cmdbEnvironment   CmdbEnvironment? @relation(...)` | `cmdbEnvironment   CmdbEnvironment  @relation(...)` |
| 2334 | CmdbRelationship | `relationshipTypeId String? @db.Uuid` | `relationshipTypeId String @db.Uuid` |
| 2351 | CmdbRelationship | `relationshipTypeRef CmdbRelationshipTypeRef? @relation(...)` | `relationshipTypeRef CmdbRelationshipTypeRef  @relation(...)` |
| 2353 | CmdbRelationship | `@@unique([sourceId, targetId, relationshipType])` | `@@unique([sourceId, targetId, relationshipTypeId])` |

The 5 relation-field edits (lines 2263-2266, 2351) were NOT explicitly called out in the plan's `<interfaces>` block but Prisma REQUIRES relation optionality to match the FK scalar's nullability. Applied as a Rule 3 (blocking) auto-fix — the schema would not validate without these.

**Step 2b — migration generation (DONE via `prisma migrate diff`, committed in `856ebaf`):**

Because the plan's prescribed `pnpm prisma migrate dev --create-only` still requires a live DATABASE_URL for shadow-DB creation, used the offline-capable alternative:

```bash
cd packages/db && node_modules/.bin/prisma migrate diff \
  --from-schema /tmp/schema-before-phase7.prisma \
  --to-schema /tmp/schema-to.prisma \
  --script > /tmp/migration-raw.sql
```

This produced the standard Prisma migration body, verified against expectation (A6):

- 5 × `ALTER TABLE ... DROP CONSTRAINT` (drops existing FK constraints so SET NOT NULL is permitted)
- 1 × `DROP INDEX "cmdb_relationships_sourceId_targetId_relationshipType_key"` (legacy enum unique index)
- 2 × `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` (4 columns in cmdb_configuration_items bundled, 1 column in cmdb_relationships)
- 1 × `CREATE UNIQUE INDEX "cmdb_relationships_sourceId_targetId_relationshipTypeId_key" ON "cmdb_relationships"("sourceId", "targetId", "relationshipTypeId")` — **A6 verified: not CONCURRENTLY** (standard index create; works inside the implicit prisma-migrate transaction)
- 5 × `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES ... ON DELETE RESTRICT ON UPDATE CASCADE` (FK constraints recreated post-NOT-NULL-flip)

**Step 2c — A6 inspection result:**

Prisma 7.5.0 did NOT generate `CREATE INDEX CONCURRENTLY`, so the standard `DO $$ ... $$` wrapping pattern works without needing to split the migration into multiple files. The index CREATE runs inside the implicit prisma-migrate transaction alongside the DROP / ALTER statements — if ANY step fails (including the pre-flight DO block RAISE EXCEPTION), Postgres rolls back ALL of it. Clean atomic migration.

**Step 2d — Pre-flight DO block prepended (DONE, committed in `856ebaf`):**

Wrote the final migration at `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql` with TWO DO blocks prepended to Prisma's generated body:

1. **Null-FK gate** (lines 13-38): counts null `classId` / `lifecycleStatusId` / `operationalStatusId` / `environmentId` / `relationshipTypeId` across ALL tenants; if any > 0, `RAISE EXCEPTION` with the actionable message "Phase 7 backfill incomplete: classId=%, lifecycleStatusId=%, operationalStatusId=%, environmentId=%, relationshipTypeId=% rows still null. Run packages/db/scripts/phase7-backfill.ts before applying this migration."

2. **Duplicate gate** (lines 46-63): counts `(sourceId, targetId, relationshipTypeId)` compound groups with count > 1; if any > 0, `RAISE EXCEPTION` with "Phase 7 migration aborted: % duplicate ... groups exist. Resolve duplicates (e.g., HOSTS + VIRTUALIZES collisions) before retrying."

The duplicate gate is defense-in-depth — Plan 03's `phase7-backfill.ts` already catches HOSTS + VIRTUALIZES collapse at backfill time, but a window exists between Plan 03 backfill and Plan 06 migration where a buggy writer could introduce a new duplicate. The gate is cheap (one aggregation query on the indexed table) and produces an actionable operator message.

**Step 2e [BLOCKING] — Apply migration (DEFERRED, operator action required):**

Could not execute. See "Environment Blockers" below. Migration file is ready to apply as-is on the main tree:

```bash
cd packages/db && pnpm prisma migrate deploy
# (or for shadow-DB validation: pnpm prisma migrate dev)
```

**Step 2f — `prisma generate` (DEFERRED, operator action required):** Must run after 2e to regenerate Prisma client types.

**Step 2g — post-migration `phase7-verify.ts` (DEFERRED, operator action required):** Must report zero null FKs + "cmdb_relationships unique index uses relationshipTypeId".

**Step 2h — `apps/api` + `apps/worker` rebuilds (DEFERRED, operator action required):** Confirms Prisma client types align with the new NOT NULL columns (no `string | null` leaks for the 5 FKs).

### Task 3 — Final phase verification (FULLY DEFERRED to operator)

All of Task 3's steps require either a live DB (`phase7-verify.ts`, psql smoke queries, optional DB-level duplicate-rejection test) or a running dev stack (Playwright E2E `cmdb-ref-table-dropdowns.spec.ts`, Vitest `@meridian/api` suite with prisma adapter). The worktree sandbox has neither. Operator must re-run from the main tree after Task 2e applies the migration.

## Environment Blockers (why this plan checkpointed)

**Primary blocker: dev DB unreachable from the worktree sandbox.**

```
$ DATABASE_URL="postgresql://meridian:meridian@10.1.200.153:5432/meridian" \
  node -e "require('pg').Pool(...).query('SELECT current_database()')..."
FAILED: Connection terminated due to connection timeout
```

- Configured dev DB per `.env` / `apps/web/.env` / `packages/db/.env`: `10.1.200.153:5432`.
- 15-second connection timeout exceeded from the Windows agent environment.
- This is consistent with MEMORY `reference_servers.md` — the dev server is internal to the user's network; not all sandboxes route to it.

**Secondary blocker: no local Docker postgres.**
```
$ docker ps
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine: ...
```
Docker Desktop's Linux engine is stopped; `localhost:5432` and `127.0.0.1:5432` both `ECONNREFUSED`.

**Fallback used: `prisma migrate diff` to generate migration SQL offline.** The generated SQL is functionally identical to what `prisma migrate dev --create-only` would produce (Prisma internally uses the same Migration Engine). A6 verification confirms no CONCURRENTLY keyword was injected, so the standard DO-block wrapping pattern works without needing the live-DB shadow.

## Operator Runbook (what to do next)

On the main tree (with DB reachable):

```bash
cd C:\Users\greiner\OneDrive\ClaudeAI\MeridianITSM-Application

# 1) Pull this worktree's commit onto a branch you can apply
#    (the worktree branch is worktree-agent-a26685f7; commit 856ebaf)

# 2) Pre-flight: confirm backfill is done and grep gate is green
pnpm tsx packages/db/scripts/phase7-verify.ts   # must exit 0 (zero null FKs)
bash packages/db/scripts/phase7-grep-gate.sh     # must exit 0

# 3) Apply migration (pick one):
#    a) For deployment to staging/prod:
cd packages/db && pnpm prisma migrate deploy

#    b) For dev with shadow-DB validation:
cd packages/db && pnpm prisma migrate dev --skip-seed

# 4) Regenerate Prisma client
cd packages/db && pnpm prisma generate

# 5) Re-run verify — MUST now report "cmdb_relationships unique index uses relationshipTypeId"
pnpm tsx packages/db/scripts/phase7-verify.ts

# 6) Rebuild apps to confirm Prisma types align
pnpm --filter @meridian/api build
pnpm --filter worker build
pnpm --filter web build

# 7) Run the Vitest CMDB suites mentioned in phase_specifics
cd apps/api && pnpm vitest run \
  src/__tests__/cmdb-service.test.ts \
  src/__tests__/cmdb-import.test.ts \
  src/__tests__/cmdb-reconciliation.test.ts \
  src/__tests__/portal-context.test.ts \
  src/__tests__/portal-ai-sql-executor.test.ts \
  src/__tests__/ai-schema-context.test.ts

# 8) E2E (optional per phase_specifics — tolerated deferral)
pnpm --filter web playwright test tests/cmdb-ref-table-dropdowns.spec.ts
```

**If Step 2 (pre-flight) fails:**
- Null-FKs > 0 → run `pnpm tsx packages/db/scripts/phase7-backfill.ts` then re-verify.
- HOSTS + VIRTUALIZES duplicates surface → either delete one of the duplicate relationship rows or remap one of the two enum keys in the mapping table — see Plan 03 runbook.
- Grep gate fails → the main tree diverged from the worktree; re-run Plan 04 deliverables.

**If Step 3 fails with the "Phase 7 backfill incomplete" RAISE EXCEPTION:**
- The DO block fired — backfill is not actually complete on the target DB. Run `pnpm tsx packages/db/scripts/phase7-backfill.ts` against the SAME DATABASE_URL the migration was targeting, then retry Step 3.

**If Step 3 fails with "Phase 7 migration aborted: N duplicate ... groups exist":**
- The duplicate-detection DO block fired. Run this query to find the offenders:
  ```sql
  SELECT "sourceId", "targetId", "relationshipTypeId", COUNT(*)
    FROM "cmdb_relationships"
   WHERE "relationshipTypeId" IS NOT NULL
   GROUP BY 1, 2, 3
  HAVING COUNT(*) > 1;
  ```
- For each duplicate group, pick one row to keep and DELETE the others (or UPDATE them to a different `relationshipTypeId`). Then retry Step 3.

## Acceptance Criteria Trace

| # | Criterion | Result |
|---|-----------|--------|
| 1 | schema.prisma: 4 FK columns NOT NULL | PASS (grep returns 4) |
| 2 | schema.prisma: relationshipTypeId NOT NULL | PASS (grep returns 1) |
| 3 | schema.prisma: @@unique uses `[sourceId, targetId, relationshipTypeId]` | PASS (grep returns 1) |
| 4 | schema.prisma: legacy `@@unique(...relationshipType)` removed | PASS (grep returns 0) |
| 5 | Migration directory exists with `_phase7_ci_ref_notnull` suffix | PASS (1 match) |
| 6 | Migration contains pre-flight DO block with "Phase 7 backfill incomplete" | PASS |
| 7 | Migration has 5 ALTER TABLE SET NOT NULL | PASS (5 real + 1 in comment; 6 grep matches) |
| 8 | Migration has DROP INDEX for legacy unique | PASS |
| 9 | Migration has CREATE UNIQUE INDEX with relationshipTypeId | PASS |
| 10 | Migration applied to dev DB | **DEFERRED — operator action required (DB unreachable from sandbox)** |
| 11 | phase7-verify.ts reports "cmdb_relationships unique index uses relationshipTypeId" | **DEFERRED — runs after Criterion 10** |
| 12 | phase7-verify.ts exits 0 post-migration | **DEFERRED — runs after Criterion 10** |
| 13 | phase7-grep-gate.sh still exits 0 | PASS (verified in Task 1 partial) |
| 14 | apps/api builds | **DEFERRED — no node_modules in worktree (same as Plans 01-05)** |
| 15 | apps/worker builds | **DEFERRED — no node_modules in worktree** |
| 16 | Manual UI smoke (create a CI, observe FK ids) | **DEFERRED — operator; no dev stack running from sandbox** |
| 17 | Manual AI smoke ("how many servers?") | **DEFERRED — operator or phase /gsd-verify-work** |
| 18 | Optional DB-level duplicate-rejection test | **DEFERRED — operator; no DB access** |

**9 PASS / 9 DEFERRED.** The 9 deferred criteria all require either DB access or a pnpm-installed workspace; none indicate a defect in the delivered artifacts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Prisma relation fields require optionality parity with FK scalar**
- **Found during:** Task 2 Step 2a, after flipping the 5 FK columns from `String?` to `String`.
- **Issue:** Prisma 7 refuses to validate a schema where a required FK scalar (`classId String @db.Uuid`) still has an optional relation field (`ciClass CmdbCiClass?`). The plan's `<interfaces>` block listed only the 5 scalar-column edits, omitting the 5 corresponding relation-field edits. Without this fix, `prisma migrate diff` would have errored out with a validation message and the migration would not have generated.
- **Fix:** Flipped `ciClass CmdbCiClass?` → `ciClass CmdbCiClass` (and the 3 sibling relation fields) at lines 2263-2266, and `relationshipTypeRef CmdbRelationshipTypeRef?` → `relationshipTypeRef CmdbRelationshipTypeRef` at line 2351.
- **Files modified:** `packages/db/prisma/schema.prisma`.
- **Commit:** Included in `856ebaf` (atomic with the scalar-column flip).

**2. [Rule 3 - Blocking] Worktree-vs-base path hazard (Plan 04 deviation #1 recurrence)**
- **Found during:** Task 2 Step 2a, after the first `Edit` call — `md5sum` confirmed the edit landed on the BASE repo (`C:\Users\greiner\OneDrive\ClaudeAI\MeridianITSM-Application\packages\db\prisma\schema.prisma`) while the worktree still had the pre-edit content.
- **Issue:** Under OneDrive on Windows, the `Edit` and `Write` tools resolve absolute paths rooted at `C:\Users\greiner\OneDrive\ClaudeAI\MeridianITSM-Application\` to the base working tree, NOT the worktree at `.claude\worktrees\agent-a26685f7\`. Matches Plan 04 deviation #1 verbatim.
- **Fix:** Established per-file pattern: (1) Edit/Write in base, (2) `cp base → worktree`, (3) `git checkout` in base to restore pre-edit state, (4) verify worktree has the changes via `md5sum` + `grep`. Applied once for `schema.prisma` (edit → copy → restore) and once for the migration directory (Write → cp → `rm -rf` in base since the file was newly created).
- **Files affected:** `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql`.
- **Commit:** No separate commit — the worktree copies + base restores were the act of landing the real edits on disk.

**3. [Rule 3 - Blocking] `prisma migrate dev` requires a reachable DB; fell back to `prisma migrate diff`**
- **Found during:** Task 2 Step 2b, after grep-gate passed and schema edits were on disk.
- **Issue:** The plan prescribed `pnpm --filter @meridian/db prisma migrate dev --create-only --name phase7_ci_ref_notnull` which still requires a reachable DATABASE_URL to create a shadow DB for schema comparison. Dev DB at 10.1.200.153 was unreachable and no local Docker postgres is available.
- **Fix:** Used the offline-capable `prisma migrate diff --from-schema --to-schema --script` command (which uses the Migration Engine's pure-SQL diff without needing a DB) to generate the same migration body Prisma would have written under `migrate dev --create-only`. Manually assembled the final `migration.sql` (pre-flight DO blocks + Prisma's generated body). A6 verification confirmed no CONCURRENTLY keyword was produced, so the output is equivalent to what `migrate dev --create-only` would have written.
- **Files affected:** Generated `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql`.
- **Commit:** `856ebaf`.

### Deferred Issues

**1. Live migration apply + Prisma client regeneration + apps build + test suite + E2E.** All deferred due to the DB-unreachable environment. Operator runbook above documents exactly what to run. No artifact defect; pure environment gap.

**2. Plan 04 deferred issue "cross-tenant classId leakage" is NOT mitigated by this plan.** The DB FK constraint accepts any valid UUID classId (only checks `cmdbCiClass.id` exists, not that its `tenantId` matches the CI's `tenantId`). Tracked as a Phase 8+ hardening task per Plan 04's threat register. This plan's NOT NULL flip does NOT introduce or reduce this specific risk — a malicious client could previously have sent any valid classId; after this plan they still can.

## Multi-Tenancy Invariant (CLAUDE.md Rule #1)

**Global COUNT is intentional.** The pre-flight DO block queries `WHERE "classId" IS NULL` without a `tenantId` filter because the NOT NULL constraint is enforced at the column level — a single null row in ANY tenant fails `ALTER TABLE ... SET NOT NULL`. The matching `phase7-verify.ts` script DOES produce a per-tenant report (it runs in two phases: per-tenant count + a warn-only global check) so the operator can identify WHICH tenant needs attention if the DO block fires.

**Migration is tenant-agnostic by design** (like every DDL migration in this repo). Schema changes apply globally; tenant isolation is preserved by the existing tenantId column on both `cmdb_configuration_items` and `cmdb_relationships`. The new unique index `@@unique([sourceId, targetId, relationshipTypeId])` does NOT include tenantId, but that's acceptable because `sourceId` and `targetId` are UUIDs — two tenants cannot share a source CI id (`cmdb_configuration_items.id` is globally unique) so the constraint naturally scopes per-tenant via the source-CI PK.

## CLAUDE.md Compliance Check

- **Rule 1 (multi-tenancy):** See above. Migration applies globally; tenant isolation remains intact via tenantId columns and UUID primary keys. No cross-tenant leak introduced.
- **Rule 6 (AI Assistant Data Availability):** Plan 05 already updated `ai-schema-context.ts` to document the FK-only contract with NOT NULL annotations; this plan is the DB-side landing of that contract. No further AI-context update needed — the annotations were written forward-looking in Plan 05. Post-migration, every staff AI query against `cmdb_configuration_items` will match the documented DDL exactly.
- **Rule 7 (CSDM field ownership):** No cross-model field duplication introduced or removed. The Phase 0 contract at `docs/architecture/csdm-field-ownership.md` says FK columns own the class/status/environment/relationship data; this plan locks that ownership at the DB layer by making the FK columns NOT NULL. Phase 14 will drop the legacy enum columns (`type` / `status` / `environment` / `relationshipType`) per the master plan's two-deploy gate.

## Threat-Register Trace

| Threat ID | Result |
|-----------|--------|
| T-7-06-01 (Tampering — migration applied with incomplete backfill) | MITIGATED — pre-flight DO block aborts with actionable RAISE EXCEPTION listing per-column null counts; operator directed to run phase7-backfill.ts before retry |
| T-7-06-02 (DoS — NOT NULL conversion locks table) | ACCEPTED per plan — sub-second on dev DB; operator schedules production window |
| T-7-06-03 (Tampering — wrong DATABASE_URL) | ACCEPTED per plan — Prisma logs the host before apply; DO block is the safety net on wrong-DB runs (harmless on empty cmdb tables) |
| T-7-06-04 (Information disclosure — RAISE leaks data) | ACCEPTED per plan — aggregate null counts only; no tenant IDs, no customer data |
| T-7-06-05 (Cross-tenant ref-table leak via migration) | MITIGATED — Plan 03 backfill wrote tenant-scoped FKs; DO block verifies zero null FKs before the NOT NULL flip; the duplicate-detection DO block as an additional safety layer catches any rogue cross-tenant (sourceId, targetId) pairs (impossible since source/target UUIDs are globally unique, but belt-and-suspenders) |
| T-7-06-06 (Spoofing — stale Prisma client) | PARTIALLY MITIGATED — the post-apply `prisma generate` step is in the operator runbook; if skipped, TypeScript compilation will surface the drift the next time apps/api or apps/worker is built |

## Notes for Downstream Plans

- **Phase 8 (Asset hardware/OS dedup):** BLOCKED until operator applies this migration AND `phase7-verify.ts` reports "unique index uses relationshipTypeId". Phase 8 depends on Phase 7 FK columns being NOT NULL for its own Asset↔CI dedup joins.
- **Phase 14 (destructive DROP of legacy enum columns):** UNCHANGED. This migration does NOT drop `type` / `status` / `environment` / `relationshipType`; they remain for read-side backward compatibility. Phase 14 is the one-week production canary that drops them.
- **v2.0 ROADMAP Phase 7 success criteria:** The 5 criteria from ROADMAP.md are satisfied at the ARTIFACT level (schema.prisma + migration file) but NOT at the RUNTIME level (DB not yet migrated). The operator runbook above is the path to runtime satisfaction. Orchestrator should spawn the verifier only after the operator confirms runbook Step 5 (phase7-verify.ts reports both zero nulls AND "unique index uses relationshipTypeId").

## Known Stubs

None. No hardcoded empty values; no placeholder UI; no "coming soon" text. This plan changes one schema file and adds one migration file — pure DDL + documentation-adjacent artifacts.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or trust-boundary surface introduced. The NOT NULL flip HARDENS an existing trust boundary (the DB's FK-column contract): after the migration, a buggy or malicious code path that bypasses Plan 04's Zod route + service-layer classId guard STILL fails at the DB with a `NOT NULL violation` error. Three-layer defense-in-depth: (1) Zod (route), (2) service-layer throw (createCI guard), (3) Postgres NOT NULL (this plan, once applied).

## Self-Check: PASSED (partial — deferred items explicitly flagged)

- [x] `packages/db/prisma/schema.prisma` — 5 FK columns NOT NULL; 5 relation fields non-optional; @@unique rewritten to FK
- [x] `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql` — pre-flight DO blocks + 5 SET NOT NULL + DROP+CREATE UNIQUE INDEX + FK recreate
- [x] Migration file structure verified: `grep -c "SET NOT NULL"` returns 5 real (+1 in comment), `grep -c "Phase 7 backfill incomplete"` returns 1, `grep -c "CREATE UNIQUE INDEX.*relationshipTypeId"` returns 1
- [x] Commit `856ebaf` present in `git log`: `feat(07-06): [BLOCKING-offline] promote CMDB ref FKs to NOT NULL + rewrite unique index`
- [x] phase7-grep-gate.sh exits 0 against the worktree (Task 1 partial PASS)
- [x] Base-repo schema.prisma restored via `git checkout` (no stray edits committed to base)
- [x] Multi-tenancy posture documented (pre-flight DO block is tenant-agnostic by design; matching per-tenant verify script handles operator-facing reporting)
- [ ] **DEFERRED:** Migration applied to dev DB — operator action required (DB unreachable from sandbox)
- [ ] **DEFERRED:** Post-migration `phase7-verify.ts` reports unique-index rewrite confirmation — depends on previous item
- [ ] **DEFERRED:** apps/api + worker + web builds — operator action required
- [ ] **DEFERRED:** Vitest CMDB suites pass — operator action required
- [ ] **DEFERRED:** Manual UI + AI smoke tests — operator action required

**Status: CHECKPOINT returned to orchestrator. Artifacts committed and ready for operator apply.**
