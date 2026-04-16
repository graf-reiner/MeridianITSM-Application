# Phase 4: CMDB, Change Management, and Asset Portfolio - Research

**Researched:** 2026-03-22
**Domain:** CMDB graph visualization, change state machine, iCal generation, CSV bulk import, PostgreSQL graph traversal
**Confidence:** HIGH

## Summary

Phase 4 is the most complex phase in the roadmap, spanning four distinct sub-domains: asset lifecycle management, CMDB with graph visualization and bulk import, change management with a 10-state machine and CAB workflows, and application portfolio with dependency diagrams. All database models and enums are already defined in the Prisma schema — no schema migrations are needed. The worker stub for CMDB reconciliation is in place and ready to be filled in.

The primary technical challenge is ReactFlow integration for two different graph use cases (CMDB CI relationship map with impact analysis overlay, and app dependency diagram). ReactFlow v12 (`@xyflow/react` package) is the current stable release and supports React 19. Layout should use `@dagrejs/dagre` for hierarchical tree-style positioning. PostgreSQL recursive CTEs handle impact traversal on the backend, keeping graph computation server-side where it belongs.

The change management state machine has type-dependent rules: STANDARD changes auto-approve, EMERGENCY changes skip CAB and use abbreviated workflow, NORMAL changes follow the full approval chain. Sequential numbering for changeNumber, ciNumber, and assetTag follows the existing `FOR UPDATE` locking pattern from ticket.service.ts.

**Primary recommendation:** Use `@xyflow/react` 12.10.1 for both graph views, `@dagrejs/dagre` 2.0.4 for layout, `ical-generator` 10.1.0 for CAB iCal, and `papaparse` 5.5.3 for CSV import. All other logic (state machines, reconciliation, audit trail) reuses established project patterns.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CMDB Relationship Visualization**
- ReactFlow for CI relationship map with hierarchical top-down layout (tree-like, selected CI at top, dependencies flowing down)
- Impact analysis: colored overlay on the same map — affected CIs glow red/orange, unaffected ones dim. Click for details of each affected CI
- CI nodes show: CI type icon (server, workstation, network device etc.) with colored border indicating status (green=active, yellow=maintenance, gray=inactive)
- Default traversal depth: 2 levels (direct relationships + one level deeper). User can click "expand" on any node to load more. Prevents overwhelming graphs for large CMDBs
- CMDB permissions enforced: CMDB_VIEW, CMDB_EDIT, CMDB_DELETE, CMDB_IMPORT

**Change Approval Workflow UX**
- Inline approve/reject on change detail page — approval panel at top showing pending action. Approve/Reject buttons with required comment on reject. No separate approval page
- CAB meeting detail page with: agenda (linked changes in display order), attendee list with RSVP status, meeting URL, iCal download button. Each change on agenda has approve/reject/defer voting buttons
- Change calendar: month view with day cells showing change bars spanning scheduled windows. Color by risk level (green=low, yellow=medium, red=high). Click to see change detail
- Emergency changes: red "EMERGENCY" badge everywhere, skip CAB scheduling, go straight to approval. Simplified form (no scheduling dates, no implementation plan required)
- Standard pre-approved changes: skip approval chain entirely, auto-approve
- Notification dispatch (from Phase 3) reused for approval requests, CAB invitations, change status updates

**Application Dependency Diagrams**
- Same ReactFlow library as CMDB, different node style (app icon, criticality badge, status indicator). Consistent zoom/pan controls across CMDB and App portfolio
- Portfolio dashboard layout: top stat cards (total apps, critical apps, deprecated count) → middle interactive dependency graph → bottom criticality/status matrix table

**CMDB Bulk Import**
- 3-step wizard: upload (drag-drop) → map columns (auto-detect common names) → preview first 10 rows with validation errors highlighted → confirm
- Row-level error handling: each row validated independently. Bad rows flagged with specific error (missing field, invalid type, duplicate ciNumber). Good rows imported. Summary shows success/skip/error counts with downloadable error report
- Supports CSV and JSON formats

