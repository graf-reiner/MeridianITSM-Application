---
phase: 02-billing-and-owner-admin
plan: 06
subsystem: ui
tags: [stripe, bullmq, redis, prisma, next.js, react, owner-admin]

requires:
  - phase: 02-billing-and-owner-admin
    provides: owner admin auth, TOTP, impersonation, tenant CRUD, plan enforcement middleware

provides:
  - Owner billing dashboard with MRR/ARR cards and per-tenant retry payment
  - Plan management UI with inline edit for prices, limits, and Stripe IDs
  - System operations page with queue health monitoring and maintenance broadcast
  - Cross-tenant audit log viewer with filters and expandable old/new data diff
  - stripe-admin.ts with retryInvoice, listTenantInvoices, getStripeRevenue helpers
  - Seven owner admin REST APIs: billing overview, retry payment, plan list, plan CRUD, system health, maintenance broadcast, audit log

affects: [03-service-desk, 04-change-management, 05-mobile]

tech-stack:
  added: [stripe@20.4.1, bullmq@5.x, ioredis@5.x, zod@4.x (owner app)]
  patterns:
    - Owner API auth: inline verifyOwnerToken + payload.type === 'access' guard on each route
    - Cross-tenant query: AuditLog queried without tenantId filter (owner-only privilege)
    - BullMQ health check: create Queue instance with host/port connection, call getJobCounts, then close
    - Maintenance broadcast: Redis key 'maintenance:broadcast' with TTL set via POST /api/system

key-files:
  created:
    - apps/owner/src/lib/stripe-admin.ts
    - apps/owner/src/app/api/billing/route.ts
    - apps/owner/src/app/api/billing/[tenantId]/retry/route.ts
    - apps/owner/src/app/api/plans/route.ts
    - apps/owner/src/app/api/plans/[id]/route.ts
    - apps/owner/src/app/api/system/route.ts
    - apps/owner/src/app/api/audit/route.ts
    - apps/owner/src/app/(admin)/billing/page.tsx
    - apps/owner/src/app/(admin)/plans/page.tsx
    - apps/owner/src/app/(admin)/system/page.tsx
    - apps/owner/src/app/(admin)/audit/page.tsx
  modified:
    - apps/owner/src/components/AdminNav.tsx
    - apps/owner/package.json

key-decisions:
  - "Stripe apiVersion cast as 'any' — stripe@20.4.1 TypeScript types use 2026-02-25.acacia but TS compiler rejects it without the cast"
  - "AuditLog queries without tenantId filter by design — this is the only cross-tenant endpoint, intentionally owner-only"
  - "BullMQ Queue instances created per-request and closed immediately — owner app is stateless, avoids persistent Redis connections"
  - "Plan limitsJson validated with Zod at PUT time — maxUsers/maxAgents/maxSites (numbers), features (string[])"
  - "AdminNav /audit-log updated to /audit to match (admin)/audit route group directory"

patterns-established:
  - "Pattern: Owner API inline auth — each route verifies Bearer token and checks payload.type === 'access' directly"
  - "Pattern: Billing MRR calculation — sum plan.monthlyPriceUsd for ACTIVE and TRIALING subscriptions"
  - "Pattern: Queue health check — create Queue(name, { connection: { host, port } }), getJobCounts(), close()"

requirements-completed: [OADM-08, OADM-09, OADM-10, OADM-11]

duration: 12min
completed: 2026-03-20
---

# Phase 02 Plan 06: Owner Admin Billing, Plans, System, and Audit Summary

**Stripe payment retry dashboard, plan management with limitsJson validation, BullMQ queue health monitoring, and cross-tenant audit log with old/new data diff — completing the owner admin portal**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-20T14:25:27Z
- **Completed:** 2026-03-20T14:37:00Z
- **Tasks:** 2
- **Files modified:** 13 (11 created, 2 modified)

## Accomplishments
- Built billing dashboard showing MRR/ARR, subscription status breakdown, and per-tenant table with one-click Retry Payment for PAST_DUE tenants
- Created plan management UI with inline edit forms covering pricing, limits (maxUsers/maxAgents/maxSites), features, and Stripe price IDs — tier name locked as non-editable
- System operations page with queue health cards (color-coded: green/yellow/red based on failed counts), Redis status indicator, 30s auto-refresh, and maintenance broadcast stored in Redis with configurable TTL
- Cross-tenant audit log with action/tenant/date filters and expandable rows showing old/new JSON data diff

## Task Commits

1. **Task 1: Create billing, plans, system, and audit APIs** - `7ac04db` (feat)
2. **Task 2: Create billing, plans, system, and audit UI pages** - `5d4b335` (feat)

