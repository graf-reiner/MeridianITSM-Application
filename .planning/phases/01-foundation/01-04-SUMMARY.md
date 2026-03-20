---
phase: 01-foundation
plan: "04"
subsystem: worker-infrastructure
tags: [bullmq, workers, encryption, storage, minio, health-endpoint, tenant-isolation]
dependency_graph:
  requires: ["01-02"]
  provides: ["worker-process", "core-utilities", "health-endpoint"]
  affects: ["all-phases"]
tech_stack:
  added:
    - "@aws-sdk/client-s3: S3/MinIO storage client"
    - "@aws-sdk/s3-request-presigner: Presigned URL generation"
    - "@types/node: Node.js type definitions for core package"
    - "@types/pg@8.11.11: Pinned version to resolve @types/pg version conflict"
  patterns:
    - "BullMQ plain connection options (host/port) to avoid ioredis version conflicts"
    - "assertTenantId guard function pattern for worker payload validation"
    - "AES-256-GCM with per-encrypt random IV + auth tag"
    - "Tenant-prefixed MinIO paths: {tenantId}/{resource}/{filename}"
key_files:
  created:
    - "apps/worker/src/queues/connection.ts: Redis connection singleton with bullmqConnection options object"
    - "apps/worker/src/queues/definitions.ts: Queue names, TenantJobData interface, assertTenantId guard"
    - "apps/worker/src/workers/sla-monitor.ts: SLA monitoring worker stub (concurrency=5)"
    - "apps/worker/src/workers/email-notification.ts: Email notification worker stub (concurrency=10)"
    - "apps/worker/src/workers/email-polling.ts: Email polling worker stub (concurrency=3)"
    - "apps/worker/src/workers/cmdb-reconciliation.ts: CMDB reconciliation worker stub (concurrency=2)"
    - "packages/core/src/utils/encryption.ts: AES-256-GCM encrypt/decrypt using node:crypto"
    - "packages/core/src/utils/storage.ts: S3/MinIO storage with tenant-prefixed paths"
    - "packages/core/src/services/tenant.service.ts: TenantService with findById/findBySlug/findBySubdomain/findActive/findAllActive"
    - "apps/api/src/routes/health/index.ts: Health endpoint returning status/timestamp/version/checks"
  modified:
    - "apps/worker/src/index.ts: Full worker entry point with graceful SIGTERM/SIGINT shutdown"
    - "packages/core/src/index.ts: Exports encrypt, decrypt, uploadFile, getFileUrl, deleteFile, buildStoragePath, TenantService"
    - "packages/core/package.json: Added AWS SDK deps and @types/node"
    - "packages/db/package.json: Pinned @types/pg to 8.11.11"
decisions:
  - "Used plain host/port object for BullMQ connection (not Redis instance) to avoid ioredis version conflict between apps/worker (5.10.1) and bullmq peer dep (5.9.3)"
  - "Encryption key validated at call time (getKey() function) rather than module load to allow safe import without ENCRYPTION_KEY set"
  - "Health endpoint uses existing redis singleton from lib/redis.ts rather than creating a new connection"
  - "@types/pg pinned to 8.11.11 to resolve type conflict between @types/pg@8.18.0 and pg@8.20.0 bundled types"
metrics:
  duration: "10 minutes"
  completed_date: "2026-03-20"
  tasks_completed: 2
  files_created: 10
  files_modified: 4
---

# Phase 01 Plan 04: BullMQ Workers, Core Utilities, and Health Endpoint Summary

**One-liner:** BullMQ worker process with tenant assertion guard, AES-256-GCM encryption, MinIO storage utilities, and health check endpoint with Redis connectivity probe.

## What Was Built

### Task 1: BullMQ Worker Infrastructure

Four BullMQ worker stubs registered in a standalone Node.js process with tenant assertion enforced on every job:

- **Queue connection** (`connection.ts`): Uses plain `{ host, port }` options object instead of a pre-created Redis instance to avoid ioredis version conflicts between the worker package (5.10.1) and bullmq's peer dependency (5.9.3).
- **Queue definitions** (`definitions.ts`): `QUEUE_NAMES` constants, `TenantJobData` interface, and `assertTenantId()` type assertion function that throws `Error` if `tenantId` is absent or not a string.
- **Worker stubs**: sla-monitor (concurrency 5), email-notification (concurrency 10), email-polling (concurrency 3), cmdb-reconciliation (concurrency 2). Each calls `assertTenantId(job.id, job.data)` as the first line.
- **Entry point** (`index.ts`): Imports all 4 workers, logs active worker names, handles `SIGTERM`/`SIGINT` with graceful shutdown via `worker.close()`.

### Task 2: Core Utilities and Health Endpoint

