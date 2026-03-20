---
phase: 03
slug: core-itsm
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/api/vitest.config.ts` (API), `apps/web/vitest.config.ts` (frontend) |
| **Quick run command** | `pnpm --filter api vitest run --reporter=verbose` |
| **Full suite command** | `pnpm --filter api vitest run && pnpm --filter web vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter api vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm --filter api vitest run && pnpm --filter web vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Populated by planner during plan creation — maps each task to its test files and commands.*

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TBD | TBD | TBD | TBD | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `apps/api/vitest.config.ts` — verify test config exists (created in Phase 1)
- [ ] `apps/api/src/test-utils/` — shared test fixtures for Prisma mocks, Fastify app builder

*Existing infrastructure from Phase 1-2 covers framework setup. Phase 3 adds domain-specific test utilities.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SLA countdown timer visual | SLA-05 | Browser rendering of color bands | Open ticket with active SLA, verify green→yellow→red at thresholds |
| TipTap editor interaction | KB-01 | Rich text editing UX | Create article, test bold/italic/links/images |
| Email-to-ticket flow | EMAL-02 | Requires real IMAP server | Send email to configured mailbox, verify ticket created within 5 min |
| Portal role redirect | PRTL-06 | Middleware + browser redirect | Log in as end_user, verify redirect to /portal |
| Notification bell badge | NOTF-01 | Real-time UI update | Trigger ticket event, verify bell count increments |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