**Plan metadata:** (included in final commit)

## Files Created/Modified
- `apps/owner/src/lib/stripe-admin.ts` - Stripe helpers: retryInvoice, listTenantInvoices, getStripeRevenue
- `apps/owner/src/app/api/billing/route.ts` - Billing overview with MRR calculation and status grouping
- `apps/owner/src/app/api/billing/[tenantId]/retry/route.ts` - Find open invoice and retry via Stripe
- `apps/owner/src/app/api/plans/route.ts` - List all plans with active subscriber counts
- `apps/owner/src/app/api/plans/[id]/route.ts` - GET/PUT single plan with Zod limitsJson validation
- `apps/owner/src/app/api/system/route.ts` - BullMQ queue stats and Redis maintenance broadcast
- `apps/owner/src/app/api/audit/route.ts` - Cross-tenant AuditLog with filters (no tenantId required)
- `apps/owner/src/app/(admin)/billing/page.tsx` - Billing dashboard with retry button and status cards
- `apps/owner/src/app/(admin)/plans/page.tsx` - Plan cards with inline edit form
- `apps/owner/src/app/(admin)/system/page.tsx` - Queue health, Redis status, maintenance broadcast UI
- `apps/owner/src/app/(admin)/audit/page.tsx` - Audit log table with filters and expandable diff rows
- `apps/owner/src/components/AdminNav.tsx` - Updated /audit-log to /audit

## Decisions Made
- Stripe apiVersion cast as `any` — the installed stripe@20.4.1 type definitions use `2026-02-25.acacia` but TypeScript rejects it without a cast
- AuditLog query intentionally omits tenantId filter — only valid because this endpoint is behind owner JWT auth
- BullMQ Queue instances are created per-request and immediately closed — owner app is stateless, no persistent Redis connections
- Plan tier name (SubscriptionPlanTier) is non-editable in PUT — it's the system identifier for plan limits enforcement

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added stripe, bullmq, ioredis, zod to owner app dependencies**
- **Found during:** Task 1 (API creation)
- **Issue:** Owner app package.json had none of these — required for stripe-admin.ts, system health checks, and plan validation
- **Fix:** Ran `pnpm --filter @meridian/owner add stripe bullmq ioredis zod`
- **Files modified:** apps/owner/package.json, pnpm-lock.yaml
- **Verification:** TypeScript compiles cleanly, all imports resolve
- **Committed in:** 7ac04db (Task 1 commit)

**2. [Rule 1 - Bug] Removed @prisma/client direct import**
- **Found during:** Task 1 (TypeScript check)
- **Issue:** `import type { AuditAction } from '@prisma/client'` and `import type { SubscriptionStatus } from '@prisma/client'` failed — `@prisma/client` types not directly importable; owner app uses `@meridian/db`
- **Fix:** Replaced with local inline type literals for both enums
- **Files modified:** apps/owner/src/app/api/audit/route.ts, apps/owner/src/app/api/billing/route.ts
- **Verification:** TypeScript check passes at exit code 0
- **Committed in:** 7ac04db (Task 1 commit)

**3. [Rule 1 - Bug] Fixed AdminNav route from /audit-log to /audit**
- **Found during:** Task 2 (UI page creation)
- **Issue:** AdminNav linked to `/audit-log` but the (admin) route group contains an `audit/` directory
- **Fix:** Updated href in navItems to `/audit`
- **Files modified:** apps/owner/src/components/AdminNav.tsx
- **Verification:** Route matches the page at `(admin)/audit/page.tsx`
- **Committed in:** 5d4b335 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking dep install, 2 bug fixes)
**Impact on plan:** All fixes necessary for compilation and correct routing. No scope creep.

## Issues Encountered
- Stripe apiVersion type mismatch: `stripe@20.4.1` uses a newer API version string (`2026-02-25.acacia`) that TypeScript's constraint `(...args: any) => any` does not accept for `Parameters<typeof Stripe>[1]['apiVersion']`. Resolved by casting to `any`.

## User Setup Required
None - no external service configuration required beyond existing STRIPE_SECRET_KEY and REDIS_* env vars established in earlier plans.

## Next Phase Readiness
- Owner admin portal is fully complete: auth, TOTP, impersonation, tenant management, billing, plans, system monitoring, audit log
- Phase 03 (service desk) can begin without any owner admin dependencies
- STRIPE_SECRET_KEY must be set in owner app .env for billing/retry features to function in dev

## Self-Check: PASSED

All files verified present. All commits verified in git history.

---
*Phase: 02-billing-and-owner-admin*
*Completed: 2026-03-20*