### Claude's Discretion
- Asset CRUD page layout, status lifecycle visualization
- Purchase tracking and warranty display
- User/site assignment UI
- Agent auto-discovery reconciliation worker logic (already stubbed)
- Diff presentation for agent data vs CMDB records
- Stale CI marking strategy

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ASST-01 | Asset CRUD with assetTag, serialNumber, manufacturer, model, status lifecycle | Asset model fully defined in schema; sequential assetTag via FOR UPDATE lock pattern |
| ASST-02 | Asset status: IN_STOCK → DEPLOYED → IN_REPAIR → RETIRED → DISPOSED | AssetStatus enum defined; explicit transition guard in service layer |
| ASST-03 | Asset assignment to users and sites | assignedToId + siteId on Asset model; existing Site + User relations |
| ASST-04 | Asset fields populated from inventory agent data | Agent → InventorySnapshot → Asset upsert; fields mapped in reconciliation worker |
| ASST-05 | Asset purchase tracking (date, cost, warranty) | purchaseDate, purchaseCost, warrantyExpiry on Asset model |
| CMDB-01 | CI CRUD with ciNumber, type, status, environment, flexible attributesJson | CmdbConfigurationItem fully modeled; ciNumber uses FOR UPDATE sequential lock |
| CMDB-02 | CI types: SERVER, WORKSTATION, NETWORK_DEVICE, SOFTWARE, SERVICE, DATABASE, VIRTUAL_MACHINE, CONTAINER, OTHER | CmdbCiType enum defined |
| CMDB-03 | CI relationships: DEPENDS_ON, HOSTS, CONNECTS_TO, RUNS_ON, BACKS_UP, VIRTUALIZES, MEMBER_OF | CmdbRelationshipType enum + CmdbRelationship model defined |
| CMDB-04 | Impact analysis: traverse CI relationship graph | PostgreSQL recursive CTE on cmdb_relationships table; tenantId-scoped |
| CMDB-05 | CI change history: every attribute change logged | CmdbChangeRecord model with changedBy (USER/AGENT/IMPORT) and fieldName/oldValue/newValue |
| CMDB-06 | CI linkable to tickets | CmdbTicketLink model with AFFECTED/RELATED/CAUSED_BY; linkCmdbItem() already in ticket.service |
| CMDB-07 | CI linkable to assets | assetId FK on CmdbConfigurationItem |
| CMDB-08 | CI linkable to agents | agentId FK on CmdbConfigurationItem |
| CMDB-09 | CMDB relationship map visualization (ReactFlow) | @xyflow/react 12.10.1; @dagrejs/dagre 2.0.4 for layout |
| CMDB-10 | Bulk import CIs from CSV/JSON via import wizard | papaparse 5.5.3 for CSV parsing; 3-step wizard per CONTEXT.md |
| CMDB-11 | CMDB categories with hierarchical taxonomy | CmdbCategory model with parentId self-relation; cycle detection needed (raw SQL) |
| CMDB-12 | Agent auto-discovery reconciliation: diff vs CMDB, upsert CIs, log changes | cmdb-reconciliation.ts stub + InventorySnapshot payloads; diff + upsert in transaction |
| CMDB-13 | Background worker reconciles every 15 minutes, marks stale CIs inactive | CMDB_RECONCILIATION queue already defined; repeatable cron job pattern |
| CMDB-14 | CMDB permissions: CMDB_VIEW, CMDB_EDIT, CMDB_DELETE, CMDB_IMPORT | requirePermission() plugin ready; permission constants need adding to permissions.ts |
| CHNG-01 | Change request CRUD with changeNumber, type (STANDARD/NORMAL/EMERGENCY), risk level | Change model fully defined; changeNumber via FOR UPDATE sequential lock |
| CHNG-02 | 10-state change status machine | ChangeStatus enum has 10 values; type-dependent transition rules in service |
| CHNG-03 | Change approval workflow with sequenced approvers | ChangeApproval model with sequenceOrder; PENDING/APPROVED/REJECTED/CANCELLED states |
| CHNG-04 | Implementation plan, backout plan, testing plan fields | implementationPlan, backoutPlan, testingPlan on Change model |
| CHNG-05 | Change scheduling with collision detection | scheduledStart/scheduledEnd; overlap query in service |
| CHNG-06 | Automated risk assessment scoring | Scoring function based on change attributes (type, affected CIs, past incidents) |
| CHNG-07 | Change linkable to assets and applications | ChangeAsset + ChangeApplication junction models defined |
| CHNG-08 | Change activity audit trail | ChangeActivity model; same pattern as TicketActivity |
| CHNG-09 | Change calendar view | Month view in frontend; changes with scheduledStart/End as date-range bars |
| CAB-01 | CAB meeting CRUD with scheduling, location, meeting URL, duration | CABMeeting model fully defined |
| CAB-02 | CAB attendees with roles and RSVP status | CABMeetingAttendee with CABAttendeeRole + RSVPStatus enums |
| CAB-03 | Link changes to meetings with agenda order and outcome | CABMeetingChange with agendaOrder + CABOutcome |
| CAB-04 | iCal download and email invitation sending | ical-generator 10.1.0; email via existing notification.service dispatch |
| CAB-05 | Meeting outcome per change: APPROVED/REJECTED/DEFERRED/NEEDS_MORE_INFO | CABOutcome enum on CABMeetingChange |
| APP-01 | Application CRUD with type, status, criticality, hosting model, tech stack | Application model fully defined; 9 ApplicationType values, 5 ApplicationStatus values |
| APP-02 | Application dependency mapping | ApplicationDependency model; DependencyType enum (7 types) |
| APP-03 | Application document management (11 document types with URLs) | ApplicationDocument model; DocumentType enum (need to verify 11 values in schema) |
| APP-04 | Application-to-asset relationships | ApplicationAsset model with AppAssetRelationship type |
| APP-05 | Application portfolio dashboard with summary statistics | Stat cards + table; Recharts for any charts; same pattern as reports page |
| APP-06 | Visual dependency diagram | ReactFlow (same install as CMDB-09); different node style |
| PRTL-05 | End users can view their assigned assets | GET /api/v1/assets?assignedToId=me; replace placeholder in portal/assets/page.tsx |
| REPT-05 | CMDB inventory and relationship reports | Replace stub in reports/index.ts; CSV/JSON export of CI inventory and relationships |
</phase_requirements>

