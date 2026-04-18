---
phase: 08-retire-asset-hardware-os-duplication
plan: 01
subsystem: verification-harness
tags: [phase8, wave0, verify-harness, test-scaffolds, multi-tenancy]
requires: [phase7-shipped]
provides:
  - packages/db/scripts/phase8-verify.ts
  - packages/db/scripts/phase8-backfill.ts
  - packages/db/scripts/phase8-grep-gate.sh
  - apps/api/src/__tests__/cmdb-extension.test.ts
  - apps/api/src/__tests__/inventory-ingestion.test.ts
  - apps/web/tests/asset-technical-profile.spec.ts
  - apps/web/tests/asset-link-ci.spec.ts
  - apps/web/tests/asset-edit-no-tech-fields.spec.ts
  - apps/web/src/components/cmdb/CIPicker.tsx
affects:
  - apps/api/src/__tests__/asset-service.test.ts
  - apps/api/src/__tests__/ai-schema-context.test.ts
  - apps/api/src/__tests__/portal-context.test.ts
  - apps/api/src/__tests__/portal-ai-sql-executor.test.ts
tech-stack:
  added: []
  patterns:
    - "Per-tenant raw SQL reads via Prisma $queryRaw (chicken-and-egg avoidance)"
    - "information_schema introspection for column-existence checks"
    - "Environment-flagged bash grep gates (WARN/ENFORCE modes)"
    - "it.todo() scaffolds for vitest discovery without green-lie or red-blocker"
    - "test.skip() scaffolds for Playwright discovery without execution"
key-files:
  created:
    - packages/db/scripts/phase8-verify.ts
    - packages/db/scripts/phase8-backfill.ts
    - packages/db/scripts/phase8-grep-gate.sh
    - apps/api/src/__tests__/cmdb-extension.test.ts
    - apps/api/src/__tests__/inventory-ingestion.test.ts
    - apps/web/tests/asset-technical-profile.spec.ts
    - apps/web/tests/asset-link-ci.spec.ts
    - apps/web/tests/asset-edit-no-tech-fields.spec.ts
    - apps/web/src/components/cmdb/CIPicker.tsx
  modified:
    - apps/api/src/__tests__/asset-service.test.ts
    - apps/api/src/__tests__/ai-schema-context.test.ts
    - apps/api/src/__tests__/portal-context.test.ts
    - apps/api/src/__tests__/portal-ai-sql-executor.test.ts
decisions:
  - "Phase 8 grep gate defaults to WARN mode (PHASE8_GATE_ENFORCE=0) in Wave 0 because Waves 1-2 still need the legacy fields to compile. Plan 08-04 (Wave 3) flips to ENFORCE."
  - "CIPicker.tsx uses React 19 `ReactElement` type annotation (not `JSX.Element`) — JSX namespace is no longer global in React 19."
  - "Wave 1 mock scaffold from PATTERNS.md section 20 ships commented-out INSIDE cmdb-extension.test.ts so the Wave 1 agent uncomments verbatim rather than re-deriving the hoist shape."
  - "phase8-verify.ts hard-fails ONLY on (a) cross-tenant leak in cmdb_software_installed or (b) dropped columns still present post-Wave-5. Pre-Wave-5 state (dropped cols still on Asset) is logged as informational not a fail."
  - "phase8-verify.ts gates its per-tenant ext/software/audit COUNT queries behind an information_schema.tables existence check so Wave 0 runs don't error on 'relation cmdb_ci_servers does not exist'."
metrics:
  duration_seconds: 491
  task_count: 3
  file_count: 13
  completed_date: 2026-04-18
---

# Phase 08 Plan 01: Verification Harness Summary

One-liner: Wave 0 ships a complete Phase 8 verification harness — 3 DB scripts, 2 new Vitest scaffolds, 4 extended Vitest files, 3 Playwright spec scaffolds, and the CIPicker React skeleton — so every later wave can prove correctness via `pnpm tsx packages/db/scripts/phase8-verify.ts`, `pnpm --filter @meridian/api vitest run -t "..."`, `pnpm --filter web playwright test --grep "..."`, and `bash packages/db/scripts/phase8-grep-gate.sh` without any wave re-inventing the harness.

## Objective

Build every test, script, and component skeleton the later waves of Phase 8 depend on, BEFORE any source code is touched. Every test body that depends on later-wave implementations ships as `it.todo()` / `test.skip()` so discovery works but no green-lies pass the suite.

## Tasks Completed

### Task 1: Phase 8 DB scripts (verify + backfill skeleton + grep gate)

Created three scripts under `packages/db/scripts/` matching Phase 7 conventions exactly.

