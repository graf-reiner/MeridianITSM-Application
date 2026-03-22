---
phase: 04-cmdb-change-management-and-asset-portfolio
plan: 05
subsystem: api
tags: [cmdb, bullmq, prisma, zod, csv-stringify, reconciliation, import]

requires:
  - phase: 04-02
    provides: cmdb.service.ts with createCI/updateCI/listCIs and CmdbChangeRecord logging patterns

provides:
  - CMDB reconciliation worker replacing Phase 1 stub — processes all ACTIVE agents, diffs InventorySnapshot against CmdbConfigurationItem, creates/updates CIs, logs per-field changes with changedBy=AGENT, marks stale CIs INACTIVE after 24h
  - cmdb-import.service.ts with importCIs function — Zod row validation, sequential ciNumbers, CmdbChangeRecord with changedBy=IMPORT, per-row error reporting
  - POST /api/v1/cmdb/import endpoint — cmdb.import permission, optional columnMap key remapping
  - GET /api/v1/reports/cmdb endpoint (REPT-05) — JSON and CSV export with optional relationship data

affects: [phase-05-mobile, reporting, cmdb-ui]

tech-stack:
  added: []
  patterns:
    - CMDB reconciliation worker as cross-tenant batch sweep (not per-agent job) — consistent with SLA monitor pattern
    - ciNumber sequential allocation via FOR UPDATE raw SQL — duplicated from cmdb.service.ts to avoid cross-app import
    - Zod 4 z.record() requires two args: z.record(z.string(), z.unknown())
    - importCIs validates rows independently — good rows imported, bad rows returned as errors, never mixed

key-files:
  created:
    - apps/api/src/services/cmdb-import.service.ts
  modified:
    - apps/worker/src/workers/cmdb-reconciliation.ts
    - apps/api/src/routes/v1/cmdb/index.ts
    - apps/api/src/routes/v1/reports/index.ts

key-decisions:
  - "cmdb-reconciliation worker changed to cross-tenant sentinel (not per-agent job) — same architecture as sla-monitor.ts; queries all ACTIVE agents in one sweep"
  - "Zod 4 z.record() requires key schema as first arg — z.record(z.string(), z.unknown()) not z.record(z.unknown())"
  - "importCIs uses global prisma singleton (not passed-in client) — consistent with cmdb.service.ts pattern"
  - "CMDB report endpoint requires both reports.read AND cmdb.view permissions — belt-and-suspenders for tenant data isolation"

patterns-established:
  - "CMDB CI reconciliation: query agents -> get latest snapshot -> diff fields -> createMany change records -> update CI lastSeenAt"
  - "Bulk import: per-row Zod.safeParse -> collect valid/invalid -> single $transaction with batch ciNumber allocation"

requirements-completed: [CMDB-10, CMDB-12, CMDB-13, REPT-05]

duration: 5min
completed: 2026-03-22
---

# Phase 04 Plan 05: CMDB Reconciliation Worker and Bulk Import Summary

**CMDB reconciliation worker (replaces Phase 1 stub) processing agent InventorySnapshots with per-field diff logging, plus bulk import service with Zod validation and CMDB inventory reports in JSON/CSV (REPT-05)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-22T15:14:17Z
- **Completed:** 2026-03-22T15:19:xx Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Replaced the CMDB reconciliation worker stub with real logic: queries all ACTIVE agents, gets their latest InventorySnapshot, creates CIs for new agents and diffs existing CIs, logging per-field CmdbChangeRecord entries with `changedBy=AGENT`
- Stale CI detection: agent-managed CIs with `lastSeenAt` older than 24 hours are automatically set to `INACTIVE` with a change record logged
- Created `cmdb-import.service.ts` with `importCIs` function — validates each row independently via Zod, imports valid rows in a single transaction with sequential ciNumbers, returns per-row error details for invalid rows with `changedBy=IMPORT`
- Added `POST /api/v1/cmdb/import` endpoint (requires `cmdb.import` permission) with optional `columnMap` key remapping
- Replaced the `DEFERRED TO PHASE 4` stub in `GET /api/v1/reports/cmdb` with a real CMDB inventory endpoint (REPT-05): supports JSON and CSV export, optional relationship inclusion, type/status filters