---

## Standard Stack

### Core (new installs required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@xyflow/react` | 12.10.1 | CMDB relationship map + App dependency diagram | Current React Flow package; peer dep react >=17; supports React 19 |
| `@dagrejs/dagre` | 2.0.4 | Hierarchical (top-down tree) layout for ReactFlow | Active fork of dagre; used by ReactFlow docs examples for DAG layouts |
| `ical-generator` | 10.1.0 | Generate `.ics` calendar files for CAB meeting invitations | Actively maintained; Node 20+; simple ICalCalendar/ICalEvent API |
| `papaparse` | 5.5.3 | CSV parsing for CMDB bulk import wizard | Browser + Node; streaming support; header detection; error row reporting |

### Already Installed (reuse)

| Library | Version | Purpose |
|---------|---------|---------|
| `recharts` | ^3.8.0 | Charts on portfolio dashboard and CMDB reports |
| `react-hook-form` + `zod` | latest | Change/CI/Asset forms |
| `@tanstack/react-query` | ^5.91.3 | Data fetching on all new pages |
| `@mdi/react` + `@mdi/js` | installed | Icons for CI types, change status badges |
| `csv-stringify` | ^6.7.0 (API) | Already in API for report CSV export — reuse for REPT-05 |

### Supporting (API side)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/papaparse` | latest | TypeScript types for papaparse | If using papaparse in API/worker; may only need in web |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@xyflow/react` | `reactflow` (old package) | `reactflow` is v11 legacy; `@xyflow/react` is v12 current — always use new package |
| `@dagrejs/dagre` | `elkjs` | ELK produces better large-graph layouts but requires WASM worker setup; dagre is simpler for tree layouts at ITSM scale |
| `ical-generator` | `ical.js` | `ical.js` focuses on parsing (not generation); `ical-generator` is the generation-first library |
| `papaparse` | `csv-parse` (Node) | Both valid; papaparse runs in browser for client-side preview step in wizard; csv-parse is Node-only |

**Installation (web app):**
```bash
pnpm --filter web add @xyflow/react @dagrejs/dagre papaparse
pnpm --filter web add -D @types/papaparse @types/dagre
```

**Installation (API app — ical-generator for CAB invitations):**
```bash
pnpm --filter api add ical-generator
```

**Version verification:** Verified 2026-03-22 via `npm view`:
- `@xyflow/react`: 12.10.1 (latest)
- `@dagrejs/dagre`: 2.0.4 (latest)
- `ical-generator`: 10.1.0 (latest)
- `papaparse`: 5.5.3 (latest)

---

## Architecture Patterns

### Recommended Project Structure (new files)

```
apps/api/src/
├── routes/v1/
│   ├── assets/index.ts          # ASST-01 through ASST-05
│   ├── cmdb/index.ts            # CMDB-01 through CMDB-11, CMDB-14
│   ├── changes/index.ts         # CHNG-01 through CHNG-09
│   ├── cab/index.ts             # CAB-01 through CAB-05
│   └── applications/index.ts    # APP-01 through APP-06
├── services/
│   ├── asset.service.ts         # Asset CRUD + lifecycle
│   ├── cmdb.service.ts          # CI CRUD + impact analysis CTE + category hierarchy
│   ├── cmdb-import.service.ts   # Bulk import validation + upsert logic
│   ├── change.service.ts        # Change state machine + approval workflow + collision detection
│   ├── cab.service.ts           # CAB meeting + iCal generation + RSVP
│   └── application.service.ts   # App CRUD + dependency management

apps/worker/src/workers/
└── cmdb-reconciliation.ts       # Replace stub with real diff/upsert logic (CMDB-12, CMDB-13)

apps/web/src/app/dashboard/
├── assets/
│   ├── page.tsx                 # Asset list with filters (ASST-01)
│   └── [id]/page.tsx            # Asset detail + lifecycle + assignment
├── cmdb/
│   ├── page.tsx                 # CI list with filters + bulk import trigger
│   ├── [id]/page.tsx            # CI detail + relationship map + change history
│   └── import/page.tsx          # 3-step import wizard (CMDB-10)
├── changes/
│   ├── page.tsx                 # Change list + calendar toggle
│   ├── calendar/page.tsx        # Month calendar view (CHNG-09)
│   ├── new/page.tsx             # New change form (type-dependent fields)
│   └── [id]/page.tsx            # Change detail + inline approval panel
├── cab/
│   ├── page.tsx                 # CAB meeting list
│   └── [id]/page.tsx            # Meeting detail + agenda + RSVP + iCal download
└── applications/
    ├── page.tsx                 # Portfolio dashboard (APP-05) + dependency graph (APP-06)
    └── [id]/page.tsx            # App detail + assets + documents

apps/web/src/app/portal/
└── assets/page.tsx              # Replace DEFERRED placeholder (PRTL-05)
```

### Pattern 1: Sequential Number Generation (FOR UPDATE lock)

