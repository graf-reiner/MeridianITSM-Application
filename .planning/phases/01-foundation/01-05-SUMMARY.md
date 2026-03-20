---
phase: 01-foundation
plan: 05
subsystem: auth
tags: [jwt, jose, bcrypt, nextjs, owner-admin, edge-runtime]

# Dependency graph
requires:
  - phase: 01-foundation
    plan: 02
    provides: "OwnerUser/OwnerSession Prisma models and @meridian/types ownerLoginSchema/OwnerJwtPayload"
  - phase: 01-foundation
    plan: 03
    provides: "JWT auth patterns and OWNER_JWT_SECRET env var convention"
provides:
  - "Owner admin JWT auth with OWNER_JWT_SECRET completely isolated from tenant JWT_SECRET"
  - "POST /api/auth/login endpoint on port 3800 authenticating against OwnerUser table"
  - "POST /api/auth/refresh endpoint for owner token rotation"
  - "GET /api/tenants protected route demonstrating owner JWT verification"
  - "Next.js middleware guarding all owner /api/* routes except /api/auth/*"
affects: [02-billing, owner-admin-frontend]

# Tech tracking
tech-stack:
  added:
    - "jose@^6 — Edge-compatible JWT sign/verify (replaces jsonwebtoken which requires Node.js crypto)"
    - "@node-rs/bcrypt@^1.10.7 — bcrypt password verification (Edge-compatible native binding)"
    - "@meridian/db workspace:* — Prisma client for OwnerUser/OwnerSession/Tenant queries"
    - "@meridian/types workspace:* — ownerLoginSchema, OwnerJwtPayload, refreshTokenSchema"
  patterns:
    - "OWNER_JWT_SECRET env var is entirely separate from JWT_SECRET — tenant tokens cannot authenticate to owner portal"
    - "Edge-runtime-safe JWT: jose SignJWT/jwtVerify instead of jsonwebtoken"
    - "Route-level auth check in tenants/route.ts + middleware-level check in middleware.ts (defense in depth)"
    - "Owner middleware uses jose jwtVerify directly (no helper) to avoid cross-import issues in Edge"

key-files:
  created:
    - "apps/owner/src/lib/owner-auth.ts — signOwnerToken/verifyOwnerToken using jose + OWNER_JWT_SECRET"
    - "apps/owner/src/app/api/auth/login/route.ts — POST login, validates ownerLoginSchema, bcrypt verify, creates OwnerSession"
    - "apps/owner/src/app/api/auth/refresh/route.ts — POST refresh, rotates access + refresh tokens"
    - "apps/owner/src/app/api/tenants/route.ts — GET protected route, verifies owner JWT, returns all tenants"
    - "apps/owner/src/middleware.ts — Next.js Edge middleware guarding /api/* routes"
  modified:
    - "apps/owner/package.json — added jose, @node-rs/bcrypt, @meridian/db, @meridian/types dependencies"

key-decisions:
  - "jose used for JWT (not jsonwebtoken) — Next.js middleware runs in Edge runtime which lacks Node.js crypto module"
  - "@node-rs/bcrypt used for password verification — Edge-compatible native binding vs bcrypt which requires Node.js"
  - "Middleware + route-level auth provides defense in depth — middleware intercepts early, route verifies payload type"
  - "sessionToken stored as last 32 chars of JWT — deterministic identifier without storing full token"

patterns-established:
  - "Owner auth isolation: all owner files use OWNER_JWT_SECRET, never JWT_SECRET"
  - "signOwnerToken/verifyOwnerToken utility pattern — centralized in owner-auth.ts"

requirements-completed: [AUTH-02]

# Metrics
duration: 2min
completed: 2026-03-20
---

# Phase 01 Plan 05: Owner Admin Auth Summary

**Owner admin JWT auth on port 3800 using OWNER_JWT_SECRET with bcrypt login, token refresh, and protected /api/tenants route — completely isolated from tenant JWT_SECRET**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-20T11:44:10Z
- **Completed:** 2026-03-20T11:46:46Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments

- Owner login endpoint authenticates against OwnerUser table with bcrypt, signs JWTs with OWNER_JWT_SECRET
- Token refresh endpoint rotates access and refresh tokens; verifies type claim to prevent access token misuse
- Protected GET /api/tenants route verifies owner JWT before returning global tenant list
- Next.js Edge middleware intercepts all /api/* routes (except /api/auth/*) with OWNER_JWT_SECRET verification
- jose library chosen over jsonwebtoken for Edge runtime compatibility in Next.js middleware

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement owner admin auth with separate JWT and protected route** - `766ca1c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/owner/src/lib/owner-auth.ts` - signOwnerToken/verifyOwnerToken using jose, keyed to OWNER_JWT_SECRET
- `apps/owner/src/app/api/auth/login/route.ts` - POST login: ownerLoginSchema validation, OwnerUser lookup, bcrypt verify, OwnerSession creation
- `apps/owner/src/app/api/auth/refresh/route.ts` - POST refresh: verifyOwnerToken, type='refresh' check, new token pair
- `apps/owner/src/app/api/tenants/route.ts` - GET protected: verifyOwnerToken, type='access' check, prisma.tenant.findMany()
- `apps/owner/src/middleware.ts` - Edge middleware: PUBLIC_PATHS allowlist, jwtVerify with OWNER_JWT_SECRET for all /api/*
- `apps/owner/package.json` - added @meridian/db, @meridian/types, jose, @node-rs/bcrypt

## Decisions Made

- jose used for JWT instead of jsonwebtoken — Next.js middleware runs in Edge runtime (no Node.js crypto)
- @node-rs/bcrypt used for password verification — native binding works in Edge, bcrypt requires Node.js fs
- Both middleware-level and route-level auth implemented (defense in depth)
- sessionToken persisted as last 32 chars of access JWT for session tracking

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. OWNER_JWT_SECRET is already in .env.example.

## Next Phase Readiness

- Owner admin authentication is complete and operational on port 3800
- ROADMAP success criterion #4 ("owner admin portal reachable on port 3800 with its own separate login and JWT") is met
- Owner frontend pages can authenticate via POST /api/auth/login and call GET /api/tenants with the returned JWT
- Phase 2 billing work can use the owner portal infrastructure as its management interface

---
*Phase: 01-foundation*
*Completed: 2026-03-20*
