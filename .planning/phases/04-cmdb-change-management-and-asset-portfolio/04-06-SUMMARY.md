---
phase: 04-cmdb-change-management-and-asset-portfolio
plan: 06
subsystem: api
tags: [prisma, fastify, application-portfolio, dependency-graph, crud]

# Dependency graph
requires:
  - phase: 04-01
    provides: Prisma schema with Application, ApplicationDependency, ApplicationDocument, ApplicationActivity, ApplicationAsset models

provides:
  - Application CRUD API with 9 types, 5 statuses, 4 criticality levels, 4 hosting models, 4 lifecycle stages
  - Dependency mapping with 7 dependency types and self-dependency prevention
  - Document management with 11 document types
  - Asset relationships with 3 relationship types (RUNS_ON, HOSTED_BY, USES)
  - Portfolio stats endpoint (totals by status, by criticality, annual cost sum)
  - Dependency graph endpoint returning nodes/edges for ReactFlow rendering
  - Per-field audit trail via ApplicationActivity on create and update
affects: [05-mobile, frontend-application-portfolio]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Application service follows global prisma singleton pattern (same as cmdb.service.ts)
    - Stats/graph routes defined before /:id in Fastify to prevent parameterized route conflict
    - settings.read/settings.update permissions used for application routes (no dedicated app permissions exist)

key-files:
  created:
    - apps/api/src/services/application.service.ts
    - apps/api/src/routes/v1/applications/index.ts
  modified:
    - apps/api/src/routes/v1/index.ts

key-decisions:
  - "settings.read/settings.update used for application routes — no APP-specific permissions exist in permissions.ts; applications are a settings-level concern"
  - "Portfolio stats/graph routes defined before /:id in Fastify route registration — prevents parameterized route conflict (same pattern as changeRoutes /calendar)"
  - "Self-dependency prevention throws Error('Self-dependency is not allowed') in service layer, caught and returned as 400 in route handler"
  - "deleteApp cascades manually: deletes dependencies (both source and target directions), documents, asset links, activities before deleting the application"

patterns-established:
  - "Application portfolio service: global prisma singleton, per-field audit trail, self-dependency guard, manual cascade delete"
  - "Sub-resource delete routes use /applications/{resource-name}/:resourceId pattern (not nested under /:id) for clean URL design"

requirements-completed: [APP-01, APP-02, APP-03, APP-04, APP-05, APP-06]

# Metrics
duration: 10min
completed: 2026-03-22
---

# Phase 04 Plan 06: Application Portfolio API Summary

**Application portfolio REST API with CRUD for 9 app types, dependency graph mapping 7 relationship types, 11 document types, asset linking, portfolio stats, and ReactFlow-ready graph endpoint**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-22T15:07:00Z
- **Completed:** 2026-03-22T15:17:13Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Full application CRUD service with per-field audit trail via ApplicationActivity on create and update
- Dependency mapping with self-dependency prevention and 7 dependency types (DATA_FLOW, API_CALL, SHARED_DATABASE, AUTHENTICATION, FILE_TRANSFER, MESSAGE_QUEUE, OTHER)
- Document management supporting 11 types (ARCHITECTURE, API_SPEC, RUNBOOK, SLA_DOC, SECURITY, COMPLIANCE, USER_GUIDE, ADMIN_GUIDE, RELEASE_NOTES, DEPLOYMENT, OTHER)
- Asset relationships with 3 types (RUNS_ON, HOSTED_BY, USES) and isPrimary flag
- Portfolio stats: totals by status, by criticality, deprecated count, sum of active app annual costs
- Dependency graph nodes+edges endpoint ready for ReactFlow rendering

## Task Commits

Each task was committed atomically:

1. **Task 1: Application service with CRUD, dependencies, documents, and portfolio stats** - `f176247` (feat)
2. **Task 2: Application API routes** - `35c11b7` (feat)

## Files Created/Modified
- `apps/api/src/services/application.service.ts` - Full application portfolio service: createApp, getApp, listApps, updateApp, deleteApp, addDependency, removeDependency, addDocument, removeDocument, linkAsset, unlinkAsset, getPortfolioStats, getDependencyGraph
- `apps/api/src/routes/v1/applications/index.ts` - Fastify routes for all application sub-resources under /api/v1/applications
- `apps/api/src/routes/v1/index.ts` - Registered applicationRoutes

## Decisions Made
- Used `settings.read`/`settings.update` permissions for application routes — no APP-specific permissions exist in `permissions.ts`; applications are a settings-level concern per plan specification
- `/stats` and `/graph` routes defined before `/:id` in Fastify registration to prevent parameterized route swallowing fixed paths (same pattern established in changeRoutes for `/calendar`)
- Manual cascade delete in `deleteApp` (dependencies in both source+target directions, documents, asset links, activities) rather than relying on DB cascade — consistent with project delete patterns

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None — TypeScript compilation shows only pre-existing errors in `cmdb-import.service.ts` (unrelated to this plan). No errors in new application files.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Application portfolio API is complete and ready for frontend integration
- Dependency graph data (`/api/v1/applications/graph`) is structured for ReactFlow: `{ nodes: [{id, name, type, status, criticality}], edges: [{id, sourceId, targetId, dependencyType}] }`
- Phase 5 mobile app can consume the application portfolio endpoints via the existing Fastify API

---
*Phase: 04-cmdb-change-management-and-asset-portfolio*
*Completed: 2026-03-22*
