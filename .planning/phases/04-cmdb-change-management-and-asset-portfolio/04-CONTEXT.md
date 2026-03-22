# Phase 4: CMDB, Change Management, and Asset Portfolio - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Track physical assets with lifecycle management, build a CMDB with CI relationship maps and impact analysis, implement change management with full approval workflows and CAB review, and create an application portfolio with dependency mapping. Also completes PRTL-05 (portal assets) and REPT-05 (CMDB reports) deferred from Phase 3.

</domain>

<decisions>
## Implementation Decisions

### CMDB Relationship Visualization
- ReactFlow for CI relationship map with hierarchical top-down layout (tree-like, selected CI at top, dependencies flowing down)
- Impact analysis: colored overlay on the same map — affected CIs glow red/orange, unaffected ones dim. Click for details of each affected CI
- CI nodes show: CI type icon (server, workstation, network device etc.) with colored border indicating status (green=active, yellow=maintenance, gray=inactive)
- Default traversal depth: 2 levels (direct relationships + one level deeper). User can click "expand" on any node to load more. Prevents overwhelming graphs for large CMDBs
- CMDB permissions enforced: CMDB_VIEW, CMDB_EDIT, CMDB_DELETE, CMDB_IMPORT

### Change Approval Workflow UX
- Inline approve/reject on change detail page — approval panel at top showing pending action. Approve/Reject buttons with required comment on reject. No separate approval page
- CAB meeting detail page with: agenda (linked changes in display order), attendee list with RSVP status, meeting URL, iCal download button. Each change on agenda has approve/reject/defer voting buttons
- Change calendar: month view with day cells showing change bars spanning scheduled windows. Color by risk level (green=low, yellow=medium, red=high). Click to see change detail
- Emergency changes: red "EMERGENCY" badge everywhere, skip CAB scheduling, go straight to approval. Simplified form (no scheduling dates, no implementation plan required)
- Standard pre-approved changes: skip approval chain entirely, auto-approve
- Notification dispatch (from Phase 3) reused for approval requests, CAB invitations, change status updates

### Application Dependency Diagrams
- Same ReactFlow library as CMDB, different node style (app icon, criticality badge, status indicator). Consistent zoom/pan controls across CMDB and App portfolio
- Portfolio dashboard layout: top stat cards (total apps, critical apps, deprecated count) → middle interactive dependency graph → bottom criticality/status matrix table

### CMDB Bulk Import
- 3-step wizard: upload (drag-drop) → map columns (auto-detect common names) → preview first 10 rows with validation errors highlighted → confirm
- Row-level error handling: each row validated independently. Bad rows flagged with specific error (missing field, invalid type, duplicate ciNumber). Good rows imported. Summary shows success/skip/error counts with downloadable error report
- Supports CSV and JSON formats

### Asset Management (Claude's Discretion)
- Asset CRUD page layout, status lifecycle visualization
- Purchase tracking and warranty display
- User/site assignment UI

### CMDB Reconciliation (Claude's Discretion)
- Agent auto-discovery reconciliation worker logic (already stubbed)
- Diff presentation for agent data vs CMDB records
- Stale CI marking strategy

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Full Application Specification
- `DOCUMENTATION .md` — Complete spec with all data models, API endpoints, CMDB relationship types (DEPENDS_ON, HOSTS, CONNECTS_TO, RUNS_ON, BACKS_UP, VIRTUALIZES, MEMBER_OF), CI types, change statuses, asset statuses, application types

### Database Schema
- `packages/db/prisma/schema.prisma` — All models: Asset, CmdbConfigurationItem, CmdbRelationship, CmdbChangeRecord, Change, ChangeApproval, CABMeeting, CABAttendee, CABChangeItem, Application, ApplicationDependency, ApplicationDocument, ApplicationAsset

### Existing API Patterns
- `apps/api/src/server.ts` — Route registration in protected scope
- `apps/api/src/plugins/rbac.ts` — `requirePermission()` for CMDB_VIEW, CMDB_EDIT, etc.
- `apps/api/src/services/ticket.service.ts` — Transactional service pattern with audit trail
- `apps/api/src/services/notification.service.ts` — Fire-and-forget notification dispatch pattern
- `apps/api/src/services/storage.service.ts` — MinIO upload/presigned URL pattern

### Existing Worker Patterns
- `apps/worker/src/workers/cmdb-reconciliation.ts` — CMDB reconciliation stub (Phase 4 implements real logic)

### Phase 3 Deferred Items
- `apps/web/src/app/portal/assets/page.tsx` — PRTL-05 placeholder with `DEFERRED TO PHASE 4` comment
- `apps/api/src/routes/v1/reports/index.ts` — REPT-05 CMDB reports stub with `DEFERRED TO PHASE 4` comment

### Frontend Patterns
- `apps/web/src/app/dashboard/tickets/page.tsx` — Reference for list page with filters
- `apps/web/src/app/dashboard/settings/sla/page.tsx` — Reference for admin CRUD page
- `apps/web/src/app/dashboard/reports/page.tsx` — Recharts integration pattern

### Project Instructions
- `CLAUDE.md` — Critical design rules, icon usage, API patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `notification.service.ts`: Fire-and-forget notification dispatch — reuse for change approval notifications, CAB invitations
- `storage.service.ts`: MinIO upload + presigned URLs — reuse for change document attachments, application documents
- `requirePermission()`: RBAC enforcement — CMDB has its own permissions (CMDB_VIEW, CMDB_EDIT, CMDB_DELETE, CMDB_IMPORT)
- `planGate()`: Plan enforcement for resource-creating endpoints
- Dashboard layout pattern: sidebar + header + main content area, consistent across all pages

### Established Patterns
- Fastify route modules registered via v1 index
- Transactional sequential numbering (ticket pattern — reuse for changeNumber, ciNumber, assetTag)
- Audit trail via activity tables (TicketActivity pattern — CmdbChangeRecord follows same)
- BullMQ worker with cron repeatable jobs (SLA monitor, email polling patterns)

### Integration Points
- `apps/api/src/routes/v1/index.ts`: Register new asset, cmdb, change, application route modules
- `apps/worker/src/workers/cmdb-reconciliation.ts`: Stub to replace with real logic
- `apps/web/src/app/dashboard/`: New pages for assets, cmdb, changes, applications
- `apps/web/src/app/portal/assets/page.tsx`: Replace placeholder with real asset list
- TICK-11 (ticket links to CIs): Already implemented in ticket.service.ts — verify CI linking works

</code_context>

<specifics>
## Specific Ideas

- ReactFlow shared across CMDB and App portfolio — consistent graph experience
- Impact analysis should feel immediate and visual — colored overlay, not a separate page
- CAB meetings should feel like a real meeting tool — agenda ordering, RSVP, iCal
- Emergency changes need to feel urgent — red badge, simplified form, fast routing
- Import wizard should handle real-world messy data gracefully — skip bad rows, report errors

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-cmdb-change-management-and-asset-portfolio*
*Context gathered: 2026-03-22*
