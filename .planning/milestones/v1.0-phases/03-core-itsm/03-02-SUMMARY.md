---
phase: 03-core-itsm
plan: "02"
subsystem: sla-engine
tags: [sla, business-hours, timezone, breach-detection, bullmq, fastify]
dependency_graph:
  requires: []
  provides:
    - SLA business-hours breach calculation service (calculateBreachAt, getSlaStatus, getElapsedPercentage)
    - SLA monitor BullMQ worker (every-minute breach detection, 75%/90%/breach notifications)
    - SLA CRUD REST API (/api/v1/sla)
    - Live SLA status endpoint (/api/v1/tickets/:ticketId/sla-status)
  affects:
    - apps/worker/src/index.ts (slaMonitorQueue repeatable job registration)
    - apps/api/src/routes/v1/index.ts (slaRoutes registered)
tech_stack:
  added: [date-fns, date-fns-tz]
  patterns:
    - Business-hours walk algorithm (advance through day segments, skip non-business days)
    - Cross-tenant sentinel worker (no tenantId scoping — processes all tickets globally)
    - Duplicate-function pattern (getElapsedPercentage/getSlaStatus copied to worker, same as mapStripeStatus)
    - customFields JSON flags for idempotent notification dispatch (sla_75_notified etc.)
key_files:
  created:
    - apps/api/src/services/sla.service.ts
    - apps/api/src/__tests__/sla-service.test.ts
    - apps/api/src/routes/v1/sla/index.ts
  modified:
    - apps/worker/src/workers/sla-monitor.ts
    - apps/worker/src/index.ts
    - apps/api/src/routes/v1/index.ts
    - apps/api/package.json (added date-fns, date-fns-tz)
decisions:
  - "[03-02]: date-fns + date-fns-tz used for business-hours math — toZonedTime/fromZonedTime for correct timezone offset handling"
  - "[03-02]: getElapsedPercentage and getSlaStatus duplicated in worker (not imported from api) — avoids cross-app import, follows mapStripeStatus precedent"
  - "[03-02]: SLA monitor is a cross-tenant sentinel (no assertTenantId) — processes all active tickets in single job"
  - "[03-02]: customFields JSON flags (sla_75_notified, sla_90_notified, sla_breached_notified) prevent duplicate notification dispatch on each minute tick"
  - "[03-02]: User model has no managerId field — 90% threshold notifies assignee only (no manager notification)"
  - "[03-02]: Queue model has no members relation — breach notification goes to assignee only"
  - "[03-02]: Prisma 7 JSON type requires 'as any' cast for spread-constructed objects in update()"
metrics:
  duration: "9 min"
  completed_date: "2026-03-20"
  tasks_completed: 2
  files_created: 3
  files_modified: 4
---

# Phase 3 Plan 2: SLA Engine Summary

**One-liner:** Business-hours-aware SLA breach calculation with timezone support via date-fns-tz, plus BullMQ every-minute monitor and full SLA CRUD API.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 (TDD) | SLA service with business-hours calc and breach detection | 5dbaf24 | sla.service.ts, sla-service.test.ts |
| 2 | SLA monitor worker and SLA CRUD routes | 7a04dce | sla-monitor.ts, index.ts (worker), sla/index.ts, v1/index.ts |

## What Was Built

### SLA Service (`apps/api/src/services/sla.service.ts`)

Core business logic for SLA time calculations:

- `calculateBreachAt(startTime, targetMinutes, sla)` — walks forward through business hours segments. When `businessHours=false`, simply adds minutes. When `businessHours=true`, respects timezone (via `toZonedTime`/`fromZonedTime`), snaps to business day start if ticket created outside hours, skips weekends and non-business days.
- `calculateResponseAt` / `calculateResolutionBreachAt` — convenience wrappers calling calculateBreachAt with priority-mapped minutes.
- `getElapsedPercentage(startTime, breachAt)` — returns 0-∞ percentage of elapsed SLA time.
- `getSlaStatus(percentage)` — maps percentage to OK/WARNING(75%)/CRITICAL(90%)/BREACHED(100%).
- `getResponseMinutes` / `getResolutionMinutes` — maps P1-P4 priority to correct SLA field.

