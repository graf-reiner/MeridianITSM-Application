---
phase: 03-core-itsm
plan: 01
subsystem: api
tags: [fastify, prisma, minio, s3, multipart, tickets, bullmq]

requires:
  - phase: 01-foundation
    provides: Fastify server, Prisma schema (Ticket/TicketComment/TicketActivity models), planGate plugin, RBAC plugin
  - phase: 02-billing-and-owner-admin
    provides: planGate implementation with subscription enforcement

provides:
  - Ticket service with full lifecycle: create (transactional sequential number), update (status machine), comments (first-response tracking), list (filters/search/pagination), detail (all includes), assign, KB/CMDB linking
  - Storage service for MinIO/S3 file upload and presigned URL generation
  - Ticket REST API: POST/GET/PATCH /api/v1/tickets, comments, attachments, assign, link-article, link-ci, activities
  - SLA model extended with timezone, autoEscalate, escalateToQueueId fields
  - PlanResource type extended with 'tickets' for plan gate support

affects: [03-02-sla-service, 03-05-email-notifications, 03-07-reporting, 03-08-portal]

tech-stack:
  added: ["@aws-sdk/s3-request-presigner", "@fastify/multipart (scoped)"]
  patterns:
    - "Ticket service functions: all take (tenantId, ..., actorId) parameters for tenant isolation"
    - "FOR UPDATE SQL pattern for sequential number generation in transactions"
    - "Status machine transitions enforced via ALLOWED_TRANSITIONS record"
    - "Multipart registered scoped to ticket plugin only (not globally) to avoid breaking JSON routes"
    - "PlanResource extended via getLimitKey returning null for unlimited resources"

key-files:
  created:
    - apps/api/src/services/ticket.service.ts
    - apps/api/src/services/storage.service.ts
    - apps/api/src/routes/v1/tickets/index.ts
    - packages/db/prisma/migrations/20260320000001_add_sla_fields/migration.sql
  modified:
    - packages/db/prisma/schema.prisma
    - packages/core/src/plan-config.ts
    - apps/api/src/plugins/plan-gate.ts
    - apps/api/src/routes/v1/index.ts

key-decisions:
  - "'tickets' added to PlanResource type — planGate('tickets') enforces subscription status only (no numeric limit since tickets are unlimited across all plans)"
  - "getLimitKey now returns null for non-numeric resources instead of throwing — planGate enforce skips count check when null"
  - "@fastify/multipart registered at plugin scope only (not globally) — prevents content-type parser conflicts with JSON routes per STATE.md pitfall"
  - "SLA pause/resume math stores slaPausedAt in customFields JSON on ticket — consumed by SLA service in plan 03-02"

patterns-established:
  - "Ticket service functions: (tenantId, entityId, data, actorId) for tenant-scoped mutation"
  - "Every mutation logs TicketActivity — enforced at service layer, not route layer"
  - "Status machine: ALLOWED_TRANSITIONS map validated on every PATCH — 400 on invalid transition"
  - "FOR UPDATE in $queryRaw transaction for sequential ticket numbering"
  - "Storage key format: {tenantId}/tickets/{ticketId}/{timestamp}-{filename}"

requirements-completed: [TICK-01, TICK-02, TICK-03, TICK-04, TICK-05, TICK-06, TICK-07, TICK-08, TICK-09, TICK-10, TICK-11, TICK-12]

duration: 10min
completed: 2026-03-20
---

# Phase 3 Plan 01: Ticket Management API Summary

**Ticket lifecycle API with transactional sequential numbering, status state machine, audit trail, MinIO attachment storage, and plan-gated creation — complete core of the ITSM service desk.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-20T23:29:22Z
- **Completed:** 2026-03-20T23:39:22Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Ticket service with all business logic: create (FOR UPDATE sequential number), update (7-state machine with timestamps), addComment (first-response tracking), getTicketList (full filter/search/pagination), getTicketDetail (all includes), assignTicket, linkKnowledgeArticle, linkCmdbItem
- Storage service with MinIO/S3 client (forcePathStyle, configurable endpoint/credentials), uploadFile, getFileSignedUrl using presigned URLs
- Full REST API: 11 endpoints covering CRUD, comments with visibility enforcement (end_user always PUBLIC), multipart attachments (25MB limit), signed URL downloads, assignment, KB/CI linking, paginated audit trail
- SLA model schema extended with timezone/autoEscalate/escalateToQueueId — consumed by SLA monitor in plan 03-02