**`packages/db/scripts/phase8-verify.ts`** (166 lines) — DB introspection script with four checks:
- Check 1: per-tenant counts of assets, CIs linked to assets, CmdbCiServer extension rows, CmdbSoftwareInstalled rows, cmdb_migration_audit rows with `status='overwritten_by_ci'` and `phase='phase8'`. Gated behind information_schema.tables existence check so Wave 0 doesn't error before Wave 1 adds the tables.
- Check 2: post-Wave-5 column-existence — the 10 dropped Asset hardware fields MUST be gone. Pre-Wave-5 state is informational (the drop migration hasn't shipped yet).
- Check 3: post-Wave-1 readiness — logs "X/24 expected new columns/tables present" so operator knows the additive migration state.
- Check 4: cross-tenant leak — `SELECT COUNT(*) FROM cmdb_software_installed s JOIN cmdb_configuration_items ci ON s.ciId = ci.id WHERE s.tenantId <> ci.tenantId`. Any leak is a hard FAIL (exits 1) — this is the affirmative multi-tenancy isolation assertion (T-8-01-02 mitigation).

**`packages/db/scripts/phase8-backfill.ts`** (76 lines) — SKELETON. Imports + Prisma adapter setup verbatim from phase7-backfill.ts, DRY_RUN flag detection, per-tenant for-loop over `tenant.findMany({ where: { isActive: true } })`, stub `migrateTenant` function that logs `[SKELETON — implementation in Wave 2]` per tenant and returns `{ ciUpserted: 0, softwareUpserted: 0, conflicts: 0 }`. Wave 2 (plan 08-03) replaces the stub body. T-8-01-01 mitigation: zero writes in Wave 0.

**`packages/db/scripts/phase8-grep-gate.sh`** (55 lines, +x) — static-analysis gate for the 10 dropped Asset hardware fields across `apps/api/src/services/asset.service.ts`, `apps/api/src/routes/v1/assets/index.ts`, `apps/worker/src/workers/cmdb-reconciliation.ts`, `apps/web/src/app/dashboard/assets/[id]/page.tsx`. Default `PHASE8_GATE_ENFORCE=0` in Wave 0 (WARN mode, exits 0 even on hits). Plan 08-04 (Wave 3) flips to ENFORCE=1. All 10 field names pinned verbatim per T-7-01-02 rename-around defense.

**Commit:** `40b54a4`

### Task 2: Vitest scaffolds (new + extended)

**New files (it.todo-only scaffolds):**

- `apps/api/src/__tests__/cmdb-extension.test.ts` — 5 `it.todo` stubs for upsertServerExtensionByAsset. The full Wave 1 mock scaffold (vi.hoisted + vi.mock + prismaTransaction + 8 mock fns) is commented in-file so Wave 1 agent uncomments verbatim from PATTERNS.md section 20.
- `apps/api/src/__tests__/inventory-ingestion.test.ts` — 2 `it.todo` stubs for POST /agents/inventory reroute.

**Extended existing files (APPEND-ONLY — zero existing tests removed):**

- `asset-service.test.ts`: +1 describe with 2 it.todo (CASR-01 negative assertions). Wave 3 (plan 08-04) strips the legacy dropped-field tests once interfaces drop the fields.
- `ai-schema-context.test.ts`: +1 describe with 3 it.todo (CAI-01 — assets has no hostname/operatingSystem, cmdb_ci_servers has new cols, cmdb_migration_audit excluded).
- `portal-context.test.ts`: +1 describe with 3 it.todo (CAI-02 — cmdb_software_installed + cmdb_migration_audit exclusion + exclusion comment present).
- `portal-ai-sql-executor.test.ts`: +1 describe with 2 it.todo (CAI-03 — rejects SELECT on cmdb_software_installed + cmdb_migration_audit).

Every `it.todo` title matches the VALIDATION.md `-t "..."` filter strings verbatim so `pnpm --filter @meridian/api vitest run -t "..."` discovers the correct pending test without string drift.

**Vitest run result (all 6 files):**
- Test Files: 4 passed + 2 skipped (all 6 discovered)
- Tests: 27 passed + 17 todo (≥14 required ✓)
- Suite exits 0 (todos never fail the suite)

**Commit:** `1edabbf`

### Task 3: Playwright specs + CIPicker skeleton

**Playwright specs (all `test.skip` so list --grep discovers exactly 1 test per file):**

- `apps/web/tests/asset-technical-profile.spec.ts` — CASR-05 Technical Profile tab renders linked CI hardware. Wave 5 implementation plan documented inline (login → navigate → tab click → assert OS/CPU/Memory labels + software list).
- `apps/web/tests/asset-link-ci.spec.ts` — CASR-05 / D-04 orphan empty state + Link-a-CI flow. Wave 5 plan: empty state → Link a CI → CIPicker opens → search → select → PATCH CI.assetId.
- `apps/web/tests/asset-edit-no-tech-fields.spec.ts` — CASR-01 negative. Wave 5 plan: Asset edit form MUST have 0 labels matching hostname / OS / CPU Model / CPU Cores / RAM.

**React skeleton:**

- `apps/web/src/components/cmdb/CIPicker.tsx` — D-04 CI search picker. Exports `CIPicker` and `CIOption` interface so Wave 5 page wiring resolves the import. Renders inert placeholder (`<div data-testid="ci-picker-skeleton">`) when `open=true`. Multi-tenancy (CLAUDE.md Rule 1) documented in header: Wave 5 fetch MUST NOT add tenantId query param — server-side filters by session JWT tenantId. T-8-01-05 mitigation noted inline.

**Playwright list verification:**
- `playwright test --list --grep "asset-technical-profile"` → 1 test discovered ✓
- `playwright test --list --grep "asset-link-ci"` → 1 test discovered ✓
- `playwright test --list --grep "asset-edit-no-tech-fields"` → 1 test discovered ✓
- `grep -c "export function CIPicker\|export interface CIOption" CIPicker.tsx` → 2 ✓
- `tsc --noEmit`: 0 errors in the 4 new files (9 pre-existing errors elsewhere are out of scope).

**Commit:** `81cbafc`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed React 19 `JSX.Element` namespace resolution in CIPicker.tsx**

- **Found during:** Task 3 TypeScript verification (`pnpm --filter web tsc --noEmit`)
- **Issue:** The plan's skeleton in PATTERNS.md section 19 uses `JSX.Element | null` as the return type annotation. React 19 removed the global `JSX` namespace — tsc fails with `TS2503: Cannot find namespace 'JSX'`.
- **Fix:** Imported `type ReactElement` from 'react' and changed return type to `ReactElement | null`. Functionally identical; no behavior change.
- **Files modified:** `apps/web/src/components/cmdb/CIPicker.tsx`
- **Commit:** `81cbafc` (same commit as Task 3 delivery — fix was applied before commit)
- **Follow-up:** When Wave 5 page wires CIPicker, it should also use `ReactElement` if it needs to annotate the component's return type.

### Environmental Gates (Not Deviations)

**1. Database unreachable during local verification**

- **Condition:** `pnpm --filter @meridian/db exec tsx scripts/phase8-verify.ts` raised `PrismaClientKnownRequestError: ECONNREFUSED` against `postgresql://meridian:meridian@localhost:5432/meridian`. Docker Desktop is installed but not running (`docker ps` → pipe error).
- **Precedent:** Phase 07-06 (`a73f8f6` — "docs(07-06): SUMMARY — CHECKPOINT (DB unreachable; schema + migration ready for operator apply)") — the project has an established pattern of accepting DB-unreachable worktree execution and completing the harness delivery.
- **Impact on acceptance criteria:** The script bodies were verified to LOAD and issue $queryRaw (error only on DB connect, not on script logic). The static-analysis acceptance criteria all PASSED:
  - `bash packages/db/scripts/phase8-grep-gate.sh` exits 0 (WARN mode) ✓
  - `grep -c "PHASE8_GATE_ENFORCE" phase8-grep-gate.sh` → 3 (≥2 required) ✓
  - `grep -c "phase8" phase8-verify.ts` → 5 (≥1 required) ✓
  - All 10 Asset field names present in grep-gate ✓
- **Deferred:** Wave 0 sanity re-seed (A3 / Pitfall 7 mitigation — `pnpm tsx packages/db/scripts/seed-existing-tenants-cmdb-ref.ts`) could not run because DB is down. The seed script is idempotent (A10 VERIFIED) and has no Wave 0 side effects outside reference-data upsert. **Operator action:** run the re-seed once the dev DB is reachable before Wave 1 (plan 08-02) migration authoring.
- **Backfill dry-run:** Same environmental gate — `pnpm tsx packages/db/scripts/phase8-backfill.ts --dry-run` will exit 0 as soon as the DB is up (the skeleton has zero writes and the tenant-fetch query is standard).

## Artifacts Shipped

| Path | Lines | Notes |
|------|-------|-------|
| `packages/db/scripts/phase8-verify.ts` | 166 | DB introspection + per-tenant counts + cross-tenant leak check |
| `packages/db/scripts/phase8-backfill.ts` | 76 | Skeleton, DRY_RUN flag, per-tenant stub |
| `packages/db/scripts/phase8-grep-gate.sh` | 55 (+x) | WARN mode Wave 0; ENFORCE in Wave 3 |
| `apps/api/src/__tests__/cmdb-extension.test.ts` | 80 | 5 it.todo + Wave 1 mock scaffold (commented) |
| `apps/api/src/__tests__/inventory-ingestion.test.ts` | 21 | 2 it.todo for POST /agents/inventory reroute |
| `apps/api/src/__tests__/asset-service.test.ts` | 322 (was 309) | +Phase 8 describe block |
| `apps/api/src/__tests__/ai-schema-context.test.ts` | 112 (was 96) | +Phase 8 describe block (CAI-01) |
| `apps/api/src/__tests__/portal-context.test.ts` | 46 (was 31) | +Phase 8 describe block (CAI-02) |
| `apps/api/src/__tests__/portal-ai-sql-executor.test.ts` | 96 (was 82) | +Phase 8 describe block (CAI-03) |
| `apps/web/tests/asset-technical-profile.spec.ts` | 29 | test.skip with Wave 5 plan inline |
| `apps/web/tests/asset-link-ci.spec.ts` | 33 | test.skip with Wave 5 plan inline |
| `apps/web/tests/asset-edit-no-tech-fields.spec.ts` | 30 | test.skip with Wave 5 plan inline |
| `apps/web/src/components/cmdb/CIPicker.tsx` | 60 | Skeleton; exports CIPicker + CIOption |

## Wave 0 Sanity Re-seed (A3 / Pitfall 7)

**Status:** **DEFERRED due to DB unreachable in worktree.**

**What was planned:** `pnpm tsx packages/db/scripts/seed-existing-tenants-cmdb-ref.ts` — idempotent re-run to seed any tenant that was created between Phase 7 ship (2026-04-17) and Phase 8 start.

**Why deferred:** PostgreSQL 15+ is not reachable from this worktree (Docker Desktop not running; `ECONNREFUSED :5432`).

**Operator required action before Wave 1 (plan 08-02) ships:**
```bash
# Bring dev DB up (from project root):
docker compose up -d postgres
# Wait ~3 seconds for init, then:
pnpm --filter @meridian/db exec tsx scripts/seed-existing-tenants-cmdb-ref.ts
# Expected: exit 0. If any tenant lacks CMDB reference data, the script
# upserts the missing rows (15 classes, 6 envs, 13 rel types, 11 statuses).
```

**Tenants expected to have CMDB reference data** (per A3 assumption — all existing tenants seeded during Phase 4 signup flow or via Phase 7 07-01 backfill): ALL active tenants. If the post-re-seed verify script (`pnpm tsx packages/db/scripts/phase8-verify.ts`) reports `ext_count=0` or `software_row_count=0` for a tenant AND that tenant has assets, that's Wave 2 (plan 08-03) work — NOT a Wave 0 failure. The Wave 0 sanity check only guarantees reference-table rows exist.

## Verify Script Output Snapshot

**Wave 0 snapshot (expected, pre-Wave-1):**

```
phase8-verify: DB introspection + per-tenant counts + cross-tenant leak check

  i Wave 1 additive migration not yet applied — skipping per-tenant ext/software/audit counts

  i Wave 5 not yet applied — 10/10 dropped Asset columns still present (expected pre-Wave-5):
    hostname, operatingSystem, osVersion, cpuModel, cpuCores, ramGb, disks,
    networkInterfaces, softwareInventory, lastInventoryAt
  i Wave 1 readiness: 0/24 expected new columns/tables present
  i Cross-tenant leak check skipped — cmdb_software_installed not yet created

ok Phase 8 verify: all checks passed (or Wave 1 not yet shipped)
```

Wave 5 comparison target (post all waves): `Wave 1 readiness: 24/24 expected new columns/tables present` + `ok Wave 5 applied — all 10 Asset hardware columns dropped` + `ok No cross-tenant leaks detected`.

## Multi-Tenancy Posture (CLAUDE.md Rule 1)

Every artifact in this plan respects the project's #1 rule:
- `phase8-verify.ts` check 4 (cross-tenant leak) is the affirmative multi-tenancy assertion.
- `phase8-backfill.ts` skeleton's per-tenant loop over `tenant.findMany({ where: { isActive: true } })` — never batches across tenants.
- All 5 `cmdb-extension.test.ts` stubs include `upsertServerExtensionByAsset rejects cross-tenant Asset` — a stand-alone tenant-isolation test that Wave 1 must implement.
- `CIPicker.tsx` header documents: "no client-side tenant param — server-side scopes by session JWT tenantId".
- Playwright specs use `loginAsMspAdmin` (per comments) which locks session to a single tenant; no test crosses tenant boundaries.

## Threat Model Check

| Threat ID | Disposition | Wave 0 Status |
|-----------|-------------|---------------|
| T-8-01-01 Tampering (backfill writes) | mitigate | ✓ Skeleton ships with zero INSERT/UPDATE — only stub log + early return |
| T-8-01-02 Info Disclosure (cross-tenant verify) | mitigate | ✓ Check 4 in phase8-verify.ts is the affirmative guard |
| T-8-01-03 DoS (grep-gate false positives) | accept | ✓ WARN mode default in Wave 0 |
| T-8-01-04 Spoofing (seed re-run) | accept | ✓ Re-seed idempotent (A10); deferred to operator (DB down in worktree) |
| T-8-01-05 Info Disclosure (CIPicker fetch) | mitigate | ✓ Wave 0 skeleton has no fetch; Wave 5 contract documented in CIPicker header |
| T-8-01-06 Spoofing (E2E tenant context) | accept | ✓ test.skip in Wave 0; Wave 5 plan documents loginAsMspAdmin use |

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `40b54a4` | feat(08-01): Wave 0 DB scripts — phase8-verify, phase8-backfill skeleton, phase8-grep-gate |
| 2 | `1edabbf` | test(08-01): Wave 0 vitest scaffolds for Phase 8 CASR-06 + CAI-01/02/03 |
| 3 | `81cbafc` | test(08-01): Wave 0 Playwright E2E scaffolds + CIPicker skeleton |

## Requirements Addressed

Wave 0 scaffolds the test harness for the full set of Phase 8 requirements. None are COMPLETED in Wave 0 — all implementation lands in Waves 1-5. Coverage:

- **CASR-01** (drop 10 Asset fields): negative assertions scaffolded in asset-service.test.ts + asset-edit-no-tech-fields.spec.ts; grep-gate watches all 10 field names.
- **CASR-02** (extend CmdbCiServer): phase8-verify.ts Check 3 watches for cpuModel/disksJson/networkInterfacesJson.
- **CASR-03** (CmdbSoftwareInstalled): phase8-verify.ts Check 3 watches for the 11 expected columns.
- **CASR-04** (backfill + conflict log): phase8-backfill.ts skeleton; Wave 2 implementation.
- **CASR-05** (Asset detail Technical Profile tab): 3 Playwright specs scaffolded.
- **CASR-06** (inventory ingestion reroute): cmdb-extension.test.ts + inventory-ingestion.test.ts scaffolded.
- **CAI-01** (AI schema context): ai-schema-context.test.ts Phase 8 describe block.
- **CAI-02** (portal schema context): portal-context.test.ts Phase 8 describe block.
- **CAI-03** (portal AI SQL executor): portal-ai-sql-executor.test.ts Phase 8 describe block.

## Next Wave

**Wave 1 (plan 08-02)** — DB migration: additive schema changes. Uncomment the cmdb-extension.test.ts Wave 1 mock scaffold, write the additive migration SQL (2 new models + 3 CmdbCiServer columns), generate Prisma client, implement `upsertServerExtensionByAsset` service, wire it into `/api/v1/agents/inventory`. All five `it.todo` in cmdb-extension.test.ts convert to real `it(...)` blocks that Wave 1 must pass.

## Self-Check: PASSED

**Files verified present:**
- `packages/db/scripts/phase8-verify.ts` → FOUND
- `packages/db/scripts/phase8-backfill.ts` → FOUND
- `packages/db/scripts/phase8-grep-gate.sh` → FOUND (+x)
- `apps/api/src/__tests__/cmdb-extension.test.ts` → FOUND
- `apps/api/src/__tests__/inventory-ingestion.test.ts` → FOUND
- `apps/api/src/__tests__/asset-service.test.ts` → FOUND (extended)
- `apps/api/src/__tests__/ai-schema-context.test.ts` → FOUND (extended)
- `apps/api/src/__tests__/portal-context.test.ts` → FOUND (extended)
- `apps/api/src/__tests__/portal-ai-sql-executor.test.ts` → FOUND (extended)
- `apps/web/tests/asset-technical-profile.spec.ts` → FOUND
- `apps/web/tests/asset-link-ci.spec.ts` → FOUND
- `apps/web/tests/asset-edit-no-tech-fields.spec.ts` → FOUND
- `apps/web/src/components/cmdb/CIPicker.tsx` → FOUND

**Commits verified present:**
- `40b54a4` → FOUND in git log
- `1edabbf` → FOUND in git log
- `81cbafc` → FOUND in git log
