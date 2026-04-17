---
phase: 07-ci-reference-table-migration
plan: 02
subsystem: cmdb-reference-seed-and-resolver
tags: [cmdb, multi-tenancy, tenant-lifecycle, fk-resolver, seed-extraction, csdm]
requires:
  - packages/db/prisma/schema.prisma (CmdbCiClass, CmdbStatus, CmdbEnvironment, CmdbRelationshipTypeRef models)
  - packages/db/prisma/seed.ts (existing 15+11+6+13 literal content — source for A7 verbatim extraction)
  - apps/worker/src/workers/cmdb-reconciliation.ts:48-94 (resolver pattern source)
provides:
  - "@meridian/db/seeds/cmdb-reference: seedCmdbReferenceData(tx, tenantId) — reusable tx-aware seeder"
  - "@meridian/api service: cmdb-reference-resolver.service.ts — 5 tenant-scoped FK resolvers + clearResolverCaches"
  - "signup.ts tenant-creation path seeds CMDB ref data inside the existing $transaction"
  - "provisioning.ts owner-admin path seeds CMDB ref data inside the existing $transaction"
affects:
  - "Every new tenant (public signup OR owner-admin provisioning) now ships with complete CMDB reference vocabulary"
  - "Plan 07-04 (cmdb.service.ts rewrite) can now import resolveLifecycleStatusId from the new service"
  - "Plan 07-06 (worker refactor) can now import the resolver module instead of duplicating logic"
tech-stack:
  added: []
  patterns:
    - "Prisma.TransactionClient parameter for reusable, transaction-aware seeders"
    - "Per-process Map cache keyed by ${tenantId}:... for FK resolvers (multi-tenancy invariant)"
    - "Subpath package export (@meridian/db/seeds/cmdb-reference) for deep imports"
key-files:
  created:
    - packages/db/src/seeds/cmdb-reference.ts
    - packages/db/src/__tests__/cmdb-reference-seed.test.ts
    - apps/api/src/services/cmdb-reference-resolver.service.ts
    - apps/api/src/__tests__/signup-cmdb-seed.test.ts
  modified:
    - packages/db/src/index.ts
    - packages/db/package.json
    - packages/db/prisma/seed.ts
    - apps/api/src/routes/auth/signup.ts
    - apps/owner/src/lib/provisioning.ts
decisions:
  - "A3 VERIFIED: provisioning.ts uses the same prisma.$transaction(async (tx) => {...}) pattern as signup.ts — the seeder drops in cleanly on both paths. Both were wired."
  - "Direct-seeder-call test strategy selected for signup-cmdb-seed.test.ts (plan-permitted simpler alternative) — avoids Fastify route-handler wiring complexity while still proving the seeder contract + multi-tenancy invariant."
  - "Status resolver cache keys include statusType as a second segment (${tenantId}:lifecycle:${key} vs ${tenantId}:operational:${key}) because the same statusKey (e.g., 'unknown') can exist for both types; a shared cache without the type segment would conflate them."
metrics:
  duration_minutes: 18
  tasks_completed: 3
  files_changed: 9
  completed_date: 2026-04-17
---

# Phase 7 Plan 02: CMDB Reference Seed Extraction + Resolver Service Summary

Extract the tenant-lifecycle CMDB reference seeder into a reusable tx-aware helper, wire it into both tenant-creation paths (public signup + owner provisioning), and add a shared FK resolver service that Plan 04's cmdb.service rewrite will consume.

## Overview

**One-liner:** Reusable `seedCmdbReferenceData(tx, tenantId)` helper wired into signup + owner provisioning transactions, plus a shared tenant-scoped FK resolver service with per-process caches.

**Duration:** 18 minutes
**Tasks:** 3/3 completed
**Files changed:** 9 (4 created, 5 modified)

## What Shipped

### Task 1 — Extract reusable seedCmdbReferenceData
**Commit:** `5d03deb`

Created `packages/db/src/seeds/cmdb-reference.ts` exporting
`async function seedCmdbReferenceData(tx: Prisma.TransactionClient, tenantId: string): Promise<void>`.

