---
phase: 02-billing-and-owner-admin
plan: 05
subsystem: ui
tags: [next.js, recharts, prisma, react, owner-admin, tenant-management, impersonation]

# Dependency graph
requires:
  - phase: 02-billing-and-owner-admin
    provides: owner auth (signOwnerToken/verifyOwnerToken), impersonation token generation (generateImpersonationToken), existing /api/tenants GET stub

provides:
  - Owner admin dashboard with MRR/ARR Recharts LineChart and stat cards
  - Tenant list page with debounced search, plan/status filters, and pagination
  - Tenant detail page with subscription info, usage progress bars, lifecycle actions, impersonation, and internal notes
  - REST APIs: GET /api/tenants (search/filter/paginate), GET /api/tenants/[id] (full detail with usage)
  - REST APIs: POST /api/tenants/[id]/lifecycle (suspend/unsuspend/delete/extend_trial/apply_grace_period)
  - REST APIs: POST /api/tenants/[id]/impersonate (15-min token), GET+POST /api/tenants/[id]/notes
  - GET /api/dashboard (MRR, ARR, tenant counts, 12-month MRR history)
  - POST /api/provision (transactional tenant creation with roles, SLAs, categories, admin user)
  - provisionTenant() library function in apps/owner/src/lib/provisioning.ts

affects:
  - Phase 03 and beyond: provisioning used for test tenant creation
  - Any future owner-admin features that build on tenant management UI

