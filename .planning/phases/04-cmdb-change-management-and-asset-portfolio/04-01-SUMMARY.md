---
phase: 04-cmdb-change-management-and-asset-portfolio
plan: "01"
subsystem: asset-management
tags: [assets, crud, lifecycle, portal, rbac]
dependency_graph:
  requires: []
  provides: [asset-crud-api, asset-status-lifecycle, portal-assets-page]
  affects: [04-02-cmdb, 04-03-change-management]
tech_stack:
  added: []
  patterns: [FOR-UPDATE-sequential-id, status-transition-guard, me-shorthand-jwt-resolution]
key_files:
  created:
    - apps/api/src/services/asset.service.ts
    - apps/api/src/routes/v1/assets/index.ts
  modified:
    - apps/api/src/routes/v1/index.ts
    - apps/web/src/app/portal/assets/page.tsx
decisions:
  - "Sequential assetTag uses FOR UPDATE lock in $transaction — same pattern as ticketNumber in ticket.service.ts"
  - "'me' shorthand in assignedToId resolved server-side to JWT userId — no special portal route needed"
  - "Soft-delete (DISPOSED) when asset has linked references; hard-delete otherwise"
  - "Portal page uses TanStack useQuery (not useState+useEffect) for consistency with dashboard pages"
metrics:
  duration: "4 min"
  completed_date: "2026-03-22"
  tasks_completed: 2
  files_changed: 4
---

# Phase 4 Plan 1: Asset Management Backend and Portal Assets Summary

Asset CRUD API with status lifecycle enforcement, sequential assetTag generation (AST-00001 format), and portal assets page wired to real data via TanStack Query.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Asset service and API routes | a05d5a6 | asset.service.ts, routes/v1/assets/index.ts, routes/v1/index.ts |
| 2 | Portal assets page (PRTL-05) | a365c78 | portal/assets/page.tsx |

## What Was Built

### Asset Service (`apps/api/src/services/asset.service.ts`)

- `ASSET_TRANSITIONS` map enforces status lifecycle: `IN_STOCK → DEPLOYED/IN_REPAIR/DISPOSED`, `DEPLOYED → IN_REPAIR/RETIRED`, `IN_REPAIR → DEPLOYED/RETIRED`, `RETIRED → DISPOSED`, `DISPOSED → []` (terminal)
- `createAsset`: uses `$transaction` with `$queryRaw FOR UPDATE` lock on assets table for atomic sequential assetTag generation (format: `AST-00001`)
- `listAssets`: paginated (default page=1, pageSize=25), filters by status, assignedToId, siteId; full-text search across assetTag/serialNumber/hostname/manufacturer/model
- `updateAsset`: validates status transitions before applying; throws `Error('Invalid status transition from X to Y')` for invalid moves
- `deleteAsset`: soft-deletes (DISPOSED) when asset has changeAssets/applicationAssets/cmdbConfigItems/contractAssets references; hard-deletes otherwise

### Asset Routes (`apps/api/src/routes/v1/assets/index.ts`)

- `POST /api/v1/assets` — `assets.create` permission, returns 201
- `GET /api/v1/assets` — `assets.read` permission, supports all list filters, resolves `assignedToId=me` to JWT userId
- `GET /api/v1/assets/:id` — `assets.read` permission, 404 when not found
- `PUT /api/v1/assets/:id` — `assets.update` permission, 422 on invalid status transition
- `DELETE /api/v1/assets/:id` — `assets.delete` permission

Registered in `apps/api/src/routes/v1/index.ts` via `await app.register(assetRoutes)`.

### Portal Assets Page (`apps/web/src/app/portal/assets/page.tsx`)

- Replaced DEFERRED placeholder entirely — no "Coming soon" text remains
- TanStack `useQuery` fetches `GET /api/v1/assets?assignedToId=me`
- Asset cards: assetTag (monospace bold), manufacturer+model, status badge (green=DEPLOYED, blue=IN_STOCK, yellow=IN_REPAIR, gray=RETIRED, red=DISPOSED), hostname, warrantyExpiry
- Icon selection based on manufacturer hint (laptop/server/monitor/desktop fallback)
- States: 3-card skeleton loading, error banner, empty state (preserved original design), card list with count

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `apps/api/src/services/asset.service.ts` exists and contains ASSET_TRANSITIONS, FOR UPDATE, AST- format
- [x] `apps/api/src/routes/v1/assets/index.ts` exists with assets.create/read/update/delete permissions
- [x] `apps/api/src/routes/v1/index.ts` imports and registers assetRoutes
- [x] `apps/web/src/app/portal/assets/page.tsx` uses useQuery, fetches api/v1/assets, shows assetTag, 0 DEFERRED occurrences
- [x] Commits a05d5a6 and a365c78 exist

## Self-Check: PASSED
