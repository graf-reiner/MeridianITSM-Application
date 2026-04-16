---
phase: 03-core-itsm
plan: 07
subsystem: api
tags: [notifications, bullmq, prisma, fastify, typescript]

requires:
  - phase: 03-01
    provides: ticket.service.ts with createTicket, updateTicket, addComment, assignTicket
  - phase: 03-03
    provides: email notification BullMQ queue infrastructure

provides:
  - Notification dispatch orchestrator (notifyUser + ticket-specific helpers)
  - In-app Notification records created in PostgreSQL per event
  - Email notification jobs enqueued to email-notification BullMQ queue
  - REST API: GET /api/v1/notifications, GET unread-count, PATCH read, PATCH read-all
  - Ticket events wired to notification dispatch (fire-and-forget)

affects:
  - 03-08
  - 03-09
  - frontend notification bell/center
  - mobile push integration

tech-stack:
  added: []
  patterns:
    - "BullMQ Queue created per-service using host/port extraction from REDIS_URL (same pattern as billing webhook)"
    - "Fire-and-forget notifications: void (async () => { try { await notify... } catch { log } })()"
    - "Notification always returns: failure swallowed, ticket operation always completes"

key-files:
  created:
    - apps/api/src/services/notification.service.ts
    - apps/api/src/routes/v1/notifications/index.ts
  modified:
    - apps/api/src/services/ticket.service.ts
    - apps/api/src/routes/v1/index.ts

key-decisions:
  - "Notification route uses userId (not id) from JWT — consistent with all other v1 routes where request.user has userId property"
  - "getNotifications always returns unreadCount regardless of filter — needed for badge display even when showing all notifications"
  - "prisma.notification.updateMany used for markRead (not update) — scoped by tenantId+userId+id for multi-tenant security without findFirst+update roundtrip"

patterns-established:
  - "Ticket operations use .then() chaining after prisma.$transaction to append fire-and-forget side effects"
  - "Notification helpers are individually exported and accept minimal ticket shape interface to avoid coupling"

requirements-completed: [NOTF-01, NOTF-02, NOTF-03, NOTF-04]

duration: 8min
completed: 2026-03-20
---

# Phase 03 Plan 07: Notification Dispatch Orchestrator and API Summary

**In-app + email notification dispatch for all ticket events with REST notification center API (list, unread-count, mark-read, mark-all-read)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-20T00:00:00Z
- **Completed:** 2026-03-20T00:08:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created notification.service.ts with full dispatch orchestrator: notifyUser (in-app + email), notifyTicketCreated, notifyTicketAssigned, notifyTicketCommented, notifyTicketResolved, notifyTicketUpdated, getNotifications (paginated with unreadCount), markRead, markAllRead
- Created notification REST API at /api/v1/notifications with list, unread-count, read-all, and per-notification read endpoints registered in v1 routes
- Wired all ticket events in ticket.service.ts to fire notifications as fire-and-forget (void + try/catch) so notification failures can never block ticket operations

## Task Commits

Each task was committed atomically:

1. **Task 1: Notification service and API routes** - `7d7fa8d` (feat)
2. **Task 2: Wire ticket events to notification dispatch** - `b65de23` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified
- `apps/api/src/services/notification.service.ts` - Notification dispatch orchestrator: in-app records + BullMQ email jobs
- `apps/api/src/routes/v1/notifications/index.ts` - Notification center REST API (list, unread-count, read, read-all)
- `apps/api/src/services/ticket.service.ts` - Wired ticket events to notification dispatch via fire-and-forget pattern
- `apps/api/src/routes/v1/index.ts` - Registered notificationRoutes

## Decisions Made
- Used `userId` (not `id`) from JWT user object in notification routes — consistent with all other v1 routes
- `getNotifications` always returns `unreadCount` regardless of filter mode — badge display needs this even when viewing all notifications
- Used `prisma.notification.updateMany` for `markRead` scoped by `tenantId + userId + notificationId` — prevents cross-tenant read operations
- `void (async () => { try { await notify... } catch { console.error } })()` pattern in ticket.service.ts ensures notification failures are logged but never propagate

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed user ID field name in notification routes**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Route used `{ id: string }` type for user, but JWT user has `userId` (not `id`) — TypeScript caught this as type overlap error
- **Fix:** Changed all four route handlers to `{ tenantId: string; userId: string }` and use `userId` directly
- **Files modified:** apps/api/src/routes/v1/notifications/index.ts
- **Verification:** TypeScript compilation passes with no errors
- **Committed in:** 7d7fa8d (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — wrong field name on JWT user type)
**Impact on plan:** Minor correction needed for TypeScript correctness. No scope creep.

## Issues Encountered
- JWT user object shape uses `userId` property (not `id`) — discovered during tsc compilation. Consistent with Phase 03-01 decision on JWT payload structure.

## Next Phase Readiness
- Notification dispatch orchestrator ready for use by change management, CAB meetings, SLA warning/breach events
- All 12 NotificationType values are present in schema; service covers TICKET_ASSIGNED, TICKET_UPDATED, TICKET_COMMENTED, TICKET_RESOLVED, TICKET_CREATED — remaining types (SLA_WARNING, SLA_BREACH, CHANGE_APPROVAL, etc.) to be wired in later phases
- Email worker must handle `send-email` jobs from email-notification queue with `templateName` and `variables` payload

---
*Phase: 03-core-itsm*
*Completed: 2026-03-20*
