---
phase: 01-foundation
plan: "03"
subsystem: api-auth
tags: [fastify, jwt, auth, rbac, tenant, api-key, rate-limit, password-reset, org-lookup]
dependency_graph:
  requires: [01-02]
  provides: [auth-pipeline, login-endpoint, jwt-tokens, tenant-middleware, rbac-middleware, api-key-auth, password-reset, org-lookup]
  affects: [all-api-routes, worker-auth, web-auth]
tech_stack:
  added:
    - "@fastify/jwt@10.0.0 — JWT signing and verification"
    - "@fastify/cors@11.2.0 — CORS plugin"
    - "@fastify/rate-limit@10.3.0 — Redis-backed rate limiting"
    - "@fastify/swagger@9.7.0 — OpenAPI 3.1 documentation"
    - "@node-rs/bcrypt — password verification (verifySync)"
    - "ioredis@5.x — Redis singleton for rate limiting"
    - "next@16.2.0 — org-lookup service (port 3600)"
  patterns:
    - "Fastify preHandler hook chain: authPreHandler -> tenantPreHandler -> planGatePreHandler"
    - "JWT declaration merging via @fastify/jwt module augmentation"
    - "API key auth via SHA-256 hash lookup with expiry check"
    - "Wildcard permission matching: '*' or 'namespace.*' patterns"
    - "Password reset tokens: random 32-byte hex, SHA-256 hashed in DB, 1-hour expiry"
key_files:
  created:
    - apps/api/src/types/fastify.d.ts
    - apps/api/src/lib/redis.ts
    - apps/api/src/lib/permissions.ts
    - apps/api/src/plugins/cors.ts
    - apps/api/src/plugins/swagger.ts
    - apps/api/src/plugins/rate-limit.ts
    - apps/api/src/plugins/auth.ts
    - apps/api/src/plugins/tenant.ts
    - apps/api/src/plugins/rbac.ts
    - apps/api/src/plugins/api-key.ts
    - apps/api/src/plugins/plan-gate.ts
    - apps/api/src/routes/auth/index.ts
    - apps/api/src/routes/auth/login.ts
    - apps/api/src/routes/auth/refresh.ts
    - apps/api/src/routes/auth/password-reset.ts
    - apps/api/src/routes/v1/index.ts
    - apps/api/src/routes/external/index.ts
    - apps/api/src/services/auth.service.ts
    - apps/api/src/services/user.service.ts
    - apps/org-lookup/package.json
    - apps/org-lookup/next.config.ts
    - apps/org-lookup/tsconfig.json
    - apps/org-lookup/src/app/layout.tsx
    - apps/org-lookup/src/app/api/resolve/route.ts
  modified:
    - apps/api/src/server.ts
    - apps/api/src/index.ts
    - packages/db/src/client.ts
    - packages/db/package.json
decisions:
  - "[Phase 01-03]: ioredis v5 uses named export 'Redis' (not default export) — import { Redis } from 'ioredis'"
  - "[Phase 01-03]: @types/pg version conflict between @prisma/adapter-pg and direct pg usage — resolved via 'as any' cast on PrismaPg constructor"
  - "[Phase 01-03]: planGatePreHandler is a no-op stub in Phase 1 — Phase 2 will implement 402 Payment Required + feature flag enforcement"
  - "[Phase 01-03]: Org-lookup service is a functional stub — Cloudflare Worker routing deferred to Phase 2; dev uses localhost:4000 directly"
  - "[Phase 01-03]: password-reset/request always returns 200 to prevent email enumeration attacks"
metrics:
  duration: "12 minutes"
  completed_date: "2026-03-20"
  tasks: 3
  files_created: 24
  files_modified: 4
---

# Phase 1 Plan 3: Fastify Auth Pipeline and Org-Lookup Summary

**One-liner:** Fastify 5 server with full JWT auth pipeline (CORS -> JWT -> Rate Limit -> Auth -> Tenant -> RBAC -> planGate), bcrypt login, API key auth, and org-lookup subdomain resolution service.

## What Was Built

### Task 1: Fastify server wiring and plugins infrastructure

Built the complete Fastify 5 plugin architecture with the correct middleware pipeline order:

