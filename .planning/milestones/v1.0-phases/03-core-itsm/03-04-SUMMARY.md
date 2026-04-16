---
phase: 03-core-itsm
plan: "04"
subsystem: knowledge-base
tags: [knowledge, articles, lifecycle, search, voting, api]
dependency_graph:
  requires: []
  provides: [knowledge-service, knowledge-api-routes]
  affects: [apps/api]
tech_stack:
  added: []
  patterns: [FOR-UPDATE-sequential-number, status-transition-map, async-view-increment, floor-zero-decrement]
key_files:
  created:
    - apps/api/src/services/knowledge.service.ts
    - apps/api/src/routes/v1/knowledge/index.ts
  modified:
    - apps/api/src/test-utils/setup.ts
decisions:
  - "View count is incremented asynchronously (void promise) to avoid blocking article GET responses"
  - "helpfulCount decrement uses Math.max(0, count-1) instead of Prisma decrement to ensure floor-zero guarantee"
  - "getPublishedArticles enforces both status=PUBLISHED AND visibility=PUBLIC — portal endpoint cannot be weakened by query params"
  - "Status transition map validates all lifecycle changes; throws Error with descriptive message for 422 responses"
metrics:
  duration: 7 min
  completed: "2026-03-20"
  tasks_completed: 1
  files_changed: 3
---

# Phase 3 Plan 04: Knowledge Base API Summary

Knowledge base service and REST API implementing full article lifecycle management — DRAFT -> IN_REVIEW -> PUBLISHED -> RETIRED transitions, full-text search across title/summary/tags, helpful/not-helpful voting with floor-zero guarantee, view count tracking, and a dedicated PUBLIC-only portal endpoint.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Knowledge service and API routes | c6c113e | knowledge.service.ts, routes/v1/knowledge/index.ts, test-utils/setup.ts |

## Decisions Made

1. **Async view count increment** — `void prisma.knowledgeArticle.update(...)` runs without awaiting so the GET response is not blocked by the increment query.

2. **helpfulCount floor-zero** — Used `Math.max(0, existing.helpfulCount - 1)` on decrement rather than `{ decrement: 1 }` to guarantee the count never goes negative. Prisma's raw `decrement` could produce negative values without a DB constraint.

3. **Portal endpoint strict enforcement** — `getPublishedArticles` hard-codes `status: 'PUBLISHED', visibility: 'PUBLIC'` and accepts no overrides. The portal endpoint cannot be exploited to return INTERNAL or non-PUBLISHED articles.

4. **Status transition validation** — Invalid transitions throw `Error` with a descriptive message ("Invalid status transition: PUBLISHED -> IN_REVIEW"). The route handler catches this and returns 422 Unprocessable Entity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS2742 in test-utils/setup.ts**
- **Found during:** TypeScript verification (tsc --noEmit)
- **Issue:** `mockPrisma` and `mockRedis` had inferred types that TS composite mode couldn't name without a reference to an internal vitest path (`.pnpm/@vitest+spy@4.1.0/...`). Caused compilation failure.
- **Fix:** Added explicit `type AnyFn = ReturnType<typeof vi.fn>` and typed both exports as `Record<string, Record<string, AnyFn> | AnyFn>` / `Record<string, AnyFn>`
- **Files modified:** `apps/api/src/test-utils/setup.ts`
- **Commit:** c6c113e

**2. [Rule 1 - Bug] Avoided @prisma/client namespace import**
- **Found during:** Initial tsc run
- **Issue:** `import type { Prisma } from '@prisma/client'` failed because `@prisma/client` isn't a direct dependency of `apps/api` (it's in `packages/db`)
- **Fix:** Replaced with inline TypeScript object literal types throughout the service, avoiding any external Prisma namespace import
- **Files modified:** `apps/api/src/services/knowledge.service.ts`
- **Commit:** c6c113e

## Self-Check: PASSED

- FOUND: apps/api/src/services/knowledge.service.ts
- FOUND: apps/api/src/routes/v1/knowledge/index.ts
- FOUND: commit c6c113e