Reuse the exact pattern from `ticket.service.ts` for `changeNumber`, `ciNumber`, and `assetTag`.

```typescript
// Source: apps/api/src/services/ticket.service.ts (established pattern)
const result = await tx.$queryRaw<[{ next: bigint }]>`
  SELECT COALESCE(MAX("changeNumber"), 0) + 1 AS next
  FROM changes
  WHERE "tenantId" = ${tenantId}::uuid
  FOR UPDATE
`;
const changeNumber = Number(result[0].next);
```

Apply the same for `ciNumber` (on `cmdb_configuration_items`) and `assetTag` (numeric suffix on `assets`).

### Pattern 2: Change State Machine (type-dependent transitions)

```typescript
// Source: project design — CHNG-02 requirements
// 10 states with type-dependent entry points
const ALLOWED_TRANSITIONS: Record<ChangeStatus, ChangeStatus[]> = {
  NEW:              ['ASSESSMENT', 'CANCELLED'],
  ASSESSMENT:       ['APPROVAL_PENDING', 'CANCELLED'],
  APPROVAL_PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED:         ['SCHEDULED', 'CANCELLED'],
  REJECTED:         [],                               // terminal
  SCHEDULED:        ['IMPLEMENTING', 'CANCELLED'],
  IMPLEMENTING:     ['REVIEW'],
  REVIEW:           ['COMPLETED', 'IMPLEMENTING'],    // reopen for rework
  COMPLETED:        [],                               // terminal
  CANCELLED:        [],                               // terminal
};

// Type-dependent shortcuts
function getInitialStatus(type: ChangeType): ChangeStatus {
  if (type === 'STANDARD') return 'APPROVED';   // skip approval chain
  if (type === 'EMERGENCY') return 'APPROVAL_PENDING'; // skip CAB, fast-track
  return 'NEW'; // NORMAL follows full lifecycle
}
```

### Pattern 3: PostgreSQL Recursive CTE for Impact Analysis

Used for CMDB-04. Keeps graph traversal server-side. Traverses `cmdb_relationships` with optional depth limit.

```typescript
// Source: project design — CMDB-04 + PostgreSQL docs
// Finds all CIs reachable from a root CI via relationships, up to maxDepth hops
// tenantId scoping is critical — add to BOTH anchor and recursive parts
const impactedCIs = await prisma.$queryRaw<ImpactedCI[]>`
  WITH RECURSIVE impact_graph AS (
    -- Anchor: direct relationships from root CI
    SELECT
      r."targetId" AS "ciId",
      1 AS depth,
      r."relationshipType",
      ARRAY[${rootCiId}::uuid, r."targetId"] AS path
    FROM cmdb_relationships r
    WHERE r."sourceId" = ${rootCiId}::uuid
      AND r."tenantId" = ${tenantId}::uuid

    UNION ALL

    -- Recursive: traverse one more level
    SELECT
      r."targetId",
      ig.depth + 1,
      r."relationshipType",
      ig.path || r."targetId"
    FROM cmdb_relationships r
    INNER JOIN impact_graph ig ON r."sourceId" = ig."ciId"
    WHERE r."tenantId" = ${tenantId}::uuid
      AND ig.depth < ${maxDepth}
      AND NOT (r."targetId" = ANY(ig.path))  -- prevent cycles
  )
  SELECT DISTINCT ON ("ciId") * FROM impact_graph
  ORDER BY "ciId", depth
`;
```

**Depth default:** 2 (per CONTEXT.md decision). API accepts `?depth=N` up to max 5.

### Pattern 4: ReactFlow Graph Component (CMDB relationship map)

ReactFlow must be rendered in a client component. Layout computed once when data loads; re-run on "expand node" events.

```typescript
// Source: @xyflow/react docs — hierarchical layout with dagre
// In: apps/web/src/app/dashboard/cmdb/[id]/page.tsx (or sub-component)
'use client';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

function applyDagreLayout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: 160, height: 60 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 80, y: pos.y - 30 } };
  });
}
```

**Impact analysis overlay:** Add `data.impacted: boolean` to each node; custom node renderer applies red border + glow classname when `data.impacted === true` and dims others with `opacity: 0.3`.

### Pattern 5: iCal Generation for CAB Meetings

```typescript
// Source: ical-generator npm package docs
// In: apps/api/src/services/cab.service.ts
import ical from 'ical-generator';

export function generateCabMeetingIcal(meeting: CABMeeting, attendeeEmails: string[]): string {
  const cal = ical({ name: 'MeridianITSM - CAB Meeting' });
  cal.createEvent({
    start: meeting.scheduledFor,
    end: new Date(meeting.scheduledFor.getTime() + meeting.durationMinutes * 60_000),
    summary: meeting.title,
    location: meeting.location ?? undefined,
    url: meeting.meetingUrl ?? undefined,
    description: `CAB Meeting\n\nAgenda items: ${meeting.changes.length} changes pending review`,
    attendees: attendeeEmails.map((email) => ({ email, rsvp: true })),
  });
  return cal.toString();
}
// API route returns: Content-Type: text/calendar; Content-Disposition: attachment; filename="cab-meeting.ics"
```