1. `apps/api/src/server.ts` — full server assembly with scoped protected and external route groups
2. `apps/api/src/types/fastify.d.ts` — TypeScript declaration merging for `FastifyRequest` (tenant, tenantId, currentUser, apiKey) and `@fastify/jwt` (payload/user types)
3. `apps/api/src/lib/redis.ts` — ioredis singleton with BullMQ-compatible options
4. `apps/api/src/lib/permissions.ts` — PERMISSIONS constants + `hasPermission()` with wildcard support (`*`, `namespace.*`)
5. `apps/api/src/plugins/auth.ts` — JWT verification preHandler using `request.jwtVerify()`
6. `apps/api/src/plugins/tenant.ts` — tenant + user injection preHandler (global prisma for Tenant model, then user with roles)
7. `apps/api/src/plugins/rbac.ts` — `requirePermission(permission)` factory and no-op `rbacPreHandler`
8. `apps/api/src/plugins/api-key.ts` — `Authorization: ApiKey <key>` header auth with SHA-256 hash lookup + expiry check
9. `apps/api/src/plugins/plan-gate.ts` — no-op stub (Phase 2 will add plan enforcement)
10. Supporting plugins: cors, swagger (OpenAPI 3.1), rate-limit (Redis-backed, AUTH_RATE_LIMIT 5/15min)

### Task 2: Auth services and route handlers

1. `auth.service.ts` — `validateCredentials` (bcrypt verifySync), `getUserRoles`, `generateTokens` (15m access / 7d refresh), `createPasswordResetToken` (SHA-256, 1h expiry), `validatePasswordResetToken`, `resetPassword` (with transaction)
2. `user.service.ts` — `findById` and `findByEmail` with role slugs
3. `routes/auth/login.ts` — POST /api/auth/login using `loginWithTenantSchema` (email + password + tenantSlug), resolves tenant by slug first, then validates credentials
4. `routes/auth/refresh.ts` — POST /api/auth/refresh, validates type=refresh in JWT, issues new token pair
5. `routes/auth/password-reset.ts` — request (always 200, logs token to console for dev), reset (validates + updates user + marks token used)
6. `routes/health/index.ts` — GET /api/health with Redis ping check, returns 503 if degraded

### Task 3: Org-lookup service stub

Created `apps/org-lookup` as a minimal Next.js 16 app on port 3600:
- `GET /api/resolve?subdomain=<x>` returns `{ tenantId, name, backendUrl }` or 404
- `backendUrl` defaults to `http://localhost:4000` if not set on the Tenant record
- `pnpm install` run to register the new workspace package

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ioredis v5 named export vs default export**
- **Found during:** Task 1
- **Issue:** `import Redis from 'ioredis'` fails — ioredis v5 exports `Redis` as a named export, not default
- **Fix:** Changed to `import { Redis } from 'ioredis'`
- **Files modified:** `apps/api/src/lib/redis.ts`
- **Commit:** `365878a`

**2. [Rule 1 - Bug] @types/pg version conflict in @meridian/db**
- **Found during:** Task 1 (building packages/db to verify types)
- **Issue:** Two versions of `@types/pg` (8.11.11 and 8.18.0) were in the dependency tree, causing type incompatibility when passing `pg.Pool` to `PrismaPg`
- **Fix:** Added `as any` cast on PrismaPg constructor argument in `packages/db/src/client.ts`. Also added `@types/pg` to db devDependencies.
- **Files modified:** `packages/db/src/client.ts`, `packages/db/package.json`
- **Commit:** `365878a`

**3. [Rule 2 - Missing] @types/pg missing from packages/db devDependencies**
- **Found during:** Task 1
- **Issue:** `pg` was a direct dependency but `@types/pg` was not listed — `tsc` failed with `Could not find a declaration file for module 'pg'`
- **Fix:** `pnpm --filter @meridian/db add -D @types/pg`
- **Files modified:** `packages/db/package.json`, `pnpm-lock.yaml`
- **Commit:** `365878a`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| ioredis named import | v5 uses named exports per package changelog |
| `as any` cast on PrismaPg | Dual @types/pg versions from transitive dependencies — cast avoids fragile version pinning |
| planGatePreHandler no-op | Phase 2 will implement — stub wires the position in the pipeline |
| Org-lookup Cloudflare routing deferred | Dev environment uses localhost:4000 directly — routing is a production concern |
| Password reset always returns 200 | Security best practice — prevents email enumeration |

## Self-Check: PASSED

All key files verified present. All 3 task commits verified in git log. TypeScript compiles with 0 errors.