### SLA Monitor Worker (`apps/worker/src/workers/sla-monitor.ts`)

BullMQ worker, runs every minute (registered in `apps/worker/src/index.ts` with stable jobId `sla-monitor-repeatable`):

- Queries ALL tickets across ALL tenants where status not in RESOLVED/CLOSED/CANCELLED and `slaBreachAt IS NOT NULL`.
- Skips tickets with `customFields.slaPausedAt` set (paused SLA timers).
- For each ticket, calculates elapsed percentage and determines threshold:
  - **75% (WARNING)**: creates `SLA_WARNING` Notification for assignee, sets `sla_75_notified` flag.
  - **90% (CRITICAL)**: creates `SLA_WARNING` Notification for assignee, sets `sla_90_notified` flag.
  - **100% (BREACHED)**: creates `SLA_BREACH` Notification for assignee, sets `sla_breached_notified` flag. If `sla.autoEscalate=true`, moves ticket to `escalateToQueueId` and creates `ESCALATED` TicketActivity.
- Per-ticket try/catch ensures one failed ticket does not abort the full batch.

### SLA CRUD Routes (`apps/api/src/routes/v1/sla/index.ts`)

Full REST API for SLA policy management:

- `GET /api/v1/sla` — list all SLA policies for tenant, ordered by name.
- `GET /api/v1/sla/:id` — get single SLA policy, 404 if not found.
- `POST /api/v1/sla` — create SLA policy; validates all pN minute fields are positive integers, HH:MM format for time fields, 0-6 range for businessDays. Requires `settings:write`.
- `PATCH /api/v1/sla/:id` — partial update, same validations. Requires `settings:write`.
- `DELETE /api/v1/sla/:id` — delete policy. Requires `settings:write`.
- `GET /api/v1/tickets/:ticketId/sla-status` — live status: `{ status, elapsedPercentage, remainingSeconds, breachAt, responseAt, isPaused, pausedAt }`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma 7 JSON type rejects Record<string, unknown> in update()**
- **Found during:** Task 2
- **Issue:** `prisma.ticket.update({ data: { customFields: { ...spread } } })` caused TS2322 — Prisma 7 InputJsonValue type is strict and doesn't accept plain objects spread from `Record<string, unknown>`.
- **Fix:** Added `as any` cast on the spread result in all three threshold update calls (75%, 90%, breach).
- **Files modified:** `apps/worker/src/workers/sla-monitor.ts`
- **Commit:** 28f9fa0

**2. [Rule 2 - Missing functionality] User model has no managerId, Queue model has no members**
- **Found during:** Task 2 (schema inspection)
- **Issue:** Plan spec says "notify assignee + their manager" at 90% threshold and "notify assignee + queue members" at breach. Neither `managerId` on User nor a `members` relation on Queue exists in the schema.
- **Fix:** Notifications sent to assignee only for all thresholds. This is correct behavior given the current schema — manager/queue-member notifications can be added when those relations are added.
- **Files modified:** `apps/worker/src/workers/sla-monitor.ts`

**3. [Out-of-scope] Pre-existing TypeScript errors in test-utils/setup.ts and trial-expiry.test.ts**
- These are pre-existing failures unrelated to this plan's changes. Logged as out-of-scope, not fixed.

## Self-Check

- [x] `apps/api/src/services/sla.service.ts` — FOUND
- [x] `apps/api/src/__tests__/sla-service.test.ts` — FOUND
- [x] `apps/api/src/routes/v1/sla/index.ts` — FOUND
- [x] `apps/worker/src/workers/sla-monitor.ts` — FOUND (modified)
- [x] `apps/worker/src/index.ts` — FOUND (modified)
- [x] `apps/api/src/routes/v1/index.ts` — FOUND (modified)
- [x] Commit 5dbaf24 (SLA service) — FOUND
- [x] Commit 7a04dce (monitor + routes) — FOUND
- [x] All 26 unit tests pass

## Self-Check: PASSED
