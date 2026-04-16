---
phase: 02-billing-and-owner-admin
plan: "02"
subsystem: billing
tags: [plan-enforcement, middleware, redis-cache, react-hook, tdd]
dependency_graph:
  requires: ["02-01"]
  provides: ["planGate enforcement", "billingPlanRoutes", "usePlan()"]
  affects: ["all protected API routes (planGatePreHandler)", "frontend plan-gated UI"]
tech_stack:
  added: ["@tanstack/react-query (apps/web)"]
  patterns: ["Redis TTL cache for plan data", "TDD (RED-GREEN)", "factory function preHandler pattern"]
key_files:
  created:
    - packages/core/src/plan-config.ts
    - apps/api/src/plugins/plan-gate.test.ts
    - apps/api/src/routes/v1/billing-plan.ts
    - apps/web/src/hooks/usePlan.ts
  modified:
    - apps/api/src/plugins/plan-gate.ts
    - apps/api/src/routes/v1/index.ts
    - packages/core/src/index.ts
    - apps/web/package.json
decisions:
  - "@meridian/core must be built (tsc) before apps/api tests can resolve isFeatureResource — workspace symlinks resolve to dist/"
  - "billingPlanRoutes registered in v1 protected scope (not billing/ public scope) — plan data requires JWT auth"
  - "planGatePreHandler performs status-only check globally; planGate(resource, countFn) factory adds resource-specific enforcement per route"
metrics:
  duration: "7 min"
  completed_date: "2026-03-20"
  tasks: 2
  files: 7
---

# Phase 02 Plan 02: Plan Enforcement Middleware and usePlan Hook Summary

**One-liner:** Real planGate middleware with Redis-cached TenantSubscription enforcement returning structured 402s, plus GET /api/v1/billing/plan endpoint and usePlan() React hook.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create plan-config package + replace planGate stub with real TDD implementation | c8cc312 | plan-config.ts, plan-gate.ts, plan-gate.test.ts, core/index.ts |
| 2 | Create GET /billing/plan endpoint and usePlan() frontend hook | 28eac19 | billing-plan.ts, v1/index.ts, usePlan.ts, web/package.json |

## What Was Built

### Task 1: planGate Real Implementation (TDD)

Replaced the Phase 1 no-op stub with a two-layer enforcement strategy:

**`packages/core/src/plan-config.ts`** — shared type constants:
- `PlanResource` union type covering numeric resources (`users`, `agents`, `sites`) and feature flags (`cmdb`, `mobile`, `webhooks`, `api_access`, `scheduled_reports`)
- `PlanLimits` interface matching `SubscriptionPlan.limitsJson` shape
- `NUMERIC_RESOURCES` and `FEATURE_RESOURCES` const arrays
- `isFeatureResource(r)` predicate function
- `getLimitKey(resource)` maps resource name to `PlanLimits` key

**`apps/api/src/plugins/plan-gate.ts`** — enforcement middleware:
- `planGatePreHandler` (global hook) — checks subscription status only (ACTIVE/TRIALING pass; CANCELED/SUSPENDED return 402 SUBSCRIPTION_INACTIVE)
- `planGate(resource, countFn?)` factory — returns route-level preHandler that checks BOTH status AND resource limits
- Redis cache key `plan:${tenantId}` with 60-second TTL; DB query on cache miss
- Returns 402 with structured JSON: `{ error, limit, current, feature, upgradeTier }`
- `upgradeTier` derived from plan tier: STARTER→PROFESSIONAL, PROFESSIONAL→BUSINESS, BUSINESS→ENTERPRISE
- 22 unit tests covering all behaviors — all passing

### Task 2: Billing Plan Endpoint + usePlan() Hook

**`apps/api/src/routes/v1/billing-plan.ts`** — GET /api/v1/billing/plan:
- Requires JWT auth (registered in v1 protected scope)
- Returns `{ tier, status, limits: { maxUsers, maxAgents, maxSites, features }, trialEnd, cancelAtPeriodEnd, currentPeriodEnd }`
- 404 when no TenantSubscription found

**`apps/web/src/hooks/usePlan.ts`** — TanStack Query hook:
- `useQuery` with `queryKey: ['plan']` and `staleTime: 60_000` (matches Redis TTL)
- `hasFeature(feature)` — checks `limits.features.includes(feature)`
- `isActive()` — status === 'ACTIVE' || 'TRIALING'
- `isTrial()` — status === 'TRIALING'
- `isWithinLimit(resource, current)` — checks `plan.limits[maxResource]` vs current count; -1 = unlimited; returns `true` optimistically while loading

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @meridian/core package required explicit build before test run**
- **Found during:** Task 1 GREEN phase
- **Issue:** `isFeatureResource is not a function` — workspace resolution uses `dist/` not `src/`. The dist didn't include `plan-config.js` since it was newly created.
- **Fix:** Ran `pnpm --filter @meridian/core build` to compile TypeScript; tests passed immediately after.
- **Files modified:** None (build artifact, no source change)
- **Commit:** c8cc312

**2. [Rule 2 - Missing critical functionality] @tanstack/react-query not installed in apps/web**
- **Found during:** Task 2 — creating usePlan.ts
- **Issue:** web/package.json had no @tanstack/react-query dependency; required for useQuery hook
- **Fix:** `pnpm --filter @meridian/web add @tanstack/react-query`
- **Files modified:** apps/web/package.json, pnpm-lock.yaml
- **Commit:** 28eac19

## Self-Check: PASSED

All created files verified on disk. All task commits (c8cc312, 28eac19) verified in git log.
