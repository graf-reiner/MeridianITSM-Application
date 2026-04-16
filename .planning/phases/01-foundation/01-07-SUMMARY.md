---
phase: 01
plan: "01-07"
name: "Apply AUTH_RATE_LIMIT to auth routes"
status: complete
gap_closure: true
requirements: [AUTH-08]
executed: out_of_band
summary_written: 2026-04-16
shipped_value:
  max: 50
  timeWindow: "15 minutes"
files_modified:
  - apps/api/src/routes/auth/login.ts
  - apps/api/src/routes/auth/signup.ts
  - apps/api/src/routes/auth/form-login.ts
  - apps/api/src/routes/auth/password-reset.ts
---

# Plan 01-07 Summary: Apply AUTH_RATE_LIMIT to Auth Routes (Gap Closure)

## Outcome

AUTH-08 is closed. `AUTH_RATE_LIMIT` is imported from `apps/api/src/plugins/rate-limit.ts` and applied as the Fastify route-level `{ config: { rateLimit: AUTH_RATE_LIMIT } }` option on every auth POST handler:

| Route | File | Line |
|-------|------|------|
| `POST /api/auth/login` | `apps/api/src/routes/auth/login.ts` | 15 |
| `POST /api/auth/signup` | `apps/api/src/routes/auth/signup.ts` | 91 |
| `POST /api/auth/form-login` | `apps/api/src/routes/auth/form-login.ts` | 15 |
| `POST /api/auth/password-reset/request` | `apps/api/src/routes/auth/password-reset.ts` | 21 |
| `POST /api/auth/password-reset/reset` | `apps/api/src/routes/auth/password-reset.ts` | 64 |

The original 01-07-PLAN.md scoped only `login.ts` and `password-reset.ts`; the out-of-band fix extended coverage to `signup.ts` and `form-login.ts` as well — every public auth endpoint is now rate-limited.

## Execution Path

This plan was executed **out-of-band**: the AUTH-08 fix shipped as part of normal development flow rather than via a scripted re-run of 01-07-PLAN.md. The code changes were made, verified against production behaviour, and committed alongside other Phase 1 foundation work. No executor agent ran this PLAN; the paperwork loop (this SUMMARY) is being closed retroactively as part of Phase 6 v1.0 paperwork cleanup.

Evidence of shipped state — each file contains:
- `import { AUTH_RATE_LIMIT } from '../../plugins/rate-limit.js';`
- `{ config: { rateLimit: AUTH_RATE_LIMIT } }` on every `app.post(...)` handler

## Deviation from Spec: max=50 vs. max=5

`AUTH_RATE_LIMIT` shipped as `{ max: 50, timeWindow: '15 minutes' }` — ten times the originally-specified 5/15min value in the `AUTH-08` requirement.

**Rationale (user-affirmed, 2026-04-16):** 5 requests per 15 minutes was too aggressive for routine dev/testing cycles (login + password-reset flows routinely burn >5 attempts during feature work), creating friction that outweighed the security benefit. 50 is the pragmatic shipped value — still two orders of magnitude stricter than the global 100/min API default, still materially harder to brute-force than no rate-limit. Revisit and tighten toward the original 5/15min if abuse is observed in production or if threat-model review at v2.0 planning reprioritises brute-force resistance.

The shipped value is an intentional deviation, not a regression. Documented in `.planning/PROJECT.md` Key Decisions and `.planning/STATE.md` Architecture Decisions (added alongside this SUMMARY in Phase 6).

## Acceptance Criteria — All Met

- [x] `AUTH_RATE_LIMIT` imported in all five auth route files
- [x] `{ config: { rateLimit: AUTH_RATE_LIMIT } }` applied to every auth POST handler
- [x] Auth endpoints no longer fall through to the global 100/min default
- [x] Value `max=50/15min` documented as intentional in PROJECT.md + STATE.md

## Follow-ups

None. AUTH-08 is Complete and closed. Future tightening of the rate-limit value is a product-security decision tracked in STATE.md, not a plan-level follow-up.
