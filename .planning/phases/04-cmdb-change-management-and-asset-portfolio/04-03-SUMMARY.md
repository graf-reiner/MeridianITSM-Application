---
phase: 04-cmdb-change-management-and-asset-portfolio
plan: "03"
subsystem: change-management
tags: [change-lifecycle, state-machine, approval-workflow, cab-meetings, ical, risk-scoring, collision-detection]
dependency_graph:
  requires:
    - 04-01 (CMDB service and routes)
    - 04-02 (Asset management)
    - 03-07 (Notification service with CHANGE_APPROVAL and CAB_INVITATION types)
  provides:
    - Change CRUD with 10-state lifecycle
    - Type-dependent initial statuses (STANDARD=APPROVED, EMERGENCY=APPROVAL_PENDING, NORMAL=NEW)
    - Sequential approval chains with turn enforcement
    - Schedule collision detection
    - Automated risk scoring
    - CAB meeting management with RSVP
    - iCal downloads for CAB meetings
    - Per-change CAB outcomes triggering status transitions
  affects:
    - 04-04+ (frontend change management pages)
    - Report service (change exports already stub-ready)
tech_stack:
  added:
    - ical-generator (iCal file generation for CAB meetings)
  patterns:
    - 10-state ALLOWED_TRANSITIONS constant pattern (mirrors ticket state machine from 03-01)
    - FOR UPDATE lock for sequential changeNumber (same pattern as ticketNumber)
    - Fire-and-forget notification dispatch via void async IIFE
    - Type-based initial status dispatch (getInitialStatus function)
    - Sequential approver ordering via sequenceOrder field
    - Date overlap query for collision detection (scheduledStart < end AND scheduledEnd > start)
key_files:
  created:
    - apps/api/src/services/change.service.ts
    - apps/api/src/services/cab.service.ts
    - apps/api/src/routes/v1/changes/index.ts
    - apps/api/src/routes/v1/cab/index.ts
  modified:
    - apps/api/src/routes/v1/index.ts (registered changeRoutes and cabRoutes)
    - apps/api/package.json (added ical-generator)
    - pnpm-lock.yaml
decisions:
  - "[04-03]: ical-generator imported as default import — library uses default export pattern"
  - "[04-03]: Asset model has no 'name' field — select uses assetTag/hostname/model/status for identification"
  - "[04-03]: status initial value requires 'as any' cast — Prisma generated type expects ChangeStatus enum but we compute it as string"
  - "[04-03]: /calendar route defined before /:id in Fastify to avoid parameterized route conflict"
  - "[04-03]: Sequential approver turn enforcement: approver must have min sequenceOrder among PENDING approvals"
  - "[04-03]: recordOutcome APPROVED/REJECTED transitions wrapped in try/catch — avoids failure if change already in terminal state"
  - "[04-03]: CAB outcome transition failures logged but not propagated — outcome record is saved regardless of transition success"
metrics:
  duration_minutes: 12
  completed_date: "2026-03-22"
  tasks_completed: 3
  files_created: 4
  files_modified: 3
---

# Phase 04 Plan 03: Change Management Service and CAB Routes Summary

**One-liner:** 10-state change lifecycle with sequential approval chains, schedule collision detection, risk scoring, and CAB meeting management with RSVP, agenda ordering, and iCal downloads via ical-generator.

## What Was Built

### Task 1: Change Management Service (`apps/api/src/services/change.service.ts`)

Complete change lifecycle implementation:

