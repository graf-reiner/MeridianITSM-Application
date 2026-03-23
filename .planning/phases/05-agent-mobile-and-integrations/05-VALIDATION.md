---
phase: 5
slug: agent-mobile-and-integrations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (API/worker), dotnet test (.NET agent), jest (mobile/Expo) |
| **Config file** | `apps/api/vitest.config.ts`, `apps/inventory-agent/tests/`, `apps/mobile/jest.config.js` |
| **Quick run command** | `pnpm --filter api vitest run --reporter=verbose` |
| **Full suite command** | `pnpm --filter api vitest run && pnpm --filter worker vitest run && cd apps/inventory-agent && dotnet test && cd ../../apps/mobile && npx jest` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter api vitest run --reporter=verbose`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | AGNT-03,04,05,06 | unit | `pnpm --filter api vitest run src/routes/v1/agents/agents.test.ts --reporter=verbose` | W0 (Plan 01 Task 1) | pending |
| 05-01-02 | 01 | 1 | AGNT-08 | unit | `pnpm --filter api vitest run src/routes/v1/agents/agents.test.ts --reporter=verbose` | W0 (Plan 01 Task 1) | pending |
| 05-02-01 | 02 | 2 | INTG-02,03,04,05 | unit | `pnpm --filter worker vitest run src/workers/webhook-delivery.test.ts --reporter=verbose` | W0 (Plan 02 Task 2) | pending |
| 05-02-02 | 02 | 2 | INTG-02 | unit | `pnpm --filter api vitest run src/routes/external/external.test.ts --reporter=verbose` | W0 (Plan 02 Task 2) | pending |
| 05-03-01 | 03 | 2 | PUSH-01,03 | integration | `pnpm --filter worker vitest run src/workers/push-notification.test.ts --reporter=verbose` | W0 needed | pending |
| 05-07-01 | 07 | 2 | MOBL-05 | type-check | `cd apps/mobile && npx tsc --noEmit` | N/A (type check) | pending |
| 05-09-01 | 09 | 2 | AGNT-08,INTG-01 | type-check | `pnpm --filter web tsc --noEmit` | N/A (type check) | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `apps/api/src/routes/v1/agents/agents.test.ts` — stubs for AGNT-03, AGNT-04, AGNT-05, AGNT-06, AGNT-08 (created by Plan 01 Task 1)
- [x] `apps/api/src/routes/v1/push/push.test.ts` — stubs for PUSH-02 (created by Plan 01 Task 1)
- [x] `apps/api/src/routes/v1/settings/api-keys.test.ts` — stubs for INTG-01 (created by Plan 01 Task 1)
- [x] `apps/worker/src/workers/webhook-delivery.test.ts` — stubs for INTG-03, INTG-04, INTG-05 (created by Plan 02 Task 2)
- [x] `apps/api/src/routes/external/external.test.ts` — stubs for INTG-01, INTG-02 (created by Plan 02 Task 2)
- [ ] `apps/mobile/jest.config.js` — Jest config for mobile app (created by Plan 06)
- [ ] `apps/inventory-agent/tests/` — .NET test project scaffold (created by Plan 04/05)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Push notification delivery to real device | PUSH-01 | Requires physical iOS/Android device with FCM/APNs | Install dev build, trigger ticket assignment, verify push received |
| Deep link from push notification | PUSH-05, MOBL-09 | Requires device interaction | Tap push notification, verify correct screen opens |
| QR code scanning for setup | MOBL-02 | Requires camera hardware | Generate QR from web UI, scan in mobile app, verify connection |
| Agent enrollment on real OS | AGNT-03 | Requires cross-platform testing | Install agent on Windows/Linux/macOS, verify enrollment completes |
| Agent runs as system daemon | AGNT-07 | Requires OS service manager | Install service, reboot, verify agent starts automatically |
| MSI/deb/pkg installers | AGNT-12 | Requires platform-specific installer tools | Build each installer, install on target OS, verify agent runs |
| Push grouping by ticket | PUSH-04 | Requires real push delivery to observe grouping | Trigger multiple events on same ticket, verify single push with count |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
