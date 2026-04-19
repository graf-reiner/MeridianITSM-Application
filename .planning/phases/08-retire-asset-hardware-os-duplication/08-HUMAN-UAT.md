---
status: testing
phase: 08-retire-asset-hardware-os-duplication
source: [08-VERIFICATION.md]
started: 2026-04-18T00:00:00Z
updated: 2026-04-18T21:20:00Z
---

## Current Test

number: 1
name: CR-01 duplicate CI regression test
expected: |
  Live POST to /api/v1/agents/inventory with valid agentKey + same hostname across two calls must produce exactly ONE CmdbConfigurationItem row (not one per request). Fix deployed: agentId + hostname dedup added to upsertServerExtensionByAsset before D-08 orphan-create branch (commit 63e6ac5). Unit regression test passes (3/3 in inventory-ingestion.test.ts).
awaiting: user response

## Tests

### 1. CR-01 duplicate CI regression test
expected: Live POST to /api/v1/agents/inventory with valid agentKey + same hostname across two calls must produce exactly ONE CmdbConfigurationItem row (not one per request). Requires live DB inspection after two inventory POSTs from the same agent. Fix documented in 08-REVIEW.md CR-01: add agentId + hostname dedup to upsertServerExtensionByAsset before D-08 orphan-create branch.
result: [pending]

### 2. WR-01 governance fields on orphan-created CIs
expected: CIs created via upsertServerExtensionByAsset orphan path (cmdb-extension.service.ts:140-152) must carry agentId, sourceSystem, sourceRecordKey, firstDiscoveredAt, lastSeenAt so cmdb-reconciliation worker can dedup on re-ingestion.
result: [pending]

### 3. Wave 2 backfill run-log capture
expected: pnpm tsx packages/db/scripts/phase8-backfill.ts produces a run-log with per-tenant counts (assets processed, CI extensions written, software rows written, conflicts logged). Capture stdout + cmdb_migration_audit rows for forensic record. Plan 08-03 deferred live counts to operator.
result: [pending]

### 4. Staff + Portal AI behavioral smoke (CAI-01/02/03)
expected: Staff AI answers "Which CIs have Microsoft Office installed?" with SQL joining cmdb_software_installed (returns rows). Portal AI rejects same query with "forbidden table" error. Requires live LLM invocation against the running dev server.
result: [pending]

### 5. Asset detail Technical Profile UI smoke
expected: Browser test — login as admin@msp.local → open linked Asset → Technical Profile tab renders hardware/software from CI. Open orphan Asset → Technical Profile tab shows Link-a-CI empty state → click Link a CI → CIPicker search + select → PATCH refreshes page with linked CI. Asset edit form has no hostname/OS/CPU/RAM inputs.
result: [pending]

### 6. Signup-hook regression (Phase 7 retro lesson)
expected: Create a test tenant post-Phase-8-deploy; confirm non-zero rows in cmdb_ci_classes for the new tenant. If zero → operator skipped `pnpm --filter @meridian/db build` before `pm2 restart api` (Phase 7 commits b79b283 + edb6a6d lesson).
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

- truth: "GET /api/v1/cmdb/cis/:id returns 200 on dev after Phase 8 column drop"
  status: resolved
  reason: "User reported https://app-dev.meridianitsm.com/dashboard/cmdb/c97f603c-7632-429c-8bb3-ef97f8ff57f0 returned 'Failed to load CI: 500' post-deploy. Root cause: apps/api/src/services/cmdb.service.ts:462 still selected asset.hostname (dropped in Phase 8 Wave 5). Also found in change.service.ts:288 and application.service.ts:273 — all 3 were missed by grep gate (pattern targets top-level refs not nested Prisma selects) and by the verifier (checked must_haves, not regressions in unrelated routes). Fixed in c55ff3f, deployed, user confirmed page loads."
  severity: blocker
  test: regression-discovered-during-uat
  artifacts: [c55ff3f]
  missing: []
