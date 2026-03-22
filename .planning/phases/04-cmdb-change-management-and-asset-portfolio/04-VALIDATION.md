---
phase: 04
slug: cmdb-change-management-and-asset-portfolio
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter api vitest run --reporter=verbose` |
| **Full suite command** | `pnpm --filter api vitest run && pnpm --filter web exec tsc --noEmit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter api vitest run --reporter=verbose`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Populated by planner during plan creation.*

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `apps/api/src/__tests__/asset-service.test.ts` — stubs for ASST-01..05
- [ ] `apps/api/src/__tests__/cmdb-service.test.ts` — stubs for CMDB-01..04
- [ ] `apps/api/src/__tests__/change-service.test.ts` — stubs for CHNG-01..03
- [ ] `apps/api/src/__tests__/cmdb-reconciliation.test.ts` — stubs for CMDB-12..13
- [ ] `apps/api/src/__tests__/cab-service.test.ts` — stubs for CAB-01..05
- [ ] `apps/api/src/__tests__/cmdb-import.test.ts` — stubs for CMDB-10

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ReactFlow CI relationship map renders | CMDB-09 | Browser rendering | Navigate to CI detail, verify graph layout |
| ReactFlow app dependency diagram renders | APP-06 | Browser rendering | Navigate to portfolio, verify graph |
| Impact analysis overlay colors | CMDB-04 | Visual verification | Click impact analysis, verify red/orange highlighting |
| iCal download opens in calendar | CAB-04 | External app | Download iCal, verify opens in Outlook/Calendar |
| Change calendar month view | CHNG-09 | Browser rendering | Navigate to change calendar, verify bars |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