### Pattern 6: CSV Bulk Import Wizard (papaparse)

```typescript
// Source: papaparse docs — browser streaming parse with header detection
// Step 1 (upload): papaparse.parse(file, { header: true, preview: 15, ... })
// Step 2 (column mapping): present detected headers, auto-map known names
// Step 3 (validate + import): POST to /api/v1/cmdb/import with JSON body
//   { rows: ValidatedRow[], columnMap: ColumnMapping }

// Auto-detect common CI field names:
const AUTO_MAP: Record<string, string> = {
  'name': 'name', 'ci_name': 'name', 'ci name': 'name',
  'type': 'type', 'ci_type': 'type',
  'status': 'status',
  'environment': 'environment', 'env': 'environment',
  'ip': 'attributesJson.ipAddress', 'ip_address': 'attributesJson.ipAddress',
};
```

**Import API endpoint:** `POST /api/v1/cmdb/import` — requires `CMDB_IMPORT` permission. Validates each row independently, upserts by `ciNumber` (if provided) or creates new. Returns `{ imported: N, skipped: N, errors: Row[] }`.

### Pattern 7: CMDB Reconciliation Worker (replacing stub)

```typescript
// Source: apps/worker/src/workers/cmdb-reconciliation.ts (to replace stub)
// Job data: { tenantId, agentId, inventorySnapshotId }
// Logic:
// 1. Load latest InventorySnapshot for agentId
// 2. Find existing CI with agentId FK (if any)
// 3. Diff: if no CI → create with changedBy=AGENT
//          if CI exists → compare attributesJson fields → log changed fields to CmdbChangeRecord
// 4. Mark stale: CIs with agentId set where lastSeenAt > 24h ago → set status=INACTIVE
// 5. All writes in single Prisma transaction, scoped by tenantId
```

**Stale marking strategy:** A CI is "stale" if `agentId` is set (agent-managed) AND `lastSeenAt < now() - 24h`. Status transitions from ACTIVE → INACTIVE automatically. Operator reviews in UI.

### Pattern 8: Notification Reuse for Change Events

