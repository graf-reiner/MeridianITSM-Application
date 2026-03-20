---
phase: 03-core-itsm
plan: "06"
subsystem: settings-api
tags: [settings, users, roles, groups, queues, categories, sites, vendors, contracts, branding, logs, rbac, sse]
dependency_graph:
  requires:
    - "03-01 (ticket routes — established v1 route pattern)"
    - "01-03 (Fastify + RBAC plugin)"
    - "01-02 (Prisma schema with all models)"
    - "01-04 (Redis lib)"
  provides:
    - "apps/api/src/routes/v1/settings/* — all settings API routes"
    - "SETT-01 through SETT-12 requirements fulfilled"
  affects:
    - "apps/api/src/routes/v1/index.ts — settingsRoutes registered"
tech_stack:
  added: []
  patterns:
    - "Fastify plugin per resource group (usersSettingsRoutes, rolesSettingsRoutes, etc.)"
    - "requirePermission('settings:read|write') RBAC on all routes"
    - "tenantId scoping on every Prisma query"
    - "SSE via reply.raw.write + dedicated ioredis subscriber connection"
    - "MinIO logo upload via storage.service uploadFile/getFileSignedUrl"
key_files:
  created:
    - apps/api/src/routes/v1/settings/users.ts
    - apps/api/src/routes/v1/settings/roles.ts
    - apps/api/src/routes/v1/settings/groups.ts
    - apps/api/src/routes/v1/settings/queues.ts
    - apps/api/src/routes/v1/settings/categories.ts
    - apps/api/src/routes/v1/settings/sites.ts
    - apps/api/src/routes/v1/settings/vendors.ts
    - apps/api/src/routes/v1/settings/business-units.ts
    - apps/api/src/routes/v1/settings/contracts.ts
    - apps/api/src/routes/v1/settings/branding.ts
    - apps/api/src/routes/v1/settings/logs.ts
    - apps/api/src/routes/v1/settings/index.ts
  modified:
    - apps/api/src/routes/v1/index.ts
decisions:
  - "Category cycle detection uses raw SQL query to avoid TypeScript TS7022 self-referencing type error in async while loop"
  - "SSE log streaming creates a dedicated ioredis subscriber connection per request (not sharing the global redis client) to avoid blocking"
  - "Branding settings stored as JSON blob in tenant.settings field (not separate table)"
  - "Logo upload enforces 2MB max, validates MIME type, stores under {tenantId}/branding/logo-{timestamp}.{ext}"
  - "contracts.ts uses Prisma OR filter for active contracts: endDate null OR endDate > now"
metrics:
  duration: "8 min"
  completed: "2026-03-20"
  tasks: 2
  files: 13
---

# Phase 03 Plan 06: Settings API Routes Summary

Complete settings/configuration API covering all 11 resource modules (SETT-01 to SETT-12) with RBAC-gated CRUD, hierarchical categories, MinIO branding logo upload, and SSE worker log streaming.

## What Was Built

### Task 1: Core Settings Routes (commit 19abcf1)

**Users (SETT-01):** Full CRUD plus dedicated `reset-password`, `disable`, and `enable` endpoints. Password hashing via `@node-rs/bcrypt` at cost factor 12. Email uniqueness enforced per tenant.

**Roles (SETT-02):** List/create/update/delete with system role protection. System roles blocked from update and delete. Assigns `isSystemRole: false` on creation. Includes assigned user count via `_count`.

**Groups (SETT-03):** Group CRUD plus member sub-routes (`GET /members`, `POST /members`, `DELETE /members/:userId`). Delete cascades member records before group deletion. Duplicate membership prevented.

**Queues (SETT-04):** Standard CRUD with `autoAssign`, `defaultAssigneeId` (validated per tenant), and `assignmentRules` JSON. Delete blocked if tickets assigned.

**Categories (SETT-06):** Hierarchical CRUD with `tree` endpoint (application-level nesting). Flat list includes `_count.children`. Cycle detection via ancestor walk. Delete blocked if children or tickets exist.

### Task 2: Extended Settings Routes (commit 7eb7de4)

**Sites (SETT-07):** Standard CRUD. Delete blocked if users or assets assigned to the site.