## Task Commits

1. **Task 1: Ticket service, storage service, and DB migration** - `fe434c3` (feat)
2. **Task 2: Ticket API routes** - included in `28f9fa0` (refactor 03-02 sweep — picked up during concurrent execution)

## Files Created/Modified

- `apps/api/src/services/ticket.service.ts` — Full ticket lifecycle service (create, update, comment, list, detail, assign, link)
- `apps/api/src/services/storage.service.ts` — MinIO/S3 client with uploadFile and getFileSignedUrl
- `apps/api/src/routes/v1/tickets/index.ts` — All 11 ticket REST endpoints with plan gate, multipart, RBAC
- `packages/db/prisma/schema.prisma` — SLA model extended with timezone, autoEscalate, escalateToQueueId
- `packages/db/prisma/migrations/20260320000001_add_sla_fields/migration.sql` — Migration SQL for SLA fields
- `packages/core/src/plan-config.ts` — PlanResource type extended with 'tickets'; getLimitKey returns null for unlimited resources
- `apps/api/src/plugins/plan-gate.ts` — Numeric limit check skipped when getLimitKey returns null
- `apps/api/src/routes/v1/index.ts` — ticketRoutes registered

## Decisions Made

- `tickets` added to PlanResource for plan gate typing; ticket creation is subscription-status-gated only (no count limit) since getLimitKey returns null for unknown resources
- `@fastify/multipart` registered scoped to tickets plugin, not globally — avoids breaking JSON content-type parsing in other routes
- SLA pause timestamp stored in `customFields.slaPausedAt` on the ticket — lightweight approach that avoids a separate DB table; SLA service consumes it for breach recalculation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PlanResource type missing 'tickets' caused TypeScript error**
- **Found during:** Task 2 (ticket API routes)
- **Issue:** Plan spec said `planGate('tickets', ...)` but 'tickets' was not in PlanResource union type — TS2345 type error
- **Fix:** Added 'tickets' to PlanResource in packages/core/src/plan-config.ts; updated getLimitKey to return null instead of throwing for non-numeric resources; updated plan-gate enforce to skip count check when limitKey is null
- **Files modified:** packages/core/src/plan-config.ts, apps/api/src/plugins/plan-gate.ts
- **Verification:** TypeScript compilation passes cleanly (no errors)
- **Committed in:** `28f9fa0` (included in concurrent 03-02 commit)

**2. [Rule 3 - Blocking] @aws-sdk/s3-request-presigner not in dependencies**
- **Found during:** Task 1 (storage service)
- **Issue:** Plan required presigned URLs via `@aws-sdk/s3-request-presigner` but package was not in apps/api/package.json
- **Fix:** `pnpm --filter @meridian/api add @aws-sdk/s3-request-presigner`
- **Files modified:** apps/api/package.json, pnpm-lock.yaml
- **Verification:** Import resolves, TypeScript compiles
- **Committed in:** `fe434c3`

---

**Total deviations:** 2 auto-fixed (1 type system bug, 1 missing dependency)
**Impact on plan:** Both auto-fixes required for correctness. getLimitKey null-return is a cleaner pattern than throwing for extensibility.

## Issues Encountered

- Database not running locally — migration SQL created manually instead of via `prisma migrate dev`; Prisma client generated successfully from updated schema
- Concurrent agent execution: Task 2 files (tickets/index.ts, plan-gate.ts, plan-config.ts) were committed in the 03-02 agent's `refactor(03-02)` commit rather than a dedicated Task 2 commit

## Next Phase Readiness

- Ticket service is ready for SLA service integration (plan 03-02 already done — SLA monitor consumes ticket data)
- Storage service ready for email attachment support (plan 03-05)
- Ticket activity trail ready for webhook event emission (plan 03-09)

---
*Phase: 03-core-itsm*
*Completed: 2026-03-20*