```typescript
// Source: apps/api/src/services/notification.service.ts (existing)
// Fire-and-forget pattern established in Phase 3 — reuse exactly as-is
void (async () => {
  try {
    await dispatchNotification({
      tenantId,
      userId: approver.id,
      type: 'CHANGE_APPROVAL',           // NotificationType enum value
      title: `Change #${change.changeNumber} requires your approval`,
      resourceId: change.id,
      resource: 'change',
    });
  } catch (err) {
    console.error('[change.service] notification dispatch failed', err);
  }
})();
```

NotificationType enum already includes `CHANGE_APPROVAL`, `CHANGE_UPDATED`, and `CAB_INVITATION`.

### Pattern 9: Audit Trail (ChangeActivity)

```typescript
// Source: TicketActivity pattern from Phase 3 — reuse for ChangeActivity
// activityType values: 'CREATED', 'STATUS_CHANGED', 'APPROVED', 'REJECTED',
//   'APPROVER_ADDED', 'SCHEDULED', 'FIELD_CHANGED', 'CAB_LINKED', 'ASSET_LINKED'
await tx.changeActivity.create({
  data: {
    tenantId,
    changeId: change.id,
    actorId,
    activityType: 'STATUS_CHANGED',
    fieldName: 'status',
    oldValue: oldStatus,
    newValue: newStatus,
  },
});
```

### Anti-Patterns to Avoid

- **Unscoped CTE queries:** Every CTE anchor AND recursive part must filter `tenantId` — missing it on the recursive step leaks cross-tenant data.
- **Graph cycles without path guard:** The recursive CTE must include `NOT (targetId = ANY(path))` to prevent infinite loops on circular CI relationships.
- **ReactFlow in Server Components:** `@xyflow/react` uses browser APIs. Always in `'use client'` components. Pass graph data as props from server or fetch via TanStack Query.
- **Re-running dagre on every render:** Compute layout only when nodes/edges data changes (useMemo or useEffect with dependency array).
- **iCal in web app:** Generate `.ics` server-side in the API (Node environment). Return as download endpoint. Do not run ical-generator in Next.js client components.
- **CMDB permissions on wrong scope:** CMDB routes use their own permission constants (CMDB_VIEW etc.), not the generic admin permission. Do not reuse `requirePermission('admin')`.
- **Direct state transitions skipping sequence:** Always validate against ALLOWED_TRANSITIONS map before persisting status change. Return 409 Conflict for invalid transitions.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph layout positioning | Manual x/y coordinate calculation | `@dagrejs/dagre` | Layout algorithms are NP-hard; dagre handles edge crossing minimization |
| Calendar file generation | String-building `.ics` format | `ical-generator` | iCalendar RFC 5545 has timezone, encoding, and folding edge cases |
| CSV header detection | Manual string splitting | `papaparse` | Handles quoted fields, BOM markers, CRLF vs LF, multi-line cells |
| Graph traversal | Application-level BFS/DFS | PostgreSQL recursive CTE | Eliminates N+1 queries; single DB round-trip for full subgraph |
| Change collision detection | JS date overlap checking | PostgreSQL overlap query | Handles timezone edge cases; atomic with the lock |
| Cycle detection in CmdbCategory | TypeScript recursive walk | Raw SQL cycle check (Phase 3 pattern) | Avoids TS7022 self-referencing type error; faster on large trees |

**Key insight:** Graph problems (CI relationships, app dependencies, category hierarchies, CI impact traversal) all have non-obvious edge cases (cycles, disconnected nodes, depth explosions). Database-side or well-tested library solutions are always more reliable than ad-hoc implementations.

---

## Common Pitfalls

### Pitfall 1: ReactFlow SSR Error
**What goes wrong:** `window is not defined` or hydration mismatch in Next.js App Router.
**Why it happens:** `@xyflow/react` accesses browser APIs at module init time.
**How to avoid:** Wrap in `'use client'` + dynamic import with `ssr: false` if the component is nested in a Server Component boundary.
**Warning signs:** Build-time errors mentioning `ReactFlowProvider` or `useStore`.

### Pitfall 2: Recursive CTE Infinite Loop
**What goes wrong:** Query hangs or returns millions of rows on a CI graph with circular dependencies.
**Why it happens:** CMDB allows MEMBER_OF and HOSTS relationships that can form cycles (e.g., two VMs hosting each other in an error state).
**How to avoid:** Always include `AND NOT (targetId = ANY(path))` in the recursive case. Add `LIMIT 10000` as a safety net.
**Warning signs:** Query timeout on impact analysis for specific CIs.

### Pitfall 3: papaparse Worker Scope in Next.js
**What goes wrong:** `papaparse` with `worker: true` fails in Next.js App Router.
**Why it happens:** Next.js bundles Web Workers differently; papaparse's built-in worker doesn't resolve correctly.
**How to avoid:** Use `worker: false` (synchronous parse). For files under ~50MB this is fine; CMDB imports are typically small.
**Warning signs:** Uncaught error about worker script URL.

### Pitfall 4: ical-generator Timezone Handling
**What goes wrong:** Calendar events show wrong time for attendees in different timezones.
**Why it happens:** ical-generator requires explicit timezone specification.
**How to avoid:** Pass timezone from the tenant's configured timezone setting when creating the ICalEvent. Use `start: { date: meetingDate, timezone: tenantTimezone }` API.
**Warning signs:** Attendees report meeting time offset by hours.

### Pitfall 5: Change Number Race Condition
**What goes wrong:** Duplicate `changeNumber` values under concurrent change creation.
**Why it happens:** Read-then-write without locking.
**How to avoid:** Use `prisma.$transaction` with `$queryRaw` FOR UPDATE lock — exactly like the ticket number pattern in `ticket.service.ts`. Never compute the next number outside a transaction.
**Warning signs:** Unique constraint violation on `(tenantId, changeNumber)`.

### Pitfall 6: Approval Sequence Logic on STANDARD/EMERGENCY
**What goes wrong:** STANDARD changes trigger approval emails; EMERGENCY changes wait for CAB scheduling.
**Why it happens:** Naive implementation treats all change types identically.
**How to avoid:** In `change.service.ts` `createChange()`, check type and either auto-advance to APPROVED (STANDARD) or APPROVAL_PENDING directly (EMERGENCY), bypassing the normal NEW → ASSESSMENT → APPROVAL_PENDING sequence.
**Warning signs:** STANDARD changes stuck in ASSESSMENT; EMERGENCY changes not getting fast-tracked.

### Pitfall 7: Missing tenantId on CmdbChangeRecord
**What goes wrong:** Agent-driven CI updates insert CmdbChangeRecord without tenantId, failing the NOT NULL constraint.
**Why it happens:** Worker code omits tenantId when it only has `agentId`.
**How to avoid:** In the reconciliation worker, always join to the Agent record to get tenantId before writing any CmdbChangeRecord rows.
**Warning signs:** Worker job failure with Prisma constraint violation on `cmdb_change_records.tenantId`.

### Pitfall 8: ReactFlow Style Import Missing
**What goes wrong:** Flow renders with no edges visible or nodes overlapping incorrectly.
**Why it happens:** Missing `import '@xyflow/react/dist/style.css'`.
**How to avoid:** Add the CSS import in the client component (or in the Next.js global CSS if used site-wide). Required per ReactFlow docs.
**Warning signs:** Edges invisible; node positions all at (0,0).

---

## Code Examples

### CMDB Impact Analysis API Route Shape

```typescript
// GET /api/v1/cmdb/:ciId/impact?depth=2
// Returns: { rootCi: CI, impacted: ImpactedCI[], totalCount: number }
// Requires: CMDB_VIEW permission
// Uses: Recursive CTE (Pattern 3 above)
```

### Change Type-Gated Form Fields

```typescript
// apps/web/src/app/dashboard/changes/new/page.tsx
// Emergency changes: hide scheduledStart/End, implementationPlan, testingPlan
// Standard changes: show simplified form (no approval chain UI shown)
const isEmergency = watchType === 'EMERGENCY';
const isStandard  = watchType === 'STANDARD';

