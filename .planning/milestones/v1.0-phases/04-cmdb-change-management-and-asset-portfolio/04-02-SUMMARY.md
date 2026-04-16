---
phase: 04-cmdb-change-management-and-asset-portfolio
plan: 02
subsystem: api
tags: [cmdb, prisma, postgresql, recursive-cte, impact-analysis, fastify, rbac]

# Dependency graph
requires:
  - phase: 04-cmdb-change-management-and-asset-portfolio
    provides: Prisma CMDB schema (CmdbConfigurationItem, CmdbRelationship, CmdbChangeRecord, CmdbCategory, CmdbTicketLink)
  - phase: 01-foundation
    provides: Fastify server, RBAC plugin (requirePermission), prisma client, permissions.ts
provides:
  - CMDB service with CI CRUD, relationships, impact analysis via recursive CTE, change history, categories
  - CMDB REST API at /api/v1/cmdb/* with cmdb.view/cmdb.edit/cmdb.delete permissions
  - Recursive PostgreSQL CTE impact analysis (downstream + upstream, depth capped at 5, cycle guard)
  - Per-field CmdbChangeRecord logging on every CI update
  - Hierarchical CmdbCategory with cycle detection via raw SQL CTE
affects:
  - 04-cmdb-frontend
  - 04-cmdb-discovery

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recursive CTE impact graph: WITH RECURSIVE impact_graph AS (...) for downstream + separate upstream traversal"
    - "CTE cycle guard: NOT (r.targetId = ANY(ig.path)) prevents infinite loops in relationship graphs"
    - "For UPDATE lock pattern for sequential ciNumber (same as ticketNumber in ticket.service.ts)"
    - "Per-field change logging: compare each field individually, createMany CmdbChangeRecord entries"
    - "Soft-delete pattern: deleteCI sets status=DECOMMISSIONED rather than hard delete"
    - "Cycle detection in hierarchical categories via post-creation raw SQL CTE check with rollback"

key-files:
  created:
    - apps/api/src/services/cmdb.service.ts
    - apps/api/src/routes/v1/cmdb/index.ts
  modified:
    - apps/api/src/routes/v1/index.ts

key-decisions:
  - "deleteCI soft-deletes (status=DECOMMISSIONED) rather than hard-deleting — preserves history"
  - "Impact analysis traverses two separate CTEs (downstream and upstream) rather than a bidirectional CTE — cleaner direction semantics"
  - "Category cycle detection runs as a post-creation raw SQL query with compensating delete on cycle found — avoids async self-ref TS error (same pattern as Phase 3-06)"
  - "cmdb.service.ts takes (tenantId, ...) not (prisma, tenantId, ...) — consistent with ticket.service.ts pattern which uses the global prisma singleton"

patterns-established:
  - "CMDB service pattern: all functions scoped by (tenantId, id) — never expose cross-tenant data"
  - "CMDB permissions: cmdb.view for reads, cmdb.edit for writes, cmdb.delete for deletes — separate from admin/tickets"

requirements-completed: [CMDB-01, CMDB-02, CMDB-03, CMDB-04, CMDB-05, CMDB-06, CMDB-07, CMDB-08, CMDB-11, CMDB-14]

# Metrics
duration: 12min
completed: 2026-03-22
---

# Phase 04 Plan 02: CMDB Backend Summary

**PostgreSQL recursive CTE impact analysis, per-field change history logging, and full CMDB REST API with CMDB-specific RBAC permissions**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-22T15:05:00Z
- **Completed:** 2026-03-22T15:17:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Full CMDB service with CI CRUD using FOR UPDATE locking for sequential ciNumbers
- Recursive PostgreSQL CTE impact analysis traversing downstream and upstream relationships with depth capping at 5 and cycle guard via `ANY(ig.path)`
- Per-field change logging: every updateCI call compares each field individually and creates one CmdbChangeRecord per changed field
- CMDB REST API with 14 endpoints enforcing cmdb.view/cmdb.edit/cmdb.delete permissions — no generic admin bypass
- Hierarchical CmdbCategory management with cycle detection via raw SQL CTE and compensating rollback

## Task Commits

Each task was committed atomically:

1. **Task 1: CMDB service with CI CRUD, relationships, impact analysis, and change history** - `943f980` (feat)
2. **Task 2: CMDB API routes with CMDB-specific permissions** - `afe6989` (feat)

**Plan metadata:** (to be added in final docs commit)

## Files Created/Modified
- `apps/api/src/services/cmdb.service.ts` - Full CMDB service: createCI, getCI, listCIs, updateCI, deleteCI, createRelationship, deleteRelationship, getCIRelationships, getImpactAnalysis, listCIChangeHistory, createCategory, listCategories, updateCategory, deleteCategory
- `apps/api/src/routes/v1/cmdb/index.ts` - CMDB REST routes: CI CRUD, relationships, impact analysis, change history, categories
- `apps/api/src/routes/v1/index.ts` - Registered cmdbRoutes

## Decisions Made
- `deleteCI` soft-deletes (sets status to DECOMMISSIONED) rather than hard-deleting — preserves history and relationships
- Impact analysis uses two separate CTEs (downstream source→target, upstream target→source) for clean directional semantics
- Category cycle detection posts a compensating delete if cycle found — consistent with Phase 3-06 pattern
- Service functions use global `prisma` singleton (not passed-in tx) — consistent with ticket.service.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial cmdb.service.ts imported `PrismaClient` from `@prisma/client` for transaction type annotation — removed and replaced with direct `prisma.$transaction` pattern (same as ticket.service.ts). TypeScript infers `tx` type automatically.

## Next Phase Readiness
- CMDB backend fully operational, ready for CMDB frontend pages
- Impact analysis endpoint ready for CMDB frontend visualizations
- Change history ready for audit trail display
- Categories ready for CI categorization in UI

---
*Phase: 04-cmdb-change-management-and-asset-portfolio*
*Completed: 2026-03-22*
