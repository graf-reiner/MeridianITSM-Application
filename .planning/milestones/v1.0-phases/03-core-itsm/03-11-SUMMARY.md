---
phase: 03-core-itsm
plan: 11
subsystem: service-desk
tags: [sla, ticket-service, gap-closure]
dependency_graph:
  requires: []
  provides: [SLA-02, NOTF-02]
  affects: [apps/api/src/services/ticket.service.ts]
tech_stack:
  added: []
  patterns: [sla-breach-calculation, calculateBreachAt-at-ticket-creation]
key_files:
  created: []
  modified:
    - apps/api/src/services/ticket.service.ts
    - .planning/STATE.md
decisions:
  - Worker code duplication (workers cannot import from apps/api/src/services/) accepted as architecture pattern — deferred to future shared packages/ refactor
  - NOTF-02 confirmed satisfied with all 12 NotificationType enum values present including CAB_INVITATION
metrics:
  duration: ~5 min
  completed: 2026-03-21
---

# Phase 03 Plan 11: SLA Breach Calculation Gap Closure Summary

**One-liner:** Wire calculateBreachAt into ticket.service.ts so slaBreachAt is populated at creation and recalculated on slaId/priority changes.

## What Was Built

This plan closes the critical SLA-02 gap: tickets created with an `slaId` were storing the reference but never calling `calculateBreachAt`, leaving `slaBreachAt` null on every ticket. Without `slaBreachAt`, the SLA monitor worker had nothing to compare against and could never detect breaches.

### Changes

**apps/api/src/services/ticket.service.ts**
- Added import: `calculateBreachAt`, `getResolutionMinutes`, `SlaPriority` from `./sla.service.js`
- `createTicket`: After ticket is created in transaction, fetches the SLA policy (if `slaId` provided) and calls `calculateBreachAt(ticket.createdAt, targetMinutes, sla)` to populate `slaBreachAt` via a second `tx.ticket.update`
- `updateTicket`: Recalculates `slaBreachAt` when `slaId` changes to a different policy
- `updateTicket`: Recalculates `slaBreachAt` when `priority` changes on a ticket that already has an `slaId` (and no slaId override in the same update)

**.planning/STATE.md**
- Documented worker code duplication as accepted architecture pattern (cross-app boundary prevents imports; follows mapStripeStatus precedent from Phase 02)
- Confirmed NOTF-02 satisfied: NotificationType enum has exactly 12 values including CAB_INVITATION (initial verification had miscounted)

## Verification

All checks pass:
- `grep "calculateBreachAt" ticket.service.ts` — import + 3 usage sites (createTicket, updateTicket slaId change, updateTicket priority change)
- `grep "import.*sla.service" ticket.service.ts` — import line present
- `grep "Worker code duplication" STATE.md` — architecture decision documented
- `grep "NOTF-02 satisfied" STATE.md` — NOTF-02 confirmation documented
- `pnpm --filter api exec tsc --noEmit` — compiles without errors

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files exist:
- FOUND: apps/api/src/services/ticket.service.ts
- FOUND: .planning/STATE.md

Commits exist:
- 2482b95: feat(03-11): wire calculateBreachAt into ticket creation and SLA reassignment
- e19c2fe: docs(03-11): document worker duplication architecture decision and confirm NOTF-02