{!isEmergency && (
  <DateRangePicker name="scheduledStart" ... />
)}
{!isEmergency && !isStandard && (
  <Textarea name="implementationPlan" ... />
)}
```

### CAB iCal Download Endpoint

```typescript
// GET /api/v1/cab/:meetingId/ical
// Requires: no special permission (any authenticated user can download)
// Response headers:
//   Content-Type: text/calendar; charset=utf-8
//   Content-Disposition: attachment; filename="cab-meeting-{id}.ics"
reply
  .header('Content-Type', 'text/calendar; charset=utf-8')
  .header('Content-Disposition', `attachment; filename="cab-meeting-${meetingId}.ics"`)
  .send(icalString);
```

### Asset Status Lifecycle Guard

```typescript
// apps/api/src/services/asset.service.ts
const ASSET_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  IN_STOCK:  ['DEPLOYED', 'IN_REPAIR', 'DISPOSED'],
  DEPLOYED:  ['IN_REPAIR', 'RETIRED'],
  IN_REPAIR: ['DEPLOYED', 'RETIRED'],
  RETIRED:   ['DISPOSED'],
  DISPOSED:  [],  // terminal
};
```

### CMDB Import Row Validation Pattern

```typescript
// Row-level validation — validate each row independently, collect errors
const results = rows.map((row, index) => {
  const validation = CiImportRowSchema.safeParse(row);
  if (!validation.success) {
    return { row: index + 1, status: 'error', errors: validation.error.issues };
  }
  return { row: index + 1, status: 'valid', data: validation.data };
});
const validRows  = results.filter((r) => r.status === 'valid');
const errorRows  = results.filter((r) => r.status === 'error');
// Import validRows in transaction; return { imported, skipped: 0, errors: errorRows }
```

### Existing Sequential Number Pattern (exact reference)

```typescript
// Source: apps/api/src/services/ticket.service.ts lines ~150-160
const result = await tx.$queryRaw<[{ next: bigint }]>`
  SELECT COALESCE(MAX("ticketNumber"), 0) + 1 AS next
  FROM tickets
  WHERE "tenantId" = ${tenantId}::uuid
  FOR UPDATE
`;
const ticketNumber = Number(result[0].next);
// Replicate for changeNumber, ciNumber, assetTag
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `reactflow` package | `@xyflow/react` package | v12 (2024) | Different package name; same API concepts but new hooks |
| dagre (unmaintained) | `@dagrejs/dagre` fork | 2022 | Original dagre not maintained; use fork |
| Manual ics string building | `ical-generator` | — | RFC 5545 compliance without hand-rolling |
| Schema-per-tenant CMDB | Shared-schema + tenantId (project decision) | Phase 1 | All queries must scope tenantId — especially recursive CTEs |

**Deprecated/outdated:**
- `reactflow` npm package: v11 legacy, do not install. Use `@xyflow/react` instead.
- `dagre` (original): unmaintained. Use `@dagrejs/dagre`.
- Graph database for CMDB: explicitly out of scope per REQUIREMENTS.md — PostgreSQL recursive CTEs are sufficient.

---

## Open Questions

1. **DocumentType enum count for APP-03**
   - What we know: `ApplicationDocument` model references `DocumentType` enum; requirement says "11 document types"
   - What's unclear: The schema was read partially — need to verify the `DocumentType` and `AppAssetRelationship` enums exist with the expected values
   - Recommendation: Planner task 0 (Wave 0) should read the full schema enum list and verify; if missing values, add migration task

2. **CMDB Reconciliation Job Trigger Mode**
   - What we know: `CMDB_RECONCILIATION` queue exists; worker is stub; repeatable every 15 min per CMDB-13
   - What's unclear: Whether reconciliation is triggered per-agent (job data has agentId) or as a global sweep
   - Recommendation: Implement as a **global sweep** (like SLA monitor) — one job iterates all agents with recent InventorySnapshots, scoped by tenantId per agent. Matches the concurrency: 2 setting already in the stub.

3. **Risk Assessment Scoring for CHNG-06**
   - What we know: `riskLevel` field exists as enum (LOW/MEDIUM/HIGH/CRITICAL); "automated risk assessment scoring" is required
   - What's unclear: The scoring formula — no specification in CONTEXT.md or REQUIREMENTS.md beyond "automated"
   - Recommendation: Score based on: change type weight (EMERGENCY=HIGH floor) + affected CI count + affected application criticality + historical change fail rate for this type. Return suggested riskLevel; user can override.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `pnpm --filter api vitest run src/__tests__/change-service.test.ts` |
