---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [pnpm, turborepo, fastify, nextjs, docker, prisma, bullmq, typescript, monorepo]

# Dependency graph
requires: []
provides:
  - pnpm 9 monorepo workspace with Turborepo 2 build pipeline
  - apps/api: Fastify 5.8.2 server stub with /api/health endpoint
  - apps/web: Next.js 16.2.0 App Router stub on port 3000
  - apps/owner: Next.js 16.2.0 owner admin stub on port 3800
  - apps/worker: BullMQ 5 worker process stub
  - apps/mobile: Expo stub (package.json only)
  - packages/db: @meridian/db with Prisma 7 devDep
  - packages/types: @meridian/types with Zod 4.3.6
  - packages/core: @meridian/core service layer stub
  - docker-compose.yml: PostgreSQL 17, Redis 7, MinIO, MailHog
  - Shared TypeScript base config in packages/config/typescript/base.json
affects: [02-database, 03-auth, 04-service-desk, 05-billing, all-phases]

# Tech tracking
tech-stack:
  added:
    - pnpm@9.15.0 (workspace manager)
    - turbo@2.8.20 (build orchestration)
    - fastify@5.8.2 (API server)
    - "@fastify/jwt@10.0.0"
    - "@fastify/cors@11.2.0"
    - "@fastify/helmet@13.x"
    - "@fastify/rate-limit@10.3.0"
    - "@fastify/multipart@9.4.0"
    - "@fastify/swagger@9.7.0"
    - fastify-type-provider-zod@4.0.2 (note: zod 4 peer conflict — update when compatible version releases)
    - "@node-rs/bcrypt@1.10.7"
    - ioredis@5.3.2
    - "@aws-sdk/client-s3@3.x"
    - pino@9.x
    - dotenv@16.x
    - next@16.2.0
    - react@19.2.1
    - react-dom@19.2.1
    - prisma@7.5.0 (devDep on packages/db)
    - "@prisma/client@7.5.0"
    - zod@4.3.6
    - bullmq@5.71.0
    - typescript@5.9.3
    - tsx@4.x
  patterns:
    - pnpm workspaces with apps/* and packages/* glob pattern
    - Turborepo pipeline with ^build dependency ordering
    - Fastify server factory pattern (buildApp() async function)
    - ES module (type: module) for all Node.js packages
    - Next.js App Router with React 19 (jsx: react-jsx)
    - Shared tsconfig base via packages/config/typescript/base.json

key-files:
  created:
    - package.json (root monorepo manifest with turbo scripts)
    - pnpm-workspace.yaml (workspace definition)
    - turbo.json (Turborepo pipeline)
    - tsconfig.json (root TypeScript config)
    - .npmrc (auto-install-peers)
    - .env.example (all required environment variables)
    - .gitignore (Node/Next/Turbo artifacts)
    - docker-compose.yml (dev services)
    - packages/config/typescript/base.json (shared tsconfig)
    - packages/db/package.json, tsconfig.json, src/index.ts
    - packages/types/package.json, tsconfig.json, src/index.ts
    - packages/core/package.json, tsconfig.json, src/index.ts
    - apps/api/package.json, tsconfig.json, src/server.ts, src/index.ts
    - apps/web/package.json, tsconfig.json, next.config.ts, src/app/layout.tsx, src/app/page.tsx
    - apps/owner/package.json, tsconfig.json, next.config.ts, src/app/layout.tsx, src/app/page.tsx
    - apps/worker/package.json, tsconfig.json, src/index.ts
    - apps/mobile/package.json
    - pnpm-lock.yaml
  modified: []

key-decisions:
  - "Used fastify-type-provider-zod (not @fastify/type-provider-zod) — the @fastify/ scoped package does not exist on npm; this is an unscoped community package"
  - "ioredis@5.3.2 used instead of @3.1013.0 in plan spec — 3.1013.0 is not valid semver; ioredis major version 5 is current"
  - "turbo added to root devDependencies — was missing from plan spec but required for pnpm turbo build to resolve"
  - "fastify-type-provider-zod has unmet peer dep on zod@^3.x (we have 4.x); acceptable for Phase 1 stub since no routes use it yet"
  - "docker-compose.yml uses services: without version: field (modern Docker Compose format)"

patterns-established:
  - "Pattern: Fastify app factory — export async function buildApp() returns configured Fastify instance"
  - "Pattern: ES module type:module in all Node.js packages with .js extension imports"
  - "Pattern: Workspace dependencies via workspace:* specifier"
  - "Pattern: Turborepo dependsOn: ['^build'] ensures packages build before apps"

requirements-completed: [FNDN-01, FNDN-04, FNDN-05, FNDN-06]

# Metrics
duration: 8min
completed: 2026-03-20
---

# Phase 1 Plan 01: Monorepo Bootstrap Summary

**pnpm + Turborepo monorepo scaffold with Fastify 5 API stub, Next.js 16 web/owner stubs, BullMQ worker stub, and Docker Compose for PostgreSQL 17, Redis 7, MinIO, and MailHog**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-20T11:00:43Z
- **Completed:** 2026-03-20T11:08:20Z
- **Tasks:** 3 completed
- **Files modified:** 39

## Accomplishments

- Full monorepo workspace structure: 5 apps + 3 packages + 1 shared config package
- `pnpm install` resolved 319 packages without errors
- `pnpm turbo build` completed 7/7 tasks (all packages and apps) successfully
- Docker Compose with all 4 dev services configured and validated
- All environment variables documented in .env.example

## Task Commits

Each task was committed atomically:

1. **Task 1: Create root monorepo scaffold** - `13b2547` (chore)
2. **Task 2: Create all app and package stubs, install and build** - `d1ac295` (feat)
3. **Task 3: Create Docker Compose for dev services** - `7a47ad0` (chore)

## Files Created/Modified

- `package.json` - Root monorepo manifest with packageManager, engines, and turbo scripts
- `pnpm-workspace.yaml` - Declares apps/* and packages/* as workspace packages
- `turbo.json` - Build pipeline with ^build dependency ordering
- `tsconfig.json` - Root TypeScript config (ES2022/NodeNext/strict)
- `.npmrc` - auto-install-peers=true, strict-peer-dependencies=false
- `.env.example` - All required environment variables documented
- `.gitignore` - Node/Next/Turbo/Prisma artifact exclusions
- `pnpm-lock.yaml` - Lockfile for reproducible installs
- `packages/config/typescript/base.json` - Shared TypeScript base config
- `packages/db/src/index.ts` - Empty stub (Prisma client after schema)
- `packages/types/src/index.ts` - Empty stub (Zod schemas)
- `packages/core/src/index.ts` - Empty stub (service layer)
- `apps/api/src/server.ts` - Fastify app factory with /api/health route
- `apps/api/src/index.ts` - Entry point listening on port 4000
- `apps/web/src/app/layout.tsx` - Root layout with metadata title MeridianITSM
- `apps/web/src/app/page.tsx` - Placeholder page
- `apps/owner/src/app/layout.tsx` - Owner admin root layout
- `apps/owner/src/app/page.tsx` - Owner admin placeholder page
- `apps/worker/src/index.ts` - Worker entry point (no queues yet)
- `apps/mobile/package.json` - Minimal stub (Expo deferred to Phase 5)
- `docker-compose.yml` - All 4 dev services with healthchecks

## Decisions Made

- Used `fastify-type-provider-zod` (unscoped) instead of `@fastify/type-provider-zod` which does not exist on npm — plan spec had incorrect package name
- `ioredis@5.3.2` used instead of plan's `@3.1013.0` (invalid semver); ioredis v5 is the current stable release
- Added `turbo` to root `devDependencies` — omitted from plan but required for `pnpm turbo build` to resolve the binary
- Modern `docker-compose.yml` format without deprecated `version:` key

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed incorrect npm package name for Zod/Fastify type provider**
- **Found during:** Task 2 (pnpm install)
- **Issue:** Plan specified `@fastify/type-provider-zod@^5.10.1` which returns 404 — no such scoped package exists on npm. The actual package is `fastify-type-provider-zod`.
- **Fix:** Changed to `fastify-type-provider-zod@^4.0.2` in apps/api/package.json
- **Files modified:** `apps/api/package.json`
- **Verification:** pnpm install completed successfully
- **Committed in:** d1ac295 (Task 2 commit)

**2. [Rule 3 - Blocking] Added turbo to root devDependencies**
- **Found during:** Task 2 (pnpm turbo build)
- **Issue:** `turbo` binary not found — it was not included in root package.json devDependencies despite being needed for all build/dev scripts
- **Fix:** Added `"turbo": "^2.4.4"` to root package.json devDependencies; ran pnpm install
- **Files modified:** `package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm turbo build` completed 7/7 tasks successfully
- **Committed in:** d1ac295 (Task 2 commit)

**3. [Rule 1 - Bug] ioredis version mismatch (plan spec)**
- **Found during:** Task 2 (reviewing package versions)
- **Issue:** Plan specified `ioredis@^3.1013.0` which is not valid semver. ioredis current major version is 5.
- **Fix:** Used `ioredis@^5.3.2` in apps/api/package.json and apps/worker/package.json
- **Files modified:** `apps/api/package.json`, `apps/worker/package.json`
- **Verification:** Packages resolved and installed correctly
- **Committed in:** d1ac295 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep. Build success criteria met.

## Issues Encountered

- `fastify-type-provider-zod@4.0.2` has an unmet peer dependency on `zod@^3.x` (we have zod@4.x). This produces a warning but does not fail the install or build. The API stub does not use this package yet — it will be resolved when a Zod 4 compatible version is released or when the routes are implemented.

## User Setup Required

None — no external service configuration required for the scaffold. Docker Compose services can be started with `docker compose up -d` once Docker is running.

## Next Phase Readiness

- Monorepo workspace structure ready for Phase 01 Plan 02 (Prisma schema)
- All packages resolve and build clean
- Docker Compose ready for `docker compose up -d` to start dev services
- .env.example documents all required environment variables — copy to .env before running
- No blockers for subsequent plans

---
*Phase: 01-foundation*
*Completed: 2026-03-20*
