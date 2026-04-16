---
phase: 02-billing-and-owner-admin
plan: 04
subsystem: auth
tags: [totp, mfa, jwt, jose, otpauth, qrcode, impersonation, fastify, nextjs, middleware]

requires:
  - phase: 01-foundation
    provides: owner auth (signOwnerToken/verifyOwnerToken with jose), OwnerUser Prisma model with totpSecret/totpEnabled fields

provides:
  - TOTP secret generation, QR code creation, and OTP verification via otpauth library
  - Two-step TOTP MFA login flow (password -> tempToken -> TOTP verify -> full session)
  - TOTP setup enrollment endpoint (generate secret -> confirm with code -> enable)
  - IP allowlist Edge middleware (CIDR + exact match, optional for dev)
  - 15-minute read-only impersonation JWT signed with IMPERSONATION_JWT_SECRET
  - Fastify preHandler that blocks POST/PUT/PATCH/DELETE for impersonation sessions

affects:
  - 02-billing-and-owner-admin (impersonation token consumed by owner admin dashboard)
  - phase-05-mobile (auth patterns)

tech-stack:
  added:
    - otpauth@9.5.0 (TOTP generation and verification)
    - qrcode@1.5.4 (QR code data URL generation)
    - @types/qrcode@1.5.6 (TypeScript types)
    - vitest@4.1.0 (test runner added to owner app)
    - bullmq (added to apps/api to resolve pre-existing webhook route import error)
  patterns:
    - Two-step TOTP enrollment: generate secret (stored unactivated) -> user scans QR -> user enters code -> enable
    - Temp token pattern: short-lived (5min) totp-pending JWT gates second auth factor
    - IMPERSONATION_JWT_SECRET separate from OWNER_JWT_SECRET for least-privilege secret sharing
    - Fastify preHandler composition: authPreHandler -> tenantPreHandler -> planGatePreHandler -> blockImpersonationWrites
    - Edge-compatible CIDR matching with bitwise operations (no Node.js net module)

key-files:
  created:
    - apps/owner/src/lib/totp.ts (generateTotpSecret, generateQrCode, verifyTotp)
    - apps/owner/src/lib/totp.test.ts (5 tests)
    - apps/owner/src/lib/impersonation.ts (generateImpersonationToken, verifyImpersonationToken)
    - apps/owner/src/lib/impersonation.test.ts (4 tests)
    - apps/owner/src/app/api/auth/totp-verify/route.ts (TOTP MFA second step)
    - apps/owner/src/app/api/auth/totp-setup/route.ts (two-step enrollment)
    - apps/owner/vitest.config.ts (test runner config for owner app)
    - apps/api/src/middleware/impersonation-guard.ts (blockImpersonationWrites preHandler)
    - apps/api/src/middleware/impersonation-guard.test.ts (6 tests)
  modified:
    - apps/owner/src/app/api/auth/login/route.ts (added totpEnabled branch + signTotpPendingToken)
    - apps/owner/src/middleware.ts (added IP allowlist check before JWT verify)
    - apps/api/src/server.ts (registered blockImpersonationWrites on protected scope)
    - apps/owner/package.json (added otpauth, qrcode, vitest, test script)
    - apps/api/package.json (added bullmq)

key-decisions:
  - "IMPERSONATION_JWT_SECRET used (not OWNER_JWT_SECRET) so main API only needs the impersonation key, not the full owner auth secret"
  - "IP allowlist is optional (no env var = no restriction) to allow unrestricted local dev"
  - "TOTP two-step enrollment prevents locking out: secret generated but not activated until user proves authenticator app works"
  - "blockImpersonationWrites registered as final preHandler after authPreHandler so request.user is populated before check"

patterns-established:
  - "Pattern: TOTP login uses short-lived (5min) temp token with type:totp-pending to gate the second factor"
  - "Pattern: Impersonation guard checks both readOnly:true AND impersonatedBy for defense in depth"
  - "Pattern: IP allowlist uses pure bitwise CIDR math (Edge runtime safe, no Node.js net module)"

requirements-completed: [OADM-01, OADM-02, OADM-06]

duration: 9min
completed: 2026-03-20
---

# Phase 02 Plan 04: Owner Admin Security Foundations Summary

**TOTP MFA two-step login, optional IP allowlist Edge middleware, and read-only impersonation JWT with Fastify write-block guard using otpauth + jose libraries**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-03-20T14:05:09Z
- **Completed:** 2026-03-20T14:14:00Z
- **Tasks:** 2 (both with TDD)
- **Files modified:** 13

## Accomplishments