| Full suite command | `pnpm --filter api vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ASST-02 | Asset status transition guard (IN_STOCK→DEPLOYED allowed, DISPOSED→any rejected) | unit | `pnpm --filter api vitest run src/__tests__/asset-service.test.ts` | ❌ Wave 0 |
| CMDB-02 | CI type enum values match schema | unit | `pnpm --filter api vitest run src/__tests__/cmdb-service.test.ts` | ❌ Wave 0 |
| CMDB-03 | Relationship CRUD + duplicate prevention | unit | `pnpm --filter api vitest run src/__tests__/cmdb-service.test.ts` | ❌ Wave 0 |
| CMDB-04 | Impact analysis returns correct depth-limited set | unit | `pnpm --filter api vitest run src/__tests__/cmdb-service.test.ts` | ❌ Wave 0 |
| CHNG-02 | Change status machine allows/rejects specific transitions | unit | `pnpm --filter api vitest run src/__tests__/change-service.test.ts` | ❌ Wave 0 |
| CHNG-02 | STANDARD change auto-advances to APPROVED | unit | `pnpm --filter api vitest run src/__tests__/change-service.test.ts` | ❌ Wave 0 |
| CHNG-02 | EMERGENCY change skips to APPROVAL_PENDING | unit | `pnpm --filter api vitest run src/__tests__/change-service.test.ts` | ❌ Wave 0 |
| CHNG-03 | Approval sequence: sequential approver ordering enforced | unit | `pnpm --filter api vitest run src/__tests__/change-service.test.ts` | ❌ Wave 0 |
| CHNG-05 | Schedule collision detection returns conflict | unit | `pnpm --filter api vitest run src/__tests__/change-service.test.ts` | ❌ Wave 0 |
| CMDB-12 | Reconciliation: new agent CI creates CmdbConfigurationItem | unit | `pnpm --filter api vitest run src/__tests__/cmdb-reconciliation.test.ts` | ❌ Wave 0 |
| CMDB-12 | Reconciliation: changed field logs CmdbChangeRecord | unit | `pnpm --filter api vitest run src/__tests__/cmdb-reconciliation.test.ts` | ❌ Wave 0 |
| CMDB-13 | Stale CI marking: lastSeenAt > 24h sets status=INACTIVE | unit | `pnpm --filter api vitest run src/__tests__/cmdb-reconciliation.test.ts` | ❌ Wave 0 |
| CAB-04 | iCal output contains correct start/end/summary/attendees | unit | `pnpm --filter api vitest run src/__tests__/cab-service.test.ts` | ❌ Wave 0 |
| CMDB-10 | Import wizard: valid rows imported, error rows rejected with messages | unit | `pnpm --filter api vitest run src/__tests__/cmdb-import.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter api vitest run src/__tests__/[relevant-test].test.ts`
- **Per wave merge:** `pnpm --filter api vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/__tests__/asset-service.test.ts` — covers ASST-02
- [ ] `apps/api/src/__tests__/cmdb-service.test.ts` — covers CMDB-02, CMDB-03, CMDB-04
- [ ] `apps/api/src/__tests__/change-service.test.ts` — covers CHNG-02, CHNG-03, CHNG-05
- [ ] `apps/api/src/__tests__/cmdb-reconciliation.test.ts` — covers CMDB-12, CMDB-13
- [ ] `apps/api/src/__tests__/cab-service.test.ts` — covers CAB-04
- [ ] `apps/api/src/__tests__/cmdb-import.test.ts` — covers CMDB-10

All follow the `it.todo()` scaffold pattern established in Phase 3 (see `ticket-service.test.ts`).

---

## Sources

### Primary (HIGH confidence)
- `packages/db/prisma/schema.prisma` — All Phase 4 models and enums verified present: Asset, CmdbConfigurationItem, CmdbRelationship, CmdbChangeRecord, CmdbTicketLink, CmdbCategory, Change, ChangeApproval, ChangeActivity, ChangeApplication, ChangeAsset, CABMeeting, CABMeetingAttendee, CABMeetingChange, Application, ApplicationDependency, ApplicationDocument, ApplicationActivity, ApplicationAsset
- `apps/worker/src/workers/cmdb-reconciliation.ts` — Stub confirmed; queue name CMDB_RECONCILIATION confirmed in definitions.ts
- `apps/api/src/services/ticket.service.ts` — FOR UPDATE sequential number pattern; fire-and-forget notification pattern
- `apps/api/src/plugins/rbac.ts` — requirePermission() pattern confirmed
- `npm view @xyflow/react` — version 12.10.1 confirmed current; peer dep react >=17 confirmed
- `npm view @dagrejs/dagre` — version 2.0.4 confirmed current
- `npm view ical-generator` — version 10.1.0 confirmed; Node 20+ engine confirmed
- `npm view papaparse` — version 5.5.3 confirmed current

### Secondary (MEDIUM confidence)
- ReactFlow v12 dagre layout pattern — verified via ReactFlow docs examples and @dagrejs/dagre package description
- ical-generator API (`createEvent`, `attendees`) — verified via npm package description and README structure

### Tertiary (LOW confidence)
- Risk assessment scoring formula (CHNG-06) — no official specification found; recommendation is heuristic-based design

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry 2026-03-22
- Architecture: HIGH — patterns directly derived from existing project code
- Pitfalls: HIGH for React/Node pitfalls (verified); MEDIUM for CMDB reconciliation edge cases (pattern-based)
- State machine design: HIGH — schema enums confirm all values; transition rules derived from CONTEXT.md decisions

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable libraries; ReactFlow moves fast but minor API changes only)