- Seeds 15 CI classes, 6 lifecycle statuses, 5 operational statuses, 6 environments, 13 relationship types — values verbatim-extracted from the prior `packages/db/prisma/seed.ts:357-466` (A7 lock: no additions, no removals, no label changes).
- All 4 upsert loops use `tx.X.upsert(...)` with `update: {}` (idempotent — re-running never overwrites tenant customizations).
- Parent-class wiring preserved (`virtual_machine → server`, `load_balancer → network_device`, `application_instance → application`, `saas_application → application`).
- Added `./seeds/cmdb-reference` subpath export to `packages/db/package.json` so consumers can deep-import via `@meridian/db/seeds/cmdb-reference`.
- Re-exported `seedCmdbReferenceData` from `packages/db/src/index.ts`.
- Refactored `packages/db/prisma/seed.ts` to delegate: the 130-line inline literal is replaced with `await prisma.$transaction(async (tx) => { await seedCmdbReferenceData(tx, tenant.id); })` — demo-seed behavior identical.
- Added 6 Vitest cases at `packages/db/src/__tests__/cmdb-reference-seed.test.ts` asserting: 15 classes, 11 statuses (6+5), 6 envs, 13 rel-types, multi-tenancy (every upsert carries the passed tenantId), idempotent `update: {}` pattern, parent-class wiring.

### Task 2 — cmdb-reference-resolver.service.ts
**Commit:** `327c574`

Created `apps/api/src/services/cmdb-reference-resolver.service.ts` exporting 5 tenant-scoped resolvers + 1 cache-clear function:
- `resolveClassId(tenantId, classKey)`
- `resolveLifecycleStatusId(tenantId, statusKey)` — cache key `${tenantId}:lifecycle:${statusKey}`
- `resolveOperationalStatusId(tenantId, statusKey)` — cache key `${tenantId}:operational:${statusKey}`
- `resolveEnvironmentId(tenantId, envKey)`
- `resolveRelationshipTypeId(tenantId, relationshipKey)` (Phase 7 NEW)
- `clearResolverCaches()` — resets all 4 per-process Map caches