- **Encryption** (`packages/core/src/utils/encryption.ts`): `encrypt()` and `decrypt()` using AES-256-GCM with 12-byte random IV per encrypt call, auth tag stored inline. Key validated at call time from `ENCRYPTION_KEY` env var (64 hex chars = 32 bytes).
- **Storage** (`packages/core/src/utils/storage.ts`): `buildStoragePath(tenantId, resource, filename)` returns `{tenantId}/{resource}/{filename}`. `uploadFile()`, `getFileUrl()` (presigned URL), `deleteFile()`. S3Client configured with `forcePathStyle: true` for MinIO compatibility.
- **TenantService** (`packages/core/src/services/tenant.service.ts`): Static methods `findById`, `findBySlug`, `findBySubdomain`, `findActive`, `findAllActive` using the global (non-tenant-scoped) Prisma client.
- **Health endpoint** (`apps/api/src/routes/health/index.ts`): `GET /api/health` pings Redis via the existing singleton. Returns `{ status, timestamp, version, checks }` with HTTP 200 if all checks pass, 503 if any fail.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ioredis version conflict with BullMQ**
- **Found during:** Task 1 TypeScript compilation
- **Issue:** `apps/worker` pulled ioredis@5.10.1 but bullmq@5.71.0 depends on ioredis@5.9.3. Passing a Redis instance as BullMQ connection caused TypeScript structural type mismatch between the two ioredis versions.
- **Fix:** Changed connection export to a plain `{ host, port, maxRetriesPerRequest: null, enableReadyCheck: false }` options object. BullMQ accepts this directly without needing a Redis instance. The Redis instance (`redisConnection`) is still exported separately for non-BullMQ use cases.
- **Files modified:** `apps/worker/src/queues/connection.ts`, all worker stubs, `definitions.ts`
- **Commit:** 269d5f9

**2. [Rule 3 - Blocking] @types/node missing from packages/core**
- **Found during:** Task 2 TypeScript compilation
- **Issue:** `packages/core` had no `@types/node` devDependency, causing `Buffer`, `process`, and `node:crypto` to be unresolvable.
- **Fix:** `pnpm add --filter @meridian/core --save-dev @types/node`
- **Files modified:** `packages/core/package.json`, `pnpm-lock.yaml`

**3. [Rule 3 - Blocking] @types/pg version conflict in packages/db**
- **Found during:** Task 2 build (needed db to be built before core could typecheck)
- **Issue:** `pnpm add --save-dev @types/pg` installed 8.18.0, but `pg@8.20.0` ships with internal `@types/pg@8.11.11` typings. TypeScript found both versions and raised structural incompatibility on `ClientBase.connect()` return type.
- **Fix:** Pinned `@types/pg` to `8.11.11` in `packages/db` to match the pg-bundled version.
- **Files modified:** `packages/db/package.json`, `pnpm-lock.yaml`

**4. [Rule 1 - Bug] @meridian/db not exporting Prisma model types**
- **Found during:** Task 2 — `import type { Tenant } from '@prisma/client'` failed in core
- **Issue:** `packages/core` doesn't have `@prisma/client` as a dependency and importing it directly would create a tight coupling.
- **Fix:** Used `type Tenant = Awaited<ReturnType<PrismaClient['tenant']['findUniqueOrThrow']>>` to derive the type from the already-available `PrismaClient` export from `@meridian/db`. No extra dependency needed.
- **Files modified:** `packages/core/src/services/tenant.service.ts`

## Verification Results

- `npx tsc --noEmit -p apps/worker/tsconfig.json` — PASS (no errors)
- `npx tsc --noEmit -p packages/core/tsconfig.json` — PASS (no errors)
- `npx tsc --noEmit -p apps/api/tsconfig.json` — PASS (no errors)
- All 4 worker files contain `assertTenantId` (import + call = 2 matches each)
- `pnpm turbo build` — 7 successful, 0 failed

## Requirements Addressed

| Requirement | Status |
|-------------|--------|
| INFR-01: BullMQ workers (SLA, email, email-polling, CMDB) | Done — stubs with tenant assertion |
| INFR-02: Redis for queue management | Done — connection singleton used by workers |
| INFR-03: MinIO/S3 storage with tenantId-prefixed paths | Done — buildStoragePath enforces prefix |
| INFR-04: AES encryption for email passwords | Done — encrypt/decrypt in packages/core |
| INFR-05: Health check endpoint | Done — GET /api/health returns status + Redis check |
| INFR-06: Org lookup service (subdomain routing) | Out of scope for this plan — deferred to later |

## Self-Check: PASSED

Files verified to exist:
- apps/worker/src/queues/connection.ts — FOUND
- apps/worker/src/queues/definitions.ts — FOUND
- apps/worker/src/workers/sla-monitor.ts — FOUND
- apps/worker/src/workers/email-notification.ts — FOUND
- apps/worker/src/workers/email-polling.ts — FOUND
- apps/worker/src/workers/cmdb-reconciliation.ts — FOUND
- packages/core/src/utils/encryption.ts — FOUND
- packages/core/src/utils/storage.ts — FOUND
- packages/core/src/services/tenant.service.ts — FOUND
- apps/api/src/routes/health/index.ts — FOUND

Commits verified:
- 269d5f9 — feat(01-04): BullMQ worker infrastructure with tenant assertion
- bbc1575 — feat(01-04): core utilities (encryption, storage, tenant service) and health endpoint