# Tech tracking
tech-stack:
  added: [recharts@2.x]
  patterns:
    - Route group (admin) layout with AdminNav sidebar and main content area
    - Client components fetch from /api/* routes using localStorage owner_token
    - Lifecycle actions with inline confirmation dialogs (no modal library needed)
    - Debounced search with useDebounce hook for network efficiency

key-files:
  created:
    - apps/owner/src/app/api/tenants/[id]/route.ts
    - apps/owner/src/app/api/tenants/[id]/lifecycle/route.ts
    - apps/owner/src/app/api/tenants/[id]/impersonate/route.ts
    - apps/owner/src/app/api/tenants/[id]/notes/route.ts
    - apps/owner/src/app/api/dashboard/route.ts
    - apps/owner/src/app/api/provision/route.ts
    - apps/owner/src/lib/provisioning.ts
    - apps/owner/src/app/(admin)/layout.tsx
    - apps/owner/src/app/(admin)/dashboard/page.tsx
    - apps/owner/src/app/(admin)/tenants/page.tsx
    - apps/owner/src/app/(admin)/tenants/[id]/page.tsx
    - apps/owner/src/components/RevenueChart.tsx
    - apps/owner/src/components/AdminNav.tsx
  modified:
    - apps/owner/src/app/api/tenants/route.ts (enhanced with search/filter/pagination)
    - apps/owner/package.json (added recharts)

key-decisions:
  - "SubscriptionPlanTier imported as local union type in provisioning.ts — @meridian/db only exports prisma client, not Prisma enums"
  - "authHeaders typed as Record<string, string> in client components — TypeScript rejects optional Authorization property in HeadersInit"
  - "Recharts Tooltip formatter uses unknown parameter types — recharts ValueType can be undefined per library types"
  - "MRR history derived from TenantSubscription.createdAt as approximation — production would use dedicated billing events or snapshots"

patterns-established:
  - "Owner API routes verify JWT from Authorization header using verifyOwnerToken() — middleware already validates at edge, but routes re-verify for ownerUserId extraction"
  - "Lifecycle actions are idempotent — suspend on suspended tenant is harmless, unsuspend on active tenant is harmless"
  - "Provisioning is fully transactional — all or nothing (tenant + subscription + roles + SLAs + categories + user)"

requirements-completed: [OADM-03, OADM-04, OADM-05, OADM-07, OADM-12]

# Metrics
duration: 11min
completed: 2026-03-20
---

# Phase 02 Plan 05: Owner Admin Dashboard and Tenant Management Summary

**Owner operator control plane: MRR/ARR dashboard with Recharts, searchable tenant list, lifecycle action APIs (suspend/unsuspend/delete/extend_trial/grace_period), 15-min impersonation tokens, internal notes, and transactional provisioning**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-20T14:25:37Z
- **Completed:** 2026-03-20T14:36:00Z
- **Tasks:** 3 (1a, 1b, 2)
- **Files modified:** 14

## Accomplishments
- Full tenant management REST API: list (search/filter/paginate), detail, lifecycle, impersonation, notes, dashboard metrics
- provisionTenant() creates a complete tenant in one transaction: Tenant + TenantSubscription (TRIALING, 14-day) + 4 system roles + 2 SLA policies + 5 categories + admin user
- Owner admin UI: dashboard with 6 stat cards, Recharts MRR/ARR line chart, recent tenants table; tenant list with debounced search and pagination; tenant detail with lifecycle buttons, confirmation dialogs, impersonation trigger, and notes CRUD

## Task Commits

Each task was committed atomically:

1. **Task 1a: Tenant CRUD API and provisioning library** - `318b67a` (feat)
2. **Task 1b: Lifecycle, impersonation, notes, and dashboard APIs** - `0e5216b` (feat)
3. **Task 2: Owner admin dashboard and tenant management UI** - `6b9548d` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `apps/owner/src/app/api/tenants/route.ts` - Enhanced with search/plan/status filters and pagination
- `apps/owner/src/app/api/tenants/[id]/route.ts` - Full tenant detail with subscription, usage, counts
- `apps/owner/src/app/api/tenants/[id]/lifecycle/route.ts` - 5 lifecycle actions
- `apps/owner/src/app/api/tenants/[id]/impersonate/route.ts` - 15-min impersonation token
- `apps/owner/src/app/api/tenants/[id]/notes/route.ts` - Notes CRUD
- `apps/owner/src/app/api/dashboard/route.ts` - MRR/ARR metrics, 12-month history
- `apps/owner/src/app/api/provision/route.ts` - POST provisioning endpoint
- `apps/owner/src/lib/provisioning.ts` - Transactional provisionTenant() function
- `apps/owner/src/app/(admin)/layout.tsx` - Route group layout with AdminNav sidebar
- `apps/owner/src/app/(admin)/dashboard/page.tsx` - Dashboard with charts and stat cards
- `apps/owner/src/app/(admin)/tenants/page.tsx` - Tenant list with search/filter/pagination
- `apps/owner/src/app/(admin)/tenants/[id]/page.tsx` - Full tenant detail with all actions
- `apps/owner/src/components/RevenueChart.tsx` - Recharts LineChart MRR/ARR
- `apps/owner/src/components/AdminNav.tsx` - Sidebar navigation

## Decisions Made
- Used local union type for `SubscriptionPlanTier` in provisioning.ts — `@meridian/db` exports only the Prisma client instance, not Prisma enums directly
- `authHeaders` typed as `Record<string, string>` in client components to satisfy TypeScript's `HeadersInit` constraint
- MRR history calculated from `TenantSubscription.createdAt` as an approximation — suitable for early stages, production would use dedicated billing events

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SubscriptionPlanTier import error in provisioning.ts**
- **Found during:** Task 1a (provisioning library)
- **Issue:** Plan specified `import type { SubscriptionPlanTier } from '@meridian/db'` but `@meridian/db` only exports the Prisma client
- **Fix:** Replaced with local union type `type SubscriptionPlanTier = 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE'`
- **Files modified:** `apps/owner/src/lib/provisioning.ts`
- **Verification:** `tsc --noEmit` passes
- **Committed in:** 318b67a (Task 1a commit)

**2. [Rule 1 - Bug] Fixed wrong relative import paths in [id] sub-routes**
- **Found during:** Task 1b (impersonate and notes routes)
- **Issue:** Routes at `src/app/api/tenants/[id]/impersonate/` and `notes/` used 4-level relative paths (`../../../../lib/`) but needed 5 levels (`../../../../../lib/`)
- **Fix:** Corrected to `../../../../../lib/owner-auth` and `../../../../../lib/impersonation`
- **Files modified:** `apps/owner/src/app/api/tenants/[id]/impersonate/route.ts`, `notes/route.ts`
- **Verification:** `tsc --noEmit` passes
- **Committed in:** 0e5216b (Task 1b commit)

**3. [Rule 1 - Bug] Fixed TypeScript errors in UI components**
- **Found during:** Task 2 (UI pages)
- **Issue 1:** `authHeaders` with `Authorization?: undefined` fails `HeadersInit` constraint in fetch calls — typed as `Record<string, string>` instead
- **Issue 2:** Recharts Tooltip `formatter` parameter typed as `number` but library provides `ValueType | undefined` — widened to `unknown`
- **Files modified:** `apps/owner/src/app/(admin)/tenants/[id]/page.tsx`, `apps/owner/src/components/RevenueChart.tsx`
- **Verification:** `tsc --noEmit` passes with no errors
- **Committed in:** 6b9548d (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes necessary for TypeScript correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed TypeScript errors above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Owner admin control plane is complete and functional
- Provisioning workflow ready for Phase 03+ test tenant setup
- Impersonation infrastructure in place for support workflows
- No blockers for Phase 02-06 or subsequent phases

---
*Phase: 02-billing-and-owner-admin*
*Completed: 2026-03-20*