## Task Commits

1. **Task 1: CMDB reconciliation worker and bulk import service** - `5d2f405` (feat)
2. **Task 2: CMDB import route and CMDB reports (REPT-05)** - `aa178b7` (feat)

**Plan metadata:** (included in final docs commit)

## Files Created/Modified

- `apps/worker/src/workers/cmdb-reconciliation.ts` - Replaced stub with real agent sweep: InventorySnapshot diff, CI create/update, stale marking after 24h
- `apps/api/src/services/cmdb-import.service.ts` - New: CiImportRowSchema Zod validation, importCIs bulk create with sequential ciNumbers and IMPORT audit records
- `apps/api/src/routes/v1/cmdb/index.ts` - Added POST /api/v1/cmdb/import route with cmdb.import permission and columnMap remapping
- `apps/api/src/routes/v1/reports/index.ts` - Replaced DEFERRED stub with real CMDB report: JSON (with optional relationships) and CSV (csv-stringify) export

## Decisions Made

- CMDB reconciliation changed from per-tenant-job model to cross-tenant sentinel sweep (consistent with sla-monitor.ts pattern) — the stub had `assertTenantId` but the plan calls for a global sweep like the SLA monitor
- Zod 4 `z.record()` requires two arguments — `z.record(z.string(), z.unknown())` not `z.record(z.unknown())`; fixed immediately during API TypeScript check
- `importCIs` uses global prisma singleton (same as cmdb.service.ts) rather than accepting a PrismaClient parameter — avoids `@prisma/client` import that is not a direct dependency of `apps/api`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod 4 z.record() requires two arguments**
- **Found during:** Task 1 (cmdb-import.service.ts TypeScript check)
- **Issue:** `z.record(z.unknown())` fails with TS2554 in Zod 4 — key schema is now a required first argument
- **Fix:** Changed to `z.record(z.string(), z.unknown())`
- **Files modified:** `apps/api/src/services/cmdb-import.service.ts`
- **Verification:** `pnpm --filter api exec tsc --noEmit` — clean compile
- **Committed in:** `5d2f405` (Task 1 commit)

**2. [Rule 1 - Bug] importCIs used @prisma/client import (not a declared dep of apps/api)**
- **Found during:** Task 1 (cmdb-import.service.ts TypeScript check)
- **Issue:** Plan suggested `PrismaClient` type from `@prisma/client` for the prisma parameter; `apps/api` does not have `@prisma/client` as a direct dependency (uses `@meridian/db` wrapper)
- **Fix:** Changed to use global `prisma` singleton from `@meridian/db` (consistent with cmdb.service.ts pattern); removed prisma parameter from `importCIs` signature
- **Files modified:** `apps/api/src/services/cmdb-import.service.ts`
- **Verification:** `pnpm --filter api exec tsc --noEmit` — clean compile
- **Committed in:** `5d2f405` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs)
**Impact on plan:** Both fixes necessary for correct TypeScript types and dependency graph. No scope creep.

## Issues Encountered

- Pre-existing TypeScript errors in `apps/worker/src/workers/trial-expiry.test.ts` (unrelated to this plan) cause `tsc --noEmit` to exit non-zero for the worker package; new worker file compiles cleanly when errors are filtered

## Next Phase Readiness

- CMDB reconciliation now fully functional — agents submitting inventory will have CIs automatically created/updated
- Bulk import endpoint enables mass CI onboarding workflows
- CMDB reports endpoint satisfies REPT-05 and provides foundation for CMDB dashboard UI in Phase 5
- No blockers for subsequent plans

---
*Phase: 04-cmdb-change-management-and-asset-portfolio*
*Completed: 2026-03-22*
