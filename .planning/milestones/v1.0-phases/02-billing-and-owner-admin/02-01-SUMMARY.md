---
phase: 02-billing-and-owner-admin
plan: 01
subsystem: payments
tags: [stripe, bullmq, prisma, redis, webhook, idempotency, cron]

requires:
  - phase: 01-foundation
    provides: Prisma schema, BullMQ worker infrastructure, Redis client, Fastify API server with plugin pattern

provides:
  - StripeWebhookEvent model (stripe_webhook_events table) for webhook idempotency
  - Stripe SDK singleton client with mapStripeStatus and getUpgradeTier helpers
  - POST /billing/webhook Fastify route: raw body capture, signature verification, BullMQ enqueue
  - stripeWebhookWorker BullMQ worker: idempotency check, event routing, subscription status updates, Redis cache invalidation
  - usageSnapshotWorker daily cron capturing per-tenant activeUsers into TenantUsageSnapshot
  - STRIPE_WEBHOOK, TRIAL_EXPIRY, USAGE_SNAPSHOT queue definitions

affects:
  - 02-02 (planGate real implementation — uses stripeWebhookWorker Redis cache invalidation pattern)
  - 02-03 (checkout and billing UI — uses stripe.service.ts singleton and queue names)
  - 02-06 (trial expiry worker — uses TRIAL_EXPIRY queue definition added here)

tech-stack:
  added:
    - "stripe@20.4.1 — Stripe Node SDK in apps/api for webhook verification and API calls"
    - "bullmq — added to apps/api for Queue instantiation (already in apps/worker)"
  patterns:
    - "Stripe webhook: preParsing hook captures raw Buffer for constructEvent signature verification without disrupting other routes"
    - "BullMQ async webhook: route enqueues and returns 200 immediately; worker processes with idempotency table"
    - "Idempotency: findUnique on stripeEventId, skip if processedAt set, upsert on first receipt, update processedAt after success"
    - "Redis cache invalidation: del plan:${tenantId} after every subscription status change in worker"
    - "Worker error handling: catch block updates stripeWebhookEvent.errorMessage before re-throw for BullMQ retry"
    - "Test mocking: class syntax required for bullmq Worker/Queue and ioredis Redis constructors in vitest"

key-files:
  created:
    - packages/db/prisma/migrations/20260320000000_add_stripe_webhook_events/migration.sql
    - apps/api/src/services/stripe.service.ts
    - apps/api/src/routes/billing/webhook.ts
    - apps/api/src/routes/billing/index.ts
    - apps/worker/src/workers/stripe-webhook.ts
    - apps/worker/src/workers/stripe-webhook.test.ts
    - apps/worker/src/workers/usage-snapshot.ts
  modified:
    - packages/db/prisma/schema.prisma
    - packages/db/prisma.config.ts
    - apps/api/src/server.ts
    - apps/worker/src/queues/definitions.ts
    - apps/worker/src/index.ts
    - .gitignore

key-decisions:
  - "stripe@20.4.1 used (not 17.x from CONTEXT.md) — 20.x is current stable, API surface unchanged for our use case"
  - "Stripe API version set to '2026-02-25.clover' (latest for stripe@20.4.1) — '2025-02-24.acacia' caused type error"
  - "preParsing hook approach for raw body capture (not global addContentTypeParser) — prevents breaking JSON parsing on other routes"
  - "bullmq installed in apps/api for local Queue instantiation — webhook route needs to enqueue without importing worker package"
  - "prisma.config.ts datasource.url property added — required by Prisma 7 migrate dev command"
  - "migrations/ removed from .gitignore — schema is now stable enough to track migration files"
  - "mapStripeStatus duplicated in worker (not imported from api) — avoids cross-app imports, 5-line function acceptable to duplicate"
  - "vitest class syntax mocks required for Worker, Queue, and Redis constructors — vi.fn() implementation not valid as constructor"

