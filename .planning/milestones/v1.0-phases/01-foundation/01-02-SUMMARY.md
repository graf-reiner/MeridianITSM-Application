---
phase: 01-foundation
plan: 02
subsystem: database
tags: [prisma, postgresql, zod, multi-tenancy, bcrypt, seed]

requires:
  - phase: 01-01
    provides: monorepo scaffold with packages/db and packages/types stubs, pnpm workspaces, Docker Compose

provides:
  - Complete Prisma 7 schema with 62 models covering all ITSM domains
  - Tenant-scoping Prisma client extension (withTenantScope) in packages/db
  - Database seed script with default tenant, system roles, test users, SLAs, categories, plans, owner admin
  - Zod validation schemas for auth (login, JWT, owner), tenant, and common pagination/sort in packages/types

affects:
  - 01-03 (Fastify API server — needs prisma client and type schemas)
  - 01-04 (auth pipeline — needs loginWithTenantSchema, jwtPayloadSchema, ownerLoginSchema)
  - 01-05 (Next.js web app — needs types package)
  - all subsequent phases (every feature uses these models and schemas)

tech-stack:
  added:
    - "@prisma/adapter-pg ^7.5.0 — Prisma 7 PostgreSQL adapter (required for URL config in prisma.config.ts)"
    - "@node-rs/bcrypt ^1.10.7 — WASM bcrypt for password hashing in seed"
    - "pg ^8.20.0 — node-postgres pool for Prisma adapter"
  patterns:
    - "Prisma 7 datasource URL moves to prisma.config.ts (not schema.prisma) using defineConfig + adapter pattern"
    - "withTenantScope() Prisma $extends extension automatically injects tenantId on all non-global-model operations"
    - "GLOBAL_MODELS set excludes Tenant, OwnerUser, OwnerSession, SubscriptionPlan, TenantSubscription, TenantUsageSnapshot, OwnerNote from tenant scoping"
    - "Every tenant-scoped model has @@index([tenantId]) and commonly @@index([tenantId, status]) and @@index([tenantId, createdAt])"
    - "Seed uses direct PrismaClient with adapter (not global singleton) for predictable CLI execution"

key-files:
  created:
    - packages/db/prisma/schema.prisma
    - packages/db/prisma.config.ts
    - packages/db/prisma/seed.ts
    - packages/db/src/extensions/tenant.ts
    - packages/db/src/client.ts
    - packages/types/src/auth.ts
    - packages/types/src/tenant.ts
    - packages/types/src/common.ts
  modified:
    - packages/db/src/index.ts
    - packages/types/src/index.ts
    - packages/db/package.json

key-decisions:
  - "Prisma 7 requires datasource URL in prisma.config.ts via adapter — schema.prisma datasource block has no url field"
  - "@@unique([tenantId, name]) added to SLA and Category models to support seed upsert by name"
  - "prisma.config.ts uses @prisma/adapter-pg with pg.Pool for all DB operations (validate, generate, migrate, seed)"
  - "Added UserGroupMember as explicit join model (62 total models vs 61 planned) for user group membership"

patterns-established:
  - "Prisma 7 config: datasource URL in prisma.config.ts via PrismaPg adapter, not in schema.prisma"
  - "Tenant extension pattern: withTenantScope(tenantId) wraps client.$extends for automatic query scoping"
  - "Global models exclusion: runtime Set<string> check since model param is typed as string not union"
  - "Seed script: direct new PrismaClient({ adapter }) per-process, not global singleton"

requirements-completed: [FNDN-02, FNDN-03, FNDN-07, TNCY-01, TNCY-02, TNCY-03, TNCY-05]

duration: 9min
completed: 2026-03-20
---

# Phase 01 Plan 02: Database Schema and Types Summary

**62-model Prisma 7 schema with tenant-scoping extension, Zod auth/tenant/common schemas, and database seed including owner admin user**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-20T11:12:19Z
- **Completed:** 2026-03-20T11:21:28Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Defined complete Prisma 7 schema with 62 models across all ITSM domains (Core Tenancy, Service Desk, Change Management, Knowledge, Assets, Applications, Agents, CMDB, Owner Admin, Supporting)
- Created `withTenantScope()` Prisma client extension that automatically injects tenantId on all create/read/update/delete operations, with explicit exclusions for 7 global models
- Defined Zod schemas for all auth flows including tenant-aware login (`loginWithTenantSchema`), JWT payload, owner admin login (`ownerLoginSchema`), and API key creation
- Created database seed script populating default MSP tenant, 4 system roles, 3 test users, 2 SLA policies, 5 categories, 4 subscription plans, 1 customer org, and owner admin user