- Owner admin login now supports TOTP MFA: password step returns `requiresTotp: true` + temp token when enabled, TOTP verify step issues full session
- TOTP setup has two-step enrollment (generate secret + QR code, then confirm with code before enabling) preventing lockout
- Owner admin middleware checks `OWNER_ADMIN_IP_ALLOWLIST` (comma-separated IPs/CIDRs) before JWT verification; skipped when env var unset (dev mode)
- Impersonation token generates 15-min JWT with `readOnly: true`, `impersonatedBy`, `tenantId` using `IMPERSONATION_JWT_SECRET`
- `blockImpersonationWrites` Fastify preHandler blocks POST/PUT/PATCH/DELETE for impersonation sessions, registered in protected route scope

## Task Commits

Each task was committed atomically:

1. **Task 1: TOTP library and impersonation token generator** - `5ea3abc` (feat)
2. **Task 2: Owner login TOTP flow, IP allowlist, impersonation guard** - `2e588a9` (feat)

**Plan metadata:** (assigned after SUMMARY commit)

_Note: Both tasks used TDD (RED -> GREEN cycle)_

## Files Created/Modified

- `apps/owner/src/lib/totp.ts` - TOTP secret generation, QR code, and OTP verification using otpauth
- `apps/owner/src/lib/totp.test.ts` - 5 tests for TOTP library
- `apps/owner/src/lib/impersonation.ts` - 15-min read-only impersonation JWT using IMPERSONATION_JWT_SECRET
- `apps/owner/src/lib/impersonation.test.ts` - 4 tests for impersonation token
- `apps/owner/src/app/api/auth/login/route.ts` - Updated with TOTP pending branch
- `apps/owner/src/app/api/auth/totp-verify/route.ts` - Second auth factor verification
- `apps/owner/src/app/api/auth/totp-setup/route.ts` - Two-step TOTP enrollment
- `apps/owner/src/middleware.ts` - IP allowlist added before JWT verification
- `apps/owner/vitest.config.ts` - Vitest config for owner app
- `apps/api/src/middleware/impersonation-guard.ts` - Fastify preHandler blocking writes
- `apps/api/src/middleware/impersonation-guard.test.ts` - 6 tests for write-block guard
- `apps/api/src/server.ts` - blockImpersonationWrites registered on protected scope

## Decisions Made

- **IMPERSONATION_JWT_SECRET**: Used a separate secret for impersonation tokens (not OWNER_JWT_SECRET) so the main API only needs the impersonation key, not full owner auth. Both apps share only this key. Per RESEARCH.md Open Question 3 recommendation.
- **IP allowlist optional**: No env var = no restriction (dev mode). Production deployments set `OWNER_ADMIN_IP_ALLOWLIST`.
- **Two-step TOTP enrollment**: Secret saved to DB on generate, only activated after user proves the authenticator app works with a valid code. Prevents lockout.
- **blockImpersonationWrites position**: Registered as fourth preHandler (after auth, tenant, planGate) so `request.user` is populated before the impersonation check runs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added bullmq to apps/api dependencies**
- **Found during:** Task 2 (TypeScript check)
- **Issue:** `apps/api/src/routes/billing/webhook.ts` imports from `bullmq` but the package was not in `apps/api/package.json`. tsc failed with `Cannot find module 'bullmq'`.
- **Fix:** Ran `pnpm --filter api add bullmq`
- **Files modified:** `apps/api/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter api exec tsc --noEmit` exits 0
- **Committed in:** `2e588a9` (Task 2 commit)

**2. [Rule 3 - Blocking] Added vitest to apps/owner (test infrastructure)**
- **Found during:** Task 1 (TDD RED phase)
- **Issue:** owner app had no vitest installed or configured; plan required unit tests
- **Fix:** Ran `pnpm --filter owner add -D vitest`, created `vitest.config.ts`, added `test` script to `package.json`
- **Files modified:** `apps/owner/package.json`, `apps/owner/vitest.config.ts`
- **Verification:** 9 tests pass
- **Committed in:** `5ea3abc` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking dependencies)
**Impact on plan:** Both auto-fixes were necessary for tests to run and TypeScript to compile. No scope creep.

## Issues Encountered

- The linter/formatter automatically applied edits to `login/route.ts` between write attempts. Resolved by reading current state before each edit operation.

## User Setup Required

Environment variables to add to `apps/owner/.env`:
- `IMPERSONATION_JWT_SECRET` - Minimum 32-character secret, shared with `apps/api` for verifying impersonation tokens

Environment variables to optionally add to `apps/owner/.env`:
- `OWNER_ADMIN_IP_ALLOWLIST` - Comma-separated IPs/CIDRs (e.g., `10.0.0.0/8,192.168.1.0/24`). Leave unset for dev mode (no restriction).

## Next Phase Readiness

- TOTP MFA foundation complete — owner admin dashboard pages can use the full auth flow
- Impersonation token generation ready — owner dashboard can call `generateImpersonationToken` to start impersonation sessions
- Main API write-block guard active — impersonation sessions are read-only at the API layer
- Next: owner admin dashboard (plan 02-05+): tenant list, MRR/ARR metrics, tenant detail, impersonation flow

---
*Phase: 02-billing-and-owner-admin*
*Completed: 2026-03-20*
