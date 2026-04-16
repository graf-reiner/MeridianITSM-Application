---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (unit/integration), Playwright 1.56+ (E2E stubs) |
| **Config file** | `packages/db/vitest.config.ts`, `apps/api/vitest.config.ts` |
| **Quick run command** | `pnpm -r run test` |
| **Full suite command** | `pnpm turbo test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -r run test`
- **After every plan wave:** Run `pnpm turbo test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | FNDN-01 | smoke | `pnpm install && pnpm turbo build` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | FNDN-06 | smoke | `docker compose up -d && docker compose ps` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | FNDN-02,TNCY-01 | unit | `pnpm --filter db test` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | TNCY-05 | integration | `pnpm --filter db test -- --grep "tenant isolation"` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | FNDN-07 | smoke | `pnpm --filter db prisma db seed` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | AUTH-01,AUTH-02 | integration | `pnpm --filter api test -- --grep "auth"` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | TNCY-04 | integration | `pnpm --filter api test -- --grep "tenant middleware"` | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 2 | AUTH-03,AUTH-04,AUTH-05 | unit | `pnpm --filter api test -- --grep "rbac"` | ❌ W0 | ⬜ pending |
| 01-03-04 | 03 | 2 | AUTH-07 | integration | `pnpm --filter api test -- --grep "api-key"` | ❌ W0 | ⬜ pending |
| 01-03-05 | 03 | 2 | AUTH-08 | integration | `pnpm --filter api test -- --grep "rate-limit"` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 2 | INFR-01 | integration | `pnpm --filter worker test` | ❌ W0 | ⬜ pending |
| 01-04-02 | 04 | 2 | INFR-03 | smoke | `pnpm --filter api test -- --grep "minio"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/db/vitest.config.ts` — vitest config for DB package
- [ ] `apps/api/vitest.config.ts` — vitest config for API
- [ ] `apps/worker/vitest.config.ts` — vitest config for worker
- [ ] vitest 4.x installed as devDependency in root

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker Compose services start | FNDN-06 | Requires Docker runtime | Run `docker compose up -d`, verify all 4 services healthy with `docker compose ps` |
| Owner admin on port 3800 | TNCY-06 | Requires running both apps | Start both apps, verify owner admin login works on 3800, verify it's not accessible from main app port |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