patterns-established:
  - "Billing routes public scope: billingRoutes registered alongside health/auth in server.ts, NOT in protected scope"
  - "Stripe webhook idempotency: upsert on receipt + processedAt mark on success + findUnique skip on retry"
  - "Worker Redis client: local ioredis instance with lazyConnect:true for cache operations in workers"
  - "Queue name constant: all queue names in QUEUE_NAMES object in definitions.ts, queue instances co-located"

requirements-completed: [BILL-01, BILL-04, BILL-06]

duration: 15min
completed: 2026-03-20
---

# Phase 02 Plan 01: Stripe Billing Foundation Summary

**Stripe webhook pipeline (receive -> verify signature -> enqueue BullMQ -> idempotent processing) with StripeWebhookEvent table and daily usage snapshot cron worker**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-20T14:05:01Z
- **Completed:** 2026-03-20T14:20:06Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- StripeWebhookEvent model added to Prisma schema with UNIQUE constraint on stripeEventId — migration SQL created for stripe_webhook_events table
- Fastify POST /billing/webhook route captures raw body via preParsing hook, verifies Stripe signature, enqueues to BullMQ stripeWebhookQueue, returns 200 immediately (prevents Stripe retry timeouts)
- stripeWebhookWorker processes events with full idempotency: skips events with processedAt set, routes customer.subscription.* and invoice.* events to typed handlers, invalidates Redis plan:${tenantId} cache after status changes, records errorMessage on failure
- 8 passing tests covering idempotency skip, event routing (subscription created/updated/deleted, payment failed/succeeded), Redis cache invalidation, and error recording
- usageSnapshotWorker runs daily at 2 AM UTC capturing per-tenant activeUsers via TenantUsageSnapshot upsert

## Task Commits

1. **Task 1: Add StripeWebhookEvent model and create Stripe service** - `bd7cea1` (feat)
2. **Task 2: Create webhook route with raw body parser and BullMQ enqueue** - `4b1f745` (feat)
3. **Task 3: Create webhook worker with idempotency, usage snapshot worker, and tests** - `9c5efe1` (feat)

## Files Created/Modified

- `packages/db/prisma/schema.prisma` - Added StripeWebhookEvent model (Model 63)
- `packages/db/prisma/migrations/20260320000000_add_stripe_webhook_events/migration.sql` - Creates stripe_webhook_events table with UNIQUE constraint
- `packages/db/prisma.config.ts` - Added datasource.url property (required for migrate dev)
- `apps/api/src/services/stripe.service.ts` - Stripe singleton, mapStripeStatus, getUpgradeTier
- `apps/api/src/routes/billing/webhook.ts` - POST /billing/webhook with preParsing raw body capture
- `apps/api/src/routes/billing/index.ts` - Public billing Fastify plugin
- `apps/api/src/server.ts` - Registered billingRoutes in public scope
- `apps/worker/src/queues/definitions.ts` - Added STRIPE_WEBHOOK, TRIAL_EXPIRY, USAGE_SNAPSHOT queues
- `apps/worker/src/workers/stripe-webhook.ts` - BullMQ worker with idempotency and event routing
- `apps/worker/src/workers/stripe-webhook.test.ts` - 8 tests (all passing)
- `apps/worker/src/workers/usage-snapshot.ts` - Daily cron capturing tenant usage metrics
- `apps/worker/src/index.ts` - Registered stripeWebhookWorker and usageSnapshotWorker
- `.gitignore` - Removed migrations/ from ignore list

## Decisions Made

