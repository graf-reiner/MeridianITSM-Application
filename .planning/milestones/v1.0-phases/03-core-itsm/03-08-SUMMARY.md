---
phase: 03-core-itsm
plan: 08
subsystem: api
tags: [reporting, dashboard, csv-export, bullmq, croner, nodemailer, sla-compliance, scheduled-reports]

# Dependency graph
requires:
  - phase: 03-01
    provides: ticket service, planGate, RBAC plugins
  - phase: 03-02
    provides: SLA model with slaBreachAt and firstResponseAt fields
  - phase: 03-03
    provides: email account SMTP configuration
  - phase: 03-07
    provides: notification patterns and user JWT structure
provides:
  - GET /api/v1/dashboard endpoint with ticket counts, volume charts, SLA overdue, recent activity
  - GET /api/v1/reports/tickets with CSV/JSON export and date/status/priority filters
  - GET /api/v1/reports/sla-compliance with breach rate and per-priority breakdown
  - GET /api/v1/reports/changes and /cmdb stubs for Phase 4
  - GET /api/v1/reports/system-health with BullMQ job counts
  - Scheduled reports CRUD (POST/PATCH/DELETE) with cron validation via croner
  - Hourly scheduled-report worker generating CSV and emailing recipients
affects: [04-change-management, 05-mobile-api, frontend-dashboard]

# Tech tracking
tech-stack:
  added: [csv-stringify (apps/api + apps/worker), croner (apps/api + apps/worker), nodemailer (apps/worker)]
  patterns:
    - Queue names mirrored in report.service.ts to avoid cross-app imports (follows mapStripeStatus precedent)
    - Per-report try/catch in scheduled-report worker prevents one failure from blocking others
    - Temporary Queue instances created per getSystemHealth call, closed immediately (stateless, no persistent connections)
    - as any casts for Prisma JSON fields and dynamic where clauses (follows Phase 03-02 customFields precedent)

key-files:
  created:
    - apps/api/src/services/report.service.ts
    - apps/api/src/routes/v1/dashboard/index.ts
    - apps/api/src/routes/v1/reports/index.ts
    - apps/worker/src/workers/scheduled-report.ts
  modified:
    - apps/api/src/routes/v1/index.ts
    - apps/worker/src/queues/definitions.ts
    - apps/worker/src/index.ts

key-decisions:
  - "Queue names mirrored in report.service.ts (not imported from apps/worker) to avoid cross-app imports — follows mapStripeStatus precedent"
  - "getSystemHealth creates temporary Queue instances per call and closes them — stateless, no persistent Redis connections"
  - "as any casts used for Prisma JSON field assignments (filters) and dynamic where clauses — consistent with Phase 03-02 customFields pattern"
  - "trial-expiry.test.ts TypeScript errors are pre-existing (not caused by this plan) — out-of-scope per deviation rules"

patterns-established:
  - "Dashboard aggregation: Promise.all for parallel count queries, $queryRaw for DATE grouping"
  - "CSV export: csv-stringify/sync with header:true and explicit columns array"
  - "Scheduled report delivery: per-recipient send inside try/catch, transport.close() after batch"

requirements-completed: [REPT-01, REPT-02, REPT-03, REPT-04, REPT-05, REPT-06, REPT-07]

# Metrics
duration: 9min
completed: 2026-03-21
---

# Phase 03 Plan 08: Reporting and Dashboard APIs Summary

**Dashboard stats, ticket/SLA/change CSV+JSON reports, scheduled report worker with cron validation and email delivery via nodemailer**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-21T00:11:53Z
- **Completed:** 2026-03-21T00:20:54Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Report service with getDashboardStats, getTicketReport (CSV/JSON), getSlaComplianceReport (per-priority breakdown), getChangeReport, and getSystemHealth (BullMQ queue counts)
- Dashboard endpoint GET /api/v1/dashboard returning ticket volume, SLA overdue count, activity feed, and top categories
- Full report routes: ticket export, SLA compliance, change stub, CMDB stub, system health (admin-only), and scheduled report CRUD with croner validation
- Scheduled report worker: hourly BullMQ job, queries due ScheduledReport records, generates CSV, emails recipients via tenant SMTP, advances nextRunAt from cron

## Task Commits

1. **Task 1: Report service and dashboard/report API routes** - `2e39033` (feat)
2. **Task 2: Scheduled report worker** - `e774ccb` (feat)

**Plan metadata:** (final commit — see state update)

## Files Created/Modified

- `apps/api/src/services/report.service.ts` - getDashboardStats, getTicketReport, getSlaComplianceReport, getChangeReport, getSystemHealth
- `apps/api/src/routes/v1/dashboard/index.ts` - GET /api/v1/dashboard
- `apps/api/src/routes/v1/reports/index.ts` - All report routes with CSV export and scheduled report CRUD
- `apps/api/src/routes/v1/index.ts` - Registered dashboardRoutes and reportRoutes
- `apps/worker/src/workers/scheduled-report.ts` - Hourly worker with CSV generation and email delivery
- `apps/worker/src/queues/definitions.ts` - Added SCHEDULED_REPORT queue name and scheduledReportQueue export
- `apps/worker/src/index.ts` - Added scheduledReportWorker and hourly repeatable job

## Decisions Made

- Queue names mirrored in report.service.ts to avoid cross-app imports from apps/worker — follows mapStripeStatus precedent established in Phase 03-02
- getSystemHealth creates temporary Queue instances per request and closes them — stateless pattern, consistent with owner admin Queue usage
- `as any` casts for Prisma JSON field assignments (filters) and dynamic where clauses — consistent with Phase 03-02 customFields precedent
- trial-expiry.test.ts TypeScript errors are pre-existing (not caused by this plan) — logged as out-of-scope per deviation rules

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TypeScript `Parameters<typeof prisma.ticket.findMany>[0]['where']` cast pattern produced errors because Prisma 7 type returns `Subset<...> | undefined` union. Resolved with `as any` casts, consistent with existing codebase patterns (Phase 03-02 customFields).
- Prisma JSON field (`filters`) required `as any` cast for null assignment in `scheduledReport.create` — Prisma 7 NullableJsonNullValueInput pattern.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Reporting infrastructure complete; frontend dashboard pages can consume GET /api/v1/dashboard
- Scheduled reports operational once tenant SMTP accounts are configured (Phase 03-03)
- Change report stub ready — full data available after Phase 04 implements Change CRUD

---
*Phase: 03-core-itsm*
*Completed: 2026-03-21*
