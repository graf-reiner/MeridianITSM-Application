---
phase: 05-agent-mobile-and-integrations
plan: 03
subsystem: api
tags: [push-notifications, expo, bullmq, alert-channels, slack, teams, notifications]

# Dependency graph
requires:
  - phase: 05-01
    provides: device token registration routes and DeviceToken/pushPreferences schema

provides:
  - Push notification BullMQ worker via expo-server-sdk with per-ticket grouping/dedup
  - Extended notifyUser() with push channel + entityId-based jobId deduplication
  - Push preferences GET/PATCH endpoints per user
  - Alert channel CRUD for EMAIL/SLACK/TEAMS with test delivery

affects: [web-frontend, mobile]

# Tech tracking
tech-stack:
  added: [expo-server-sdk@3.14.1 (api + worker)]
  patterns:
    - Push deduplication via BullMQ jobId (push:userId:entityId) with 60s removeOnComplete window
    - DeviceNotRegistered cleanup: mark isActive=false on Expo error response
    - Alert channel config validated per type before DB write
    - MessageCard format for Teams connector API

key-files:
  created:
    - apps/worker/src/workers/push-notification.ts
    - apps/api/src/routes/v1/settings/alerts.ts
  modified:
    - apps/api/src/services/notification.service.ts
    - apps/api/src/routes/v1/push/index.ts
    - apps/worker/src/index.ts
    - apps/api/package.json
    - apps/worker/package.json
    - apps/mobile/package.json

key-decisions:
  - "BullMQ jobId dedup (push:userId:entityId) chosen over Redis TTL key for push grouping — simpler, leverages existing queue infrastructure"
  - "pushPreferences null=all-enabled, {TYPE:false}=disabled — sparse map avoids schema changes for new notification types"
  - "Alert channel list endpoint omits config field (may contain webhook URLs/emails) — detail endpoint exposes config"
  - "AlertConfiguration schema has no events field — implemented without events (schema doesn't support it)"
  - "apps/mobile react@18.3.2 fixed to 18.3.1 — 18.3.2 was never published to npm (pre-existing bug)"

patterns-established:
  - "Push dedup pattern: jobId=push:userId:entityId + removeOnComplete:{age:60} prevents notification spam"
  - "Token cleanup: worker checks ticket.status=error + details.error=DeviceNotRegistered then marks isActive=false"
  - "Alert channel test: per-type HTTP fetch (Slack/Teams) or nodemailer (EMAIL) with success/error response"

requirements-completed: [PUSH-01, PUSH-03, PUSH-04, PUSH-05, INTG-06]

# Metrics
duration: 18min
completed: 2026-03-23
---

# Phase 05 Plan 03: Push Notification Worker + Alert Channels Summary

**BullMQ push worker via expo-server-sdk with 60-second per-ticket deduplication, extended notifyUser with push channel, and alert channel CRUD for EMAIL/Slack/Teams with test delivery**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-23T21:07:20Z
- **Completed:** 2026-03-23T21:25:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Push notification worker processes BullMQ jobs, checks pushPreferences, groups rapid-fire events on same ticket into single push with count, marks stale tokens inactive on DeviceNotRegistered
- Extended notifyUser() NotifyPayload with pushData field and entityId-based jobId deduplication — all 5 ticket notification helpers updated to include pushData for deep linking
- GET/PATCH /api/v1/push/preferences endpoints for per-user notification type opt-out
- Alert channel CRUD (POST/GET/GET:id/PATCH/DELETE/test) for EMAIL, SLACK, TEAMS with per-type config validation and live test delivery

## Task Commits

Each task was committed atomically:

1. **Task 1: Push notification worker with grouping + notification service extension** - `c04aaeb` (feat)
2. **Task 2: Alert channel CRUD routes** - `8d07ca1` (feat)

**Plan metadata:** `fd44343` (docs: complete plan)

## Files Created/Modified
- `apps/worker/src/workers/push-notification.ts` - BullMQ worker via expo-server-sdk: preference check, grouping, stale token cleanup
- `apps/api/src/services/notification.service.ts` - Extended with pushNotificationQueue + pushData in NotifyPayload + 5 ticket helper updates
- `apps/api/src/routes/v1/push/index.ts` - Added GET/PATCH /preferences endpoints
- `apps/api/src/routes/v1/settings/alerts.ts` - Alert channel CRUD with EMAIL/SLACK/TEAMS support and test delivery
- `apps/api/src/routes/v1/settings/index.ts` - Registered alertChannelRoutes
- `apps/worker/src/index.ts` - Registered pushNotificationWorker
- `apps/api/package.json` - Added expo-server-sdk dependency
- `apps/worker/package.json` - Added expo-server-sdk dependency

## Decisions Made
- BullMQ jobId `push:userId:entityId` dedup chosen over Redis TTL key — simpler, leverages existing queue infrastructure, 60s removeOnComplete window
- pushPreferences null=all-enabled sparse map avoids schema changes for new notification types
- Alert channel list view omits config (webhook URLs are secrets); detail endpoint exposes config
- AlertConfiguration schema has no `events` field — plan context listed it but actual schema doesn't have it; implemented without events field
- apps/mobile react@18.3.2 fixed to 18.3.1 (18.3.2 was never published to npm — pre-existing blocking issue)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed apps/mobile react version 18.3.2 does not exist on npm**
- **Found during:** Task 1 (expo-server-sdk install)
- **Issue:** pnpm install failed workspace-wide because `react@18.3.2` was never published to npm (last React 18 is 18.3.1)
- **Fix:** Updated `apps/mobile/package.json` react from `18.3.2` to `18.3.1`
- **Files modified:** apps/mobile/package.json, pnpm-lock.yaml
- **Verification:** pnpm install succeeded, all packages resolved
- **Committed in:** c04aaeb (Task 1 commit)

**2. [Rule 3 - Blocking] AlertConfiguration schema missing events field**
- **Found during:** Task 2 (reading schema before implementing alert routes)
- **Issue:** Plan context listed `events (String[])` in AlertConfiguration, but actual schema has no such field
- **Fix:** Implemented alert channel routes without `events` field — stored only what the schema supports
- **Files modified:** apps/api/src/routes/v1/settings/alerts.ts
- **Verification:** TypeScript compilation passes, no schema mismatch
- **Committed in:** 8d07ca1 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 schema/blocking)
**Impact on plan:** Both necessary. react version fix unblocked all pnpm installs. Events field omission matches actual DB schema.

## Issues Encountered
- trial-expiry.test.ts has 3 pre-existing TypeScript errors (mock data missing required TenantSubscription fields) — these existed before this plan, not caused by any task changes. Deferred to out-of-scope items.

## Next Phase Readiness
- Push notifications ready for mobile app integration — device tokens registered via 05-01 routes, worker now processes them
- Alert channels ready for tenant admin UI integration
- Notification service now dispatches all three channels: in-app, email, push

---
*Phase: 05-agent-mobile-and-integrations*
*Completed: 2026-03-23*