- stripe@20.4.1 used (not 17.x) — current stable with unchanged API surface for our use case
- Stripe API version '2026-02-25.clover' used — plan spec had '2025-02-24.acacia' which caused type error with v20
- preParsing hook used for raw body capture — plan specified this approach to avoid disrupting global JSON parsing
- bullmq installed in apps/api — plan said to create local Queue instance, not import from worker package
- prisma.config.ts datasource.url property added — Prisma 7 migrate dev requires this field (was missing)
- migrations/ removed from .gitignore — comment said "tracked after schema is stable" — it is stable now
- mapStripeStatus duplicated in worker — plan specified this explicitly to avoid cross-app imports

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect Stripe API version string**
- **Found during:** Task 1 (stripe.service.ts creation)
- **Issue:** Plan specified apiVersion '2025-02-24.acacia' but stripe@20.4.1 requires '2026-02-25.clover' — TypeScript error
- **Fix:** Updated apiVersion to '2026-02-25.clover' (stripe@20.4.1 latest)
- **Files modified:** apps/api/src/services/stripe.service.ts
- **Verification:** pnpm --filter api exec tsc --noEmit passes
- **Committed in:** bd7cea1 (Task 1 commit)

**2. [Rule 3 - Blocking] Added bullmq to apps/api dependencies**
- **Found during:** Task 2 (webhook route creation)
- **Issue:** webhook.ts imports Queue from 'bullmq' but bullmq was not installed in apps/api
- **Fix:** pnpm --filter api add bullmq
- **Files modified:** apps/api/package.json, pnpm-lock.yaml
- **Verification:** TypeScript import resolves, tsc --noEmit passes
- **Committed in:** 4b1f745 (Task 2 commit)

**3. [Rule 3 - Blocking] Added datasource.url to prisma.config.ts**
- **Found during:** Task 1 (Prisma migration attempt)
- **Issue:** npx prisma migrate dev failed with "datasource.url property is required in your Prisma config file"
- **Fix:** Added datasource: { url: connectionString } to defineConfig in prisma.config.ts
- **Files modified:** packages/db/prisma.config.ts
- **Verification:** Migration command no longer fails on config validation (still needs DB running)
- **Committed in:** bd7cea1 (Task 1 commit)

**4. [Rule 3 - Blocking] Removed migrations/ from .gitignore**
- **Found during:** Task 1 (git add attempt)
- **Issue:** packages/db/prisma/migrations was in .gitignore, preventing migration file from being committed
- **Fix:** Removed the gitignore entry (comment noted it was temporary until schema stable)
- **Files modified:** .gitignore
- **Verification:** git add packages/db/prisma/migrations/ succeeds
- **Committed in:** bd7cea1 (Task 1 commit)

**5. [Rule 1 - Bug] Fixed vitest mock syntax for constructors**
- **Found during:** Task 3 (running stripe-webhook.test.ts)
- **Issue:** vi.fn().mockImplementation() mocks cannot be used as constructors — Worker, Queue, and Redis are all called with `new`
- **Fix:** Rewrote mocks using class syntax with static handler storage for Worker, class fields for Queue and Redis
- **Files modified:** apps/worker/src/workers/stripe-webhook.test.ts
- **Verification:** All 8 tests pass
- **Committed in:** 9c5efe1 (Task 3 commit)

---

**Total deviations:** 5 auto-fixed (1 bug/version mismatch, 2 blocking dependencies, 1 blocking config, 1 blocking test mock)
**Impact on plan:** All auto-fixes necessary for correctness or to unblock execution. No scope creep.

## Issues Encountered

- Docker Desktop was not running, preventing `prisma migrate dev` from running against the database. Created the migration SQL file manually — migration will be applied when Docker services are started.

## User Setup Required

None - no external service configuration required beyond existing environment variables. Stripe environment variables (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) are needed for the webhook route to function, but these are existing env var slots.

## Next Phase Readiness

- Stripe billing foundation is complete — webhook pipeline is ready for production events
- Plan 02-02 (planGate real implementation) can proceed — the Redis cache key pattern `plan:${tenantId}` is established
- Plan 02-03 (checkout and billing UI) can proceed — stripe.service.ts singleton is ready
- Database migration needs to be applied when Docker services are available (`cd packages/db && npx prisma migrate dev --name add-stripe-webhook-events`)

---
*Phase: 02-billing-and-owner-admin*
*Completed: 2026-03-20*
