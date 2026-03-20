---
phase: 02-billing-and-owner-admin
plan: 03
subsystem: payments
tags: [stripe, react, stripe-elements, bullmq, redis, prisma, nextjs]

# Dependency graph
requires:
  - phase: 02-01
    provides: Stripe service singleton, webhook pipeline, queue definitions, stripe.service.ts

provides:
  - POST /billing/create-checkout-intent — deferred intent Stripe subscription creation
  - POST /billing/sync-checkout — race-condition resolver querying Stripe directly
  - GET /billing/invoices — last 20 invoices from Stripe customer
  - POST /billing/update-payment-method — attach and set default payment method
  - POST /billing/cancel — cancel_at_period_end subscription cancellation
  - /signup page with Stripe Elements PaymentElement checkout
  - /billing management page with invoices, payment method, cancel
  - /billing/success page calling sync-checkout on mount
  - Trial expiry BullMQ worker (daily 6 AM UTC) with dunning + suspension

affects: [03-service-desk, 04-agents-cmdb, provisioning]

# Tech tracking
tech-stack:
  added:
    - "@stripe/react-stripe-js — Stripe Elements React integration"
    - "@stripe/stripe-js — Stripe.js loader"
    - "zod — added to apps/api for request body validation"
  patterns:
    - "Deferred intent pattern: payment_behavior=default_incomplete + expand latest_invoice.payment_intent"
    - "Sync-checkout: call Stripe directly after redirect to bypass webhook race condition"
    - "Trial lifecycle: dunning at T-3d, suspension at T=0, Redis cache invalidation on both"

key-files:
  created:
    - apps/api/src/routes/billing/create-checkout-intent.ts
    - apps/api/src/routes/billing/sync-checkout.ts
    - apps/api/src/routes/billing/invoices.ts
    - apps/api/src/routes/billing/payment-method.ts
    - apps/api/src/routes/billing/cancel.ts
    - apps/web/src/app/signup/page.tsx
    - apps/web/src/app/signup/CheckoutForm.tsx
    - apps/web/src/app/billing/page.tsx
    - apps/web/src/app/billing/success/page.tsx
    - apps/worker/src/workers/trial-expiry.ts
    - apps/worker/src/workers/trial-expiry.test.ts
  modified:
    - apps/api/src/routes/billing/index.ts (added authenticatedBillingRoutes export)
    - apps/api/src/server.ts (registered authenticatedBillingRoutes in protected scope)
    - apps/api/package.json (added zod)
    - apps/web/package.json (added @stripe/react-stripe-js, @stripe/stripe-js)
    - apps/worker/src/index.ts (added trialExpiryWorker + daily-trial-check repeatable job)

key-decisions:
  - "Stripe API 2026-02-25.clover removed current_period_start/end fields — sync-checkout stores only status and cancelAtPeriodEnd; cancel.ts uses cancel_at not current_period_end"
  - "Custom billing UI implemented per CONTEXT.md (not Stripe Customer Portal redirect despite REQUIREMENTS.md BILL-05 wording)"
  - "authenticatedBillingRoutes registered in protected scope alongside v1Routes in server.ts"
  - "zod added directly to apps/api (not via fastify-type-provider-zod re-export) for body validation in billing routes"

patterns-established:
  - "Deferred intent checkout: create subscription with payment_behavior default_incomplete, expand latest_invoice.payment_intent, return clientSecret for Elements"
  - "Post-redirect sync: call /billing/sync-checkout from success page useEffect to resolve webhook delivery race condition"
  - "Plan cache invalidation: redis.del plan:${tenantId} after any subscription state change"

requirements-completed: [BILL-01, BILL-03, BILL-05]

# Metrics
duration: 16min
completed: 2026-03-20
---

# Phase 02 Plan 03: Stripe Checkout Flow, Billing UI, and Trial Expiry Worker Summary

**Stripe Elements deferred intent checkout with custom billing management UI and daily trial expiry/dunning BullMQ worker**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-20T14:25:25Z
- **Completed:** 2026-03-20T14:41:43Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- Complete Stripe checkout flow using deferred intent pattern (PaymentElement + payment_behavior=default_incomplete)
- Custom billing management page with invoice history, payment method update, and cancel subscription
- Trial expiry worker with 3-day dunning warnings and automatic suspension at trial end

## Task Commits

Each task was committed atomically:

