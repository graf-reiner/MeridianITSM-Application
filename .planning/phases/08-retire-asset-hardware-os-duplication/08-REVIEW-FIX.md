---
phase: 08-retire-asset-hardware-os-duplication
fixed_at: 2026-04-17T17:30:00Z
review_path: .planning/phases/08-retire-asset-hardware-os-duplication/08-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 4
skipped: 1
status: partial
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-04-17T17:30:00Z
**Source review:** .planning/phases/08-retire-asset-hardware-os-duplication/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 Critical + 4 Warnings; Info findings excluded by `fix_scope: critical_warning`)
- Fixed: 4 (CR-01, WR-01, WR-02, WR-03)
- Skipped: 1 (WR-04)

## Fixed Issues

### CR-01: Agent inventory POST auto-creates a duplicate CI on every submission

**Files modified:** `apps/api/src/services/cmdb-extension.service.ts`, `apps/api/src/routes/v1/agents/index.ts`, `apps/api/src/__tests__/inventory-ingestion.test.ts`
**Commit:** 63e6ac5
**Applied fix:**
- Extended `upsertServerExtensionByAsset` signature with `opts.agentId` + `opts.agentKey` parameters.
- Added two new dedup lookups BEFORE the D-08 orphan-create branch, mirroring the worker (cmdb-reconciliation.ts:287-305):
  1. `findFirst({ where: { tenantId, agentId, isDeleted: false } })` — primary key match.
  2. `findFirst({ where: { tenantId, hostname, isDeleted: false } })` — re-enrollment fallback; on hit, re-links the matched CI to the current agent via update.
- Multi-tenancy posture: every new dedup query includes `tenantId` in the `where` clause (verified by the new test `for (const call of txCIFindFirst.mock.calls) { expect(call[0].where.tenantId).toBe(...) }`).
- Updated route `apps/api/src/routes/v1/agents/index.ts:470-488` to pass `{ source: 'agent', agentId: agent.id, agentKey: agent.agentKey }`.
- Added regression test `CR-01 regression: two consecutive inventory POSTs from the same agent create exactly ONE CI` that asserts `txCICreate` was called exactly once across two POST cycles. Pre-fix, this would have failed at 2 calls.
- Tightened the existing dedup test to assert `agentId` + `tenantId` + `isDeleted` are all in the `where` clause.

**Verification status:** `fixed: requires human verification` — CR-01 is a logic bug. The new tests assert the dedup branch is taken, but a human should run `pnpm --filter api vitest run apps/api/src/__tests__/inventory-ingestion.test.ts` and the integration test against a real Postgres before phase verifier. TS type-check passes for all three modified files (zero new errors).

### WR-01: `upsertServerExtensionByAsset` orphan-create does not set `agentId` or `sourceSystem` on new CI

**Files modified:** `apps/api/src/services/cmdb-extension.service.ts`, `apps/api/src/__tests__/inventory-ingestion.test.ts`
**Commit:** 63e6ac5 (bundled with CR-01 — both fixes converged on the same `tx.cmdbConfigurationItem.create` block)
**Applied fix:**
- Threaded `opts.agentId` + `opts.agentKey` through to the create payload.
- Populated governance fields on the new CI: `agentId`, `hostname`, `sourceSystem` (from `opts.source` parameter, defaults to `'agent'`), `sourceRecordKey` (from `opts.agentKey`), `firstDiscoveredAt`, `lastSeenAt`.
- Added test assertions verifying all six governance fields are present on the create payload.

**Bundling rationale:** WR-01 and CR-01 both modified the orphan-create branch. Splitting them into two commits would have required either (a) committing CR-01 with broken governance fields then immediately fixing them, or (b) reverting and re-applying. Both are wasteful. The CR-01 commit message focuses on the headline bug; this REVIEW-FIX.md surfaces the WR-01 scope.

### WR-02: Software report `ciClassKey` filter does not scope the nested join by `tenantId`

**Files modified:** `apps/api/src/services/report.service.ts`
**Commit:** 31d1df2
**Applied fix:**
- Updated the `ciClassKey` filter clause from `ci: { ciClass: { classKey } }` to `ci: { tenantId, ciClass: { tenantId, classKey } }`.
- Defense-in-depth: even though `cmdb_software_installed.tenantId` is constrained by the outer `where.tenantId` and `cmdb_ci_classes.@@unique([tenantId, classKey])` prevents same-classKey collisions today, the nested join now carries explicit tenant scoping per CLAUDE.md Rule 1.
- Added an inline comment explaining the defense-in-depth posture and the pattern alignment with `cmdb.service.ts`.

### WR-03: Backfill does not populate `ci.hostname` from `asset.hostname` on orphan-create

**Files modified:** `packages/db/scripts/phase8-backfill.ts`
**Commit:** ec653bd
**Applied fix:**
- Added `hostname: asset.hostname ?? null` to the orphan-create `cmdbConfigurationItem.create` payload at line 345.
- The Wave 2 backfill runs BEFORE Wave 5 drops `assets.hostname`, so `asset.hostname` is still in scope here (verified: `asset.hostname` is referenced on lines 290, 339 of the same script).
- Inline comment documents that this prevents NULL `ci.hostname` for backfilled orphan CIs, which would otherwise break AI Text-to-SQL queries (`SELECT ci.hostname FROM cmdb_configuration_items`) and search/list views post-Wave-5.

## Skipped Issues

### WR-04: Grep gate pattern too lax — will not catch `response.hostname` or similar CI-derived reads

**File:** `packages/db/scripts/phase8-grep-gate.sh:57`
**Reason:** Skipped — the reviewer's own Fix section concludes "**no change required if [`tsc --noEmit`] runs in CI**." The file itself documents the intentional trade-off at lines 11-12 ("Patterns are pinned to specific field names so a contributor cannot satisfy the gate by renaming a variable") and lines 53-56 ("Pattern intentionally uses `asset\.(field)` — a rename of the `asset` variable to something else will surface the change in review; the literal prefix 'asset.' is the Pitfall 6 signal"). The optional hardening proposed (TypeScript interface checks importing `AssetDetail`) is forward-looking work, not a regression in Phase 8's grep gate. The existing `tsc --noEmit` CI step is already the strongest defense — reviewer explicitly notes "no change required if that runs in CI."
**Original issue:** The grep gate's literal `asset\.(hostname|...)` pattern misses destructured reads (`const { hostname } = asset; ... hostname`), spread rewrites (`const rec = { ...asset }; rec.hostname`), and JSON-body mutations (`body.hostname` after Asset form fetch). This is acknowledged in the file as an intentional Pitfall 6 design choice.

---

_Fixed: 2026-04-17T17:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