**Vendors (SETT-08):** Standard CRUD. List includes contract count. Detail includes contract list. Delete blocked if contracts exist.

**Business Units (SETT-09):** Simple CRUD on `BusinessUnit` model.

**Contracts (SETT-10):** CRUD with vendor relation included. List supports `vendorId` and `active` query filters. Active filter: `endDate IS NULL OR endDate > NOW()`. Delete cascades `ContractAsset` links.

**Branding (SETT-11):** `GET` returns branding from `tenant.settings` JSON. `PATCH` merges updates into settings JSON. `POST /logo` accepts multipart upload via `@fastify/multipart`, enforces 2MB limit and MIME type allowlist, stores in MinIO via `storage.service`, updates `tenant.settings.logoUrl`.

**Logs (SETT-12):** `GET /recent` returns last 100 entries from Redis list `worker-logs:recent`. `GET /stream` is an SSE endpoint: subscribes to `worker-logs:{tenantId}` Redis pub/sub channel, streams log entries as `data: {json}\n\n`, sends keep-alive pings every 15s, unsubscribes on client disconnect.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript TS7022 on async cycle detection in categories.ts**
- **Found during:** Task 1 verification
- **Issue:** TypeScript reports "implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer" when using `prisma.category.findFirst` inside an async while loop assigned to a `let` variable in the same scope
- **Fix:** Rewrote `wouldCreateCycle` to use `prisma.$queryRaw` template literal which returns a typed array, breaking the self-reference chain TypeScript was confused by
- **Files modified:** `apps/api/src/routes/v1/settings/categories.ts`
- **Commit:** 19abcf1

**2. [Rule 1 - Bug] Prisma Json type mismatch in branding.ts**
- **Found during:** Task 2 verification
- **Issue:** `Record<string, unknown>` not assignable to Prisma's `NullableJsonNullValueInput | InputJsonValue | undefined` for the `settings` field
- **Fix:** Added `as any` cast at the Prisma update call (standard pattern for Prisma Json fields with derived types)
- **Files modified:** `apps/api/src/routes/v1/settings/branding.ts`
- **Commit:** 7eb7de4

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| users.ts contains `reset-password` | PASS |
| users.ts contains `hash(` (bcrypt) | PASS |
| roles.ts contains `isSystem` | PASS |
| roles.ts contains `permissions` | PASS |
| groups.ts contains `members` | PASS |
| queues.ts contains `autoAssign` | PASS |
| queues.ts contains `assignmentRules` | PASS |
| categories.ts contains `parentId` | PASS |
| categories.ts contains `tree` | PASS |
| index.ts exists and registers all | PASS |
| v1/index.ts contains `settingsRoutes` | PASS |
| sites.ts GET and POST | PASS |
| vendors.ts GET and POST | PASS |
| business-units.ts GET and POST | PASS |
| contracts.ts contains `vendorId` | PASS |
| contracts.ts contains `endDate` | PASS |
| branding.ts contains `logoUrl` | PASS |
| branding.ts contains `request.file` | PASS |
| logs.ts contains `text/event-stream` | PASS |
| logs.ts contains `subscribe` | PASS |
| TypeScript compilation succeeds | PASS |

## Self-Check: PASSED

All created files verified present:
- apps/api/src/routes/v1/settings/users.ts — FOUND
- apps/api/src/routes/v1/settings/roles.ts — FOUND
- apps/api/src/routes/v1/settings/groups.ts — FOUND
- apps/api/src/routes/v1/settings/queues.ts — FOUND
- apps/api/src/routes/v1/settings/categories.ts — FOUND
- apps/api/src/routes/v1/settings/sites.ts — FOUND
- apps/api/src/routes/v1/settings/vendors.ts — FOUND
- apps/api/src/routes/v1/settings/business-units.ts — FOUND
- apps/api/src/routes/v1/settings/contracts.ts — FOUND
- apps/api/src/routes/v1/settings/branding.ts — FOUND
- apps/api/src/routes/v1/settings/logs.ts — FOUND
- apps/api/src/routes/v1/settings/index.ts — FOUND

Commits verified:
- 19abcf1 — feat(03-06): user/role/group/queue/category settings routes — FOUND
- 7eb7de4 — feat(03-06): site/vendor/business-unit/contract/branding/log settings routes — FOUND