- **ALLOWED_TRANSITIONS**: 10-state constant defining valid status moves
- **getInitialStatus(type)**: STANDARD=APPROVED, EMERGENCY=APPROVAL_PENDING, NORMAL=NEW — type-dependent starting point
- **createChange()**: FOR UPDATE lock for sequential changeNumber; logs CREATED + STATUS_CHANGED activities; creates approvals for NORMAL/EMERGENCY types; fires immediate CHANGE_APPROVAL notifications for EMERGENCY
- **transitionStatus()**: Validates against ALLOWED_TRANSITIONS; throws 409 on invalid; requires approver before APPROVAL_PENDING; validates all approvals APPROVED before manual APPROVED transition
- **addApprover()**: Creates ChangeApproval record with PENDING status; fires CHANGE_APPROVAL notification to approver
- **recordApproval()**: Enforces sequential order (approver must be minimum-sequenceOrder PENDING); auto-transitions to REJECTED or APPROVED based on decision; notifies next approver in sequence
- **getCollisions()**: PostgreSQL date overlap query for SCHEDULED/IMPLEMENTING changes
- **calculateRiskScore()**: Base score by type + CI count (capped at 3) + critical app flag; maps to LOW/MEDIUM/HIGH/CRITICAL
- **linkAsset() / linkApplication()**: Junction record creation for ChangeAsset and ChangeApplication

### Task 2: CAB Service (`apps/api/src/services/cab.service.ts`)

Complete CAB meeting management:

- **createMeeting()**: Creates with status SCHEDULED, default 60-minute duration
- **getMeeting()**: Full includes with attendees (user details, ordered by role) and changes (ordered by agendaOrder)
- **listMeetings()**: Paginated with status/date filters, ordered by scheduledFor DESC
- **updateMeeting()**: Partial update of all mutable fields
- **addAttendee()**: Creates with rsvpStatus PENDING; fires CAB_INVITATION notification
- **removeAttendee()**: Scoped by tenantId/meetingId for security
- **updateRSVP()**: Updates to ACCEPTED/DECLINED/TENTATIVE by meetingId+userId lookup
- **linkChange()**: Creates CABMeetingChange with agendaOrder for display ordering
- **recordOutcome()**: Updates outcome; calls transitionStatus for APPROVED/REJECTED outcomes; notifies change requestedBy
- **generateIcal()**: Uses ical-generator to produce RFC 5545 iCal content with attendee emails

### Task 3: API Routes

**Change routes (`apps/api/src/routes/v1/changes/index.ts`):**
- POST/GET for CRUD with proper permission guards (changes.create, changes.read, changes.update)
- /calendar defined before /:id to avoid Fastify route conflict
- /transition returns 409 on invalid state machine transitions
- /approve requires changes.approve permission; handles sequential ordering errors
- /collisions returns overlapping changes using the change's own scheduledStart/End
- /assets and /applications handle P2002 unique constraint as 409

**CAB routes (`apps/api/src/routes/v1/cab/index.ts`):**
- Meeting CRUD with changes.update/read permissions
- /rsvp requires no special permission — any authenticated user can update their own RSVP
- /outcome requires changes.approve permission
- /ical returns text/calendar content-type with Content-Disposition attachment header

Both route sets registered in `apps/api/src/routes/v1/index.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Asset model missing 'name' field**
- **Found during:** Task 1 TypeScript compilation
- **Issue:** Plan spec said `select: { id: true, name: true, assetTag: true, type: true }` but Asset model has no `name` or `type` column — it uses `hostname`, `model`, `assetTag`, `status`
- **Fix:** Changed select to `{ id: true, assetTag: true, hostname: true, model: true, status: true }`
- **Files modified:** `apps/api/src/services/change.service.ts`
- **Commit:** 962a581

**2. [Rule 1 - Bug] ChangeStatus type cast required**
- **Found during:** Task 1 TypeScript compilation
- **Issue:** `getInitialStatus()` returns a string type but Prisma's generated type expects the `ChangeStatus` enum — compile error at `status: initialStatus`
- **Fix:** Added `as any` cast consistent with the pattern used throughout codebase (e.g., Phase 03-02 Prisma 7 JSON type cast)
- **Files modified:** `apps/api/src/services/change.service.ts`
- **Commit:** 962a581

## Self-Check: PASSED

All files confirmed present:
- apps/api/src/services/change.service.ts — FOUND
- apps/api/src/services/cab.service.ts — FOUND
- apps/api/src/routes/v1/changes/index.ts — FOUND
- apps/api/src/routes/v1/cab/index.ts — FOUND

All commits confirmed present:
- 962a581 — FOUND (Task 1: change service)
- b66bafc — FOUND (Task 2: CAB service)
- 8ad9a58 — FOUND (Task 3: routes)