1. **Task 1: Create checkout and billing API endpoints** - `7836f89` (feat)
2. **Task 2: Create signup page with Stripe Elements and billing management UI** - `9269df8` (feat)
3. **Task 3: Create trial expiry worker with dunning** - `e2141f7` (part of prior 02-06 execution)

## Files Created/Modified

- `apps/api/src/routes/billing/create-checkout-intent.ts` - POST /billing/create-checkout-intent with deferred intent
- `apps/api/src/routes/billing/sync-checkout.ts` - POST /billing/sync-checkout querying Stripe directly
- `apps/api/src/routes/billing/invoices.ts` - GET /billing/invoices listing last 20 from Stripe
- `apps/api/src/routes/billing/payment-method.ts` - POST /billing/update-payment-method attaching PM
- `apps/api/src/routes/billing/cancel.ts` - POST /billing/cancel setting cancel_at_period_end
- `apps/api/src/routes/billing/index.ts` - Added authenticatedBillingRoutes export
- `apps/api/src/server.ts` - Registered authenticatedBillingRoutes in protected scope
- `apps/web/src/app/signup/page.tsx` - Public signup page with plan selection and account details
- `apps/web/src/app/signup/CheckoutForm.tsx` - Stripe Elements PaymentElement checkout form
- `apps/web/src/app/billing/page.tsx` - Custom billing management UI (invoices, payment method, cancel)
- `apps/web/src/app/billing/success/page.tsx` - Post-checkout success page calling sync-checkout
- `apps/worker/src/workers/trial-expiry.ts` - Daily BullMQ worker for trial dunning and suspension
- `apps/worker/src/workers/trial-expiry.test.ts` - 4 tests: suspension, dunning, out-of-window, cache invalidation
- `apps/worker/src/index.ts` - Added trialExpiryWorker and daily-trial-check repeatable job

## Decisions Made

- **Stripe API version change**: The 2026-02-25.clover API removed `current_period_start` and `current_period_end` from the Subscription type. Updated sync-checkout.ts to store only `status` and `cancelAtPeriodEnd`; cancel.ts uses `cancel_at` instead of `current_period_end`.
- **Custom billing UI**: CONTEXT.md specifies custom UI over Stripe Customer Portal. REQUIREMENTS.md BILL-05 says "Customer Portal redirect" but CONTEXT.md wins per plan spec.
- **zod in API**: Added zod directly to apps/api dependencies since fastify-type-provider-zod doesn't export it, and `zod/v4` subpath import caused TS resolution errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Stripe API type incompatibility for current_period_start/end**
- **Found during:** Task 1 (create-checkout-intent, sync-checkout, cancel endpoints)
- **Issue:** Stripe API version 2026-02-25.clover removed `current_period_start` and `current_period_end` from the Subscription type (typescript errors)
- **Fix:** sync-checkout.ts updated to not store period dates; cancel.ts uses `cancel_at` field instead
- **Files modified:** apps/api/src/routes/billing/sync-checkout.ts, apps/api/src/routes/billing/cancel.ts
- **Verification:** `pnpm --filter api exec tsc --noEmit` passes
- **Committed in:** 7836f89 (Task 1 commit)

**2. [Rule 3 - Blocking] Added zod to apps/api to resolve TS2307 module not found**
- **Found during:** Task 1 (billing route validation)
- **Issue:** `import { z } from 'zod/v4'` caused TS2307; zod not in api's direct deps
- **Fix:** Added zod as a direct dependency to apps/api; changed imports to `from 'zod'`
- **Files modified:** apps/api/package.json
- **Verification:** TypeScript passes
- **Committed in:** 7836f89 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug/type error, 1 blocking dependency)
**Impact on plan:** Both fixes necessary for TypeScript correctness. No scope creep.

## Issues Encountered

- Task 3 (trial expiry worker) files were already committed as part of plan 02-06 execution which ran out of order. The implementation is complete and tests pass (4/4).

## User Setup Required

None - no external service configuration required beyond the STRIPE_* env vars already documented in plan 02-01.

## Next Phase Readiness

- Stripe checkout flow complete: tenant can subscribe, view invoices, update payment method, cancel
- Trial expiry worker complete: trials auto-suspend at expiry with 3-day dunning warning
- Billing loop is closed: Plan 01 webhooks + Plan 02 plan enforcement + Plan 03 self-service checkout
- Ready for provisioning flow (Plan 05) to wire tenant creation + checkout into signup page

---
*Phase: 02-billing-and-owner-admin*
*Completed: 2026-03-20*