## Task Commits

Each task was committed atomically:

1. **Task 1: Define complete Prisma 7 schema with all models** - `6738c23` (feat)
2. **Task 2: Create Zod types package and database seed script** - `94260bf` (feat)

**Plan metadata:** (committed with SUMMARY.md)

## Files Created/Modified

- `packages/db/prisma/schema.prisma` — 62 Prisma models with all enums, indexes, and unique constraints
- `packages/db/prisma.config.ts` — Prisma 7 config with PrismaPg adapter and DATABASE_URL
- `packages/db/prisma/seed.ts` — Database seed populating all default data
- `packages/db/src/extensions/tenant.ts` — withTenantScope() Prisma client extension
- `packages/db/src/client.ts` — PrismaClient singleton with adapter, exports withTenantScope
- `packages/db/src/index.ts` — Package entry point exporting prisma, PrismaClient, withTenantScope
- `packages/db/package.json` — Added @node-rs/bcrypt, @prisma/adapter-pg, pg; added prisma.seed config
- `packages/types/src/auth.ts` — Zod schemas: login, loginWithTenant, register, JWT, owner auth, API key
- `packages/types/src/tenant.ts` — Zod schemas: tenant type, subscription tier, createTenant, settings
- `packages/types/src/common.ts` — Zod schemas: uuid, pagination, sort, apiError
- `packages/types/src/index.ts` — Re-exports all type modules

## Decisions Made

- **Prisma 7 adapter pattern:** Prisma 7.5.0 removed `url` from datasource block in schema.prisma. Connection URL now lives in `prisma.config.ts` using `defineConfig` with a `@prisma/adapter-pg` adapter. This was a Rule 1 (bug) auto-fix — the plan spec used Prisma 6 schema syntax.
- **@@unique on SLA and Category:** Added `@@unique([tenantId, name])` to both SLA and Category models to support upsert-by-name in the seed script. The plan didn't specify these constraints but they are required for correctness.
- **62 models vs 61:** Added UserGroupMember as explicit model (plan listed it separately as "Also add:"). Count is 62.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma 7 datasource URL moved to prisma.config.ts**
- **Found during:** Task 1 (schema validation)
- **Issue:** Prisma 7.5.0 rejects `url = env("DATABASE_URL")` in datasource block — requires adapter-based config in prisma.config.ts
- **Fix:** Removed url from schema.prisma datasource block; created prisma.config.ts using `defineConfig` with `@prisma/adapter-pg`; installed `@prisma/adapter-pg` and `pg`
- **Files modified:** packages/db/prisma/schema.prisma, packages/db/prisma.config.ts (new), packages/db/src/client.ts, packages/db/package.json
- **Verification:** `npx prisma validate` passes; `npx prisma generate` succeeds
- **Committed in:** 6738c23 (Task 1 commit) and 94260bf (Task 2 commit for client.ts update)

**2. [Rule 2 - Missing Critical] Added @@unique constraints to SLA and Category**
- **Found during:** Task 2 (seed script implementation)
- **Issue:** Seed needs to upsert SLA and Category by name within a tenant; no unique constraint existed for name+tenantId
- **Fix:** Added `@@unique([tenantId, name])` to both SLA and Category models; regenerated Prisma client
- **Files modified:** packages/db/prisma/schema.prisma
- **Verification:** `npx prisma validate` passes after constraint addition
- **Committed in:** 94260bf (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for correct operation. No scope creep. Prisma 7 breaking change was expected given the version jump noted in RESEARCH.md State of the Art section.

## Issues Encountered

- Prisma 7 breaking change: datasource URL no longer in schema.prisma. Fixed by adopting adapter pattern. Documentation at https://pris.ly/d/config-datasource.

## User Setup Required

None - no external service configuration required for this plan. Database migration and seeding require Docker Compose to be running (covered in plan 01-01).

## Next Phase Readiness

- packages/db exports: `prisma` (singleton), `PrismaClient`, `withTenantScope` — ready for import by apps/api
- packages/types exports: `loginWithTenantSchema`, `jwtPayloadSchema`, `ownerLoginSchema`, `createTenantSchema`, `paginationSchema` — ready for Fastify route validation
- Schema is migration-ready: `pnpm --filter @meridian/db db:migrate` (requires Docker Compose up)
- Seed script is ready: `pnpm --filter @meridian/db db:seed` (requires migration first)

---
*Phase: 01-foundation*
*Completed: 2026-03-20*
