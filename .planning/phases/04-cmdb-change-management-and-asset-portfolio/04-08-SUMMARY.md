---
phase: 04-cmdb-change-management-and-asset-portfolio
plan: 08
subsystem: frontend
tags: [cmdb, import, applications, reactflow, wizard, portfolio]
dependency_graph:
  requires: [04-05, 04-06]
  provides: [cmdb-import-ui, app-portfolio-ui]
  affects: [apps/web]
tech_stack:
  added: [papaparse, @xyflow/react, @dagrejs/dagre, @types/papaparse, @types/dagre]
  patterns: [3-step-wizard, reactflow-dagre-layout, tanstack-query, custom-flow-nodes]
key_files:
  created:
    - apps/web/src/app/dashboard/cmdb/import/page.tsx
    - apps/web/src/app/dashboard/applications/page.tsx
    - apps/web/src/app/dashboard/applications/[id]/page.tsx
  modified:
    - apps/web/package.json
decisions:
  - papaparse worker: false enforced per RESEARCH.md pitfall 3 (Next.js Worker scope issue)
  - ReactFlow installed in 04-08 (04-07 not yet executed) - same packages 04-07 would install
  - Dagre LR (left-to-right) layout for app dependency chains vs TB for CMDB per CONTEXT.md
metrics:
  duration: ~7 min
  completed: 2026-03-22
  tasks_completed: 2
  files_changed: 4
---

# Phase 04 Plan 08: CMDB Import Wizard and Application Portfolio Summary

**One-liner:** 3-step CMDB bulk import wizard with papaparse CSV parsing plus ReactFlow application dependency diagram and portfolio dashboard.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | CMDB bulk import wizard | a47f615 | apps/web/src/app/dashboard/cmdb/import/page.tsx, apps/web/package.json, pnpm-lock.yaml |
| 2 | Application portfolio dashboard and detail pages | 5c69b8d | apps/web/src/app/dashboard/applications/page.tsx, apps/web/src/app/dashboard/applications/[id]/page.tsx |

## What Was Built

### Task 1: CMDB Bulk Import Wizard

A 5-state wizard (`UPLOAD -> MAP -> PREVIEW -> IMPORTING -> COMPLETE`) at `/dashboard/cmdb/import`:

- **Step 1 - Upload:** Drag-and-drop zone plus file input button. Accepts `.csv` and `.json`. CSV parsed via papaparse with `worker: false` (RESEARCH.md pitfall 3 — Next.js prohibits Web Workers in the browser bundle). JSON parsed via `FileReader`. First 15 rows stored as preview, all rows as full data.
- **Step 2 - Column Mapping:** Auto-maps common column names to CI fields (name, type, status, environment, ip, os, manufacturer, model, etc.). Dropdown per column to override or skip. Warns if `name` is not mapped (required).
- **Step 3 - Preview + Validation:** Shows first 10 rows in a table with mapped headers. Invalid cells highlighted red with specific error messages (missing name, invalid type/status/environment enum). Summary badges show valid/invalid counts and total valid rows to be imported.
- **Step 4 - Importing:** Spinner with progress message. POSTs to `/api/v1/cmdb/import` with `{ rows: validMappedRows, columnMap }`.
- **Step 5 - Complete:** Shows imported/skipped/errors summary cards. If errors exist, provides a JSON blob download link for the error report. "Import More" and "View CIs" actions.

### Task 2: Application Portfolio Dashboard

Page at `/dashboard/applications` with the CONTEXT.md locked layout:

**Top - Stat Cards (4):** Total Applications, Critical Applications, Deprecated/Decommissioned, Total Annual Cost (formatted as $K/$M). Loaded from `/api/v1/applications/stats`.

**Middle - Dependency Graph:** ReactFlow with `ReactFlowProvider`. Custom `AppFlowNode` component shows: mdiApplicationCog icon, app name, criticality badge (red/orange/yellow/green), status dot (green/blue/gray). Layout via `@dagrejs/dagre` in `LR` direction (left-to-right for dependency chains per CONTEXT.md differentiation from CMDB's TB layout). Clicking a node navigates to the app detail page. Data from `/api/v1/applications/graph`.

**Bottom - Matrix Table:** Fetches `/api/v1/applications?pageSize=100`. Columns: name, type, status badge, criticality badge, hosting model, lifecycle stage, annual cost. Filters: type, status, criticality dropdowns. Sort by criticality/status/name.

### Task 2: Application Detail Page

Page at `/dashboard/applications/[id]` with 5 sections:

1. **Details Card:** All application fields — description, hosting model, auth method, data classification, annual cost, RPO/RTO (formatted as hours), lifecycle stage, strategic rating, tech stack chips.
2. **Dependencies:** Two-column layout showing "Depends On" (outgoing) and "Depended On By" (incoming) with criticality dots, dependency type badges, and navigation links.
3. **Documents:** Lists 11 document types with clickable URL links. Inline "Add Document" form with title, type dropdown (11 options), URL, description.
4. **Assets:** Linked assets with relationship type badge and primary indicator.
5. **Activity Trail:** Timeline with actor, activity type badge, description, and time-ago display.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| papaparse `worker: false` | Next.js app dir cannot spawn Web Workers from client components — RESEARCH.md pitfall 3 |
| ReactFlow installed in 04-08 | Plan 04-07 (which normally installs @xyflow/react) had not been executed; installed same packages proactively |
| Dagre LR layout for app graph | LR (left-to-right) suits dependency chains; CMDB uses TB (top-down) for CI hierarchy — different semantics per CONTEXT.md |
| 5-state wizard (not 3) | Plan spec describes UPLOAD/MAP/PREVIEW/CONFIRM; IMPORTING and COMPLETE added for UX clarity without changing the 3 logical steps |

## Deviations from Plan

None - plan executed exactly as written. ReactFlow installation (nominally from 04-07) handled proactively since 04-07 had not yet run.

## Self-Check: PASSED

All 3 files verified to exist on disk. Both task commits (a47f615, 5c69b8d) verified in git history.
