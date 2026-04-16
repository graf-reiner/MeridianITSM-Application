---
phase: 05-agent-mobile-and-integrations
plan: "02"
subsystem: api
tags: [webhooks, bullmq, hmac, external-api, api-key]

requires:
  - phase: 05-01
    provides: Queue definitions with WEBHOOK_DELIVERY queue, API key auth plugin

provides:
  - Webhook CRUD routes (POST/GET/PATCH/DELETE/test) under /api/v1/webhooks
  - dispatchWebhooks() fire-and-forget service for event fan-out
  - BullMQ webhook delivery worker with HMAC-SHA256 signing and custom backoff
  - Webhook auto-disable after 50 consecutive failures
  - Webhook delivery history (WebhookDelivery table) with 30-day cleanup cron
  - External API endpoints for tickets (read+write), assets (read), CIs (read) via API key

affects:
  - Future phases integrating with external systems
  - Any service that fires events and needs to dispatch webhooks

tech-stack:
  added: []
  patterns:
    - dispatchWebhooks fire-and-forget: wraps queue.add in try/catch, never propagates errors to caller
    - Custom BullMQ backoff strategy: BACKOFF_DELAYS array indexed by attemptsMade-1
    - External API scope enforcement: inline scopes.includes check per-route (not preHandler) for per-method granularity

key-files:
  created:
    - apps/api/src/routes/v1/webhooks/index.ts
    - apps/api/src/services/webhook.service.ts
    - apps/worker/src/workers/webhook-delivery.ts
    - apps/worker/src/workers/webhook-cleanup.ts
    - apps/worker/src/workers/webhook-delivery.test.ts
    - apps/api/src/routes/external/external.test.ts
  modified:
    - apps/api/src/routes/v1/index.ts
    - apps/api/src/routes/external/index.ts
    - apps/worker/src/index.ts
    - apps/worker/src/queues/definitions.ts

key-decisions:
  - "Webhook routes already existed from prior session (05-01 partial work); only webhook.service.ts and v1 registration were missing"
  - "Asset model has no 'type' field — used manufacturer/model/serialNumber fields matching schema; plan spec interface was aspirational"
  - "External ticket PATCH uses try/catch on updateTicket (throws 404) rather than null check — consistent with service's error-throw pattern"
  - "API_KEY_ACTOR_ID sentinel UUID used for ticket operations via API key — no user session available"

requirements-completed:
  - INTG-02
  - INTG-03
  - INTG-04
  - INTG-05

duration: 8min
completed: "2026-03-23"
---

# Phase 05 Plan 02: Webhook Delivery System + External API Summary

**HMAC-SHA256 signed webhook delivery worker with custom 1m/5m/30m/2h/12h backoff, auto-disable at 50 failures, 30-day delivery history cleanup, and external API for ticket/asset/CI access via API key scopes**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-23T17:49:38Z
- **Completed:** 2026-03-23T17:57:18Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Webhook CRUD API with secret auto-generation and test-delivery endpoint
- BullMQ delivery worker signs each payload with webhook.secret via HMAC-SHA256, retries on custom backoff schedule, records every attempt in WebhookDelivery, and auto-disables webhooks that fail 50 consecutive times
- External API exposes tickets (CRUD), assets (read), and CIs (read) behind API key scope checks

## Task Commits

Each task was committed atomically:

1. **Task 1: Webhook CRUD routes + dispatch service + v1 registration** - `8fb1f2f` (feat)
2. **Task 2: Webhook delivery worker + cleanup job + external API endpoints** - `c65eae2` (feat)

**Plan metadata:** see final commit below

## Files Created/Modified

- `apps/api/src/routes/v1/webhooks/index.ts` - Webhook CRUD + test delivery routes
- `apps/api/src/services/webhook.service.ts` - dispatchWebhooks() fan-out service
- `apps/api/src/routes/v1/index.ts` - Registered webhookRoutes
- `apps/worker/src/workers/webhook-delivery.ts` - BullMQ delivery worker with HMAC signing and retry
- `apps/worker/src/workers/webhook-cleanup.ts` - Daily cron cleanup for 30-day history retention
- `apps/worker/src/workers/webhook-delivery.test.ts` - Behavioral contract stubs (it.todo)
- `apps/api/src/routes/external/index.ts` - Ticket/asset/CI external endpoints with scope checks
- `apps/api/src/routes/external/external.test.ts` - Behavioral contract stubs (it.todo)
- `apps/worker/src/index.ts` - Registered webhook workers + cleanup cron schedule
- `apps/worker/src/queues/definitions.ts` - Added WEBHOOK_CLEANUP queue name and instance

## Decisions Made

- Webhook routes file was pre-existing (from partial 05-01 work) — only `webhook.service.ts` and v1/index.ts registration were needed for Task 1
- Asset model lacks `type` field in schema — removed from external API select, used `manufacturer` instead (plan spec interface was aspirational, not matching actual schema)
- `updateTicket` throws with `statusCode=404` on not-found; external PATCH wraps in try/catch rather than null-check
- Sentinel UUID `00000000-0000-0000-0000-000000000000` used as actorId for API key ticket operations

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Asset select included non-existent 'type' and 'make' fields**
- **Found during:** Task 2 (External API endpoints)
- **Issue:** Asset model has no `type` or `make` fields; TypeScript TS2353 error
- **Fix:** Replaced with `manufacturer` field which exists in schema; removed `type` from select
- **Files modified:** apps/api/src/routes/external/index.ts
- **Verification:** `pnpm --filter @meridian/api exec tsc --noEmit` passes
- **Committed in:** c65eae2 (Task 2 commit)

**2. [Rule 1 - Bug] ticket service exports getTicketList/getTicketDetail, not getTickets/getTicketById**
- **Found during:** Task 2 (External API endpoints)
- **Issue:** Plan spec named functions `getTickets` and `getTicketById` but service exports `getTicketList` and `getTicketDetail`
- **Fix:** Updated imports and call sites to use actual exported function names
- **Files modified:** apps/api/src/routes/external/index.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** c65eae2 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - schema/API name mismatches)
**Impact on plan:** Minor corrections aligning implementation to actual schema and service API. No scope changes.

## Issues Encountered

- `trial-expiry.test.ts` has pre-existing TypeScript errors (incomplete mock objects) — confirmed pre-existing before plan start, out of scope, not fixed. Logged to deferred items.

## Next Phase Readiness

- Webhook delivery and external API complete; `dispatchWebhooks()` ready for integration into ticket/change service call sites in future phases
- External API ready for third-party system integration
- No blockers for subsequent plans

---
*Phase: 05-agent-mobile-and-integrations*
*Completed: 2026-03-23*