Every cache key starts with `${tenantId}:` as the FIRST segment (multi-tenancy invariant — Tenant A's resolved id can never be returned for Tenant B). Status cache keys additionally include `statusType` because the same `statusKey` (e.g., `'unknown'`) exists for both lifecycle and operational types and a shared cache without the type segment would conflate them. Every Prisma query uses `where: { tenantId, ... }`.

Pattern extracted verbatim from `apps/worker/src/workers/cmdb-reconciliation.ts:48-94`, then extended with `resolveOperationalStatusId` and `resolveRelationshipTypeId` which Phase 7 introduces. Plan 04 will refactor the worker to import from this shared module.

### Task 3 — Wire into signup + provisioning
**Commit:** `766f8f3`

Wired `seedCmdbReferenceData(tx, tenant.id)` into both tenant-creation paths:
- **apps/api/src/routes/auth/signup.ts:191** — inside the existing `prisma.$transaction(async (tx) => {...})` block (starts at line 126), after categories upsert (step 5) and before admin user creation (step 6).
- **apps/owner/src/lib/provisioning.ts:265** — inside the existing `prisma.$transaction(async (tx) => {...})` block (starts at line 167), after notification templates upsert (step 6.5) and before admin user creation (step 7).

Added `apps/api/src/__tests__/signup-cmdb-seed.test.ts` with 5 Vitest cases using the plan-permitted direct-seeder-call approach: asserts 15 CI class upserts carrying the new tenantId, 11 status upserts (6 lifecycle + 5 operational), 6 environments, 13 relationship types, and idempotent `update: {}` on every upsert. The wiring assertion (that signup.ts and provisioning.ts actually call the seeder) is covered by the grep acceptance criteria.

## A3 Outcome (Assumption Verification)

**A3 (LOCKED):** Owner-admin provisioning at `apps/owner/src/lib/provisioning.ts:167` uses the same `prisma.$transaction(async (tx) => {...})` pattern as `signup.ts:126`.

**Verified:** TRUE. `apps/owner/src/lib/provisioning.ts:167` opens `prisma.$transaction(async (tx) => {` and contains sequential `await tx.X.upsert(...)` calls (roles, SLAs, categories, notification templates) — identical in shape to signup.ts. The seeder call at line 265 sits inside this block with `tx` and `tenant.id` in scope. Both paths now invoke `seedCmdbReferenceData`. The plan's SUMMARY-contingent fallback ("only modify signup.ts if A3 falsified") was not needed.

## Insertion Line Numbers (for Plan 06 final verification)

| File | Line | Statement |
|------|------|-----------|
| `apps/api/src/routes/auth/signup.ts` | 4 | `import { seedCmdbReferenceData } from '@meridian/db/seeds/cmdb-reference';` |
| `apps/api/src/routes/auth/signup.ts` | 191 | `await seedCmdbReferenceData(tx, tenant.id);` |
| `apps/owner/src/lib/provisioning.ts` | 2 | `import { seedCmdbReferenceData } from '@meridian/db/seeds/cmdb-reference';` |
| `apps/owner/src/lib/provisioning.ts` | 265 | `await seedCmdbReferenceData(tx, tenant.id);` |
| `packages/db/prisma/seed.ts` | 5 | `import { seedCmdbReferenceData } from '../src/seeds/cmdb-reference.js';` |
| `packages/db/prisma/seed.ts` | 346 | `await seedCmdbReferenceData(tx, tenant.id);` (inside `prisma.$transaction` wrapper) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree-local files vs base-repo files**
- **Found during:** Task 1 (initial Write calls)
- **Issue:** Early Write/Edit tool calls used absolute paths that landed in the BASE repo (`C:\Users\greiner\OneDrive\ClaudeAI\MeridianITSM-Application\packages\db\...`) instead of the worktree (`C:\Users\greiner\OneDrive\ClaudeAI\MeridianITSM-Application\.claude\worktrees\agent-a5ba285e\packages\db\...`). The worktree had no diff, and the base repo was polluted.
- **Fix:** Copied all 5 files from base to worktree, then `git checkout` reverted the base tree to its pristine state. From Task 2 onward, every Write/Edit used the explicit worktree path.
- **Files affected:** Fixed and re-staged in worktree; base repo restored to HEAD.
- **Commit:** (fix applied before the Task 1 commit — the final committed files are in the worktree as required)

### Deferred Issues

**Pre-existing `packages/db/src/__tests__/tenant-extension.test.ts` tsc errors** (3 `TS2322` errors about Prisma's `Exact<RoleCreateInput>` requiring a `tenant` relation property):
- **Scope:** These errors exist identically in the base repo at master HEAD; they are NOT caused by Plan 07-02 changes.
- **Action:** Left as-is per scope boundary rule (out-of-scope pre-existing warnings).
- **Tracked:** Should be cleaned up in a future test-hygiene plan.

**Cannot run Vitest in this worktree due to Node 22.14 ESM resolver issue:**
- **Issue:** `TypeError [ERR_PACKAGE_IMPORT_NOT_DEFINED]: Package import specifier "#module-evaluator" is not defined` when importing `cli-api.DuT9iuvY.js` from a path nested inside `.claude/worktrees/agent-a5ba285e/`. The hidden `.claude` directory in the path appears to interfere with Node's ESM package-scope resolution. Reproduced with plain `node -e "import(...)"` — a Node resolver quirk, not a vitest/plan defect.
- **Action:** Relied on `tsc --noEmit` as the primary build verification (clean for all new files) and grep-based static analysis for acceptance criteria. The base repo DOES start vitest successfully, so the merged PR will execute the test suite normally in CI and in developer shells outside the `.claude/` subtree.
- **Verified elsewhere:**
  - apps/owner `tsc --noEmit` passes with **0 errors** after my provisioning.ts changes.
  - apps/api `tsc --noEmit` emits the same 53 errors as the base repo's master HEAD (no new errors introduced by this plan).
  - `packages/db` TypeScript compiles and produces a valid `dist/` with `dist/seeds/cmdb-reference.{js,d.ts}` present (the subpath export resolves).

## Confirmation: `pnpm --filter @meridian/db db:seed` parity

The refactored `packages/db/prisma/seed.ts` wraps the extracted seeder in `prisma.$transaction(async (tx) => { await seedCmdbReferenceData(tx, tenant.id); })`. The extracted helper contains the identical 15 CI classes / 11 statuses / 6 environments / 13 relationship types (verbatim values from the prior inline function at `seed.ts:357-466`, including the exact icon names, descriptions, sortOrder ints, forwardLabel/reverseLabel strings, and the `connected_to.isDirectional: false` edge case). Upsert semantics (`update: {}`) are preserved, so re-running against a seeded demo tenant is a no-op. Running `pnpm --filter @meridian/db db:seed` against a fresh DB will produce an identical reference vocabulary for the demo tenant.

Could not execute the seed command in this worktree — the pre-existing `tenant-extension.test.ts` tsc errors block `pnpm build`, and `db:seed` expects the Prisma client generated at package install time plus a running Postgres. The extracted literal content was verified by direct 1:1 comparison against `packages/db/prisma/seed.ts:357-466` (the line numbers in the source are recorded in the decisions section).

## A7 Lock Compliance

**A7 (LOCKED):** The 15 currently-seeded CI classes are sufficient for v2.0. NO new classes are added in Phase 7.

Verified: the `ciClasses` array in the extracted `packages/db/src/seeds/cmdb-reference.ts` contains exactly the 15 entries `business_service, technical_service, application, application_instance, saas_application, server, virtual_machine, database, network_device, load_balancer, storage, cloud_resource, dns_endpoint, certificate, generic` with the same icon/description values as the prior inline function.

## Threat Flags

No new network endpoints, auth paths, or schema changes at trust boundaries were introduced. The extracted seeder operates only inside the existing tenant-creation transactions (public signup + owner-admin provisioning, both of which were already trust boundaries). The resolver service is internal-only (service layer; no HTTP route). Cache keys are tenant-prefixed per the threat-model Table 7-02-02 mitigation.

## Self-Check: PASSED

- [x] `packages/db/src/seeds/cmdb-reference.ts` — exists, exports tx-aware `seedCmdbReferenceData`
- [x] `packages/db/src/__tests__/cmdb-reference-seed.test.ts` — exists, 6 test cases
- [x] `apps/api/src/services/cmdb-reference-resolver.service.ts` — exists, 5 resolvers + clearResolverCaches
- [x] `apps/api/src/__tests__/signup-cmdb-seed.test.ts` — exists, 5 test cases
- [x] `packages/db/src/index.ts` — re-exports seedCmdbReferenceData
- [x] `packages/db/package.json` — has ./seeds/cmdb-reference subpath export
- [x] `packages/db/prisma/seed.ts` — delegates (no inline literal; imports + transaction-wraps)
- [x] `apps/api/src/routes/auth/signup.ts` — imports seeder + calls `seedCmdbReferenceData(tx, tenant.id)` inside $transaction
- [x] `apps/owner/src/lib/provisioning.ts` — imports seeder + calls `seedCmdbReferenceData(tx, tenant.id)` inside $transaction
- [x] Commit `5d03deb` (Task 1) — present in `git log`
- [x] Commit `327c574` (Task 2) — present in `git log`
- [x] Commit `766f8f3` (Task 3) — present in `git log`
- [x] Multi-tenancy: every seeder upsert carries tenantId, every resolver cache key prefixed with `${tenantId}:`, every resolver query `where: { tenantId, ... }`
- [x] A3 verified: provisioning.ts uses the same $transaction pattern as signup.ts; seeder wired into both paths
- [x] A7 compliance: identical 15+11+6+13 seed content as the prior inline function
