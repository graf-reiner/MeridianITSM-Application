---
phase: 01-foundation
plan: 06
subsystem: testing
tags: [vitest, unit-testing, integration-testing, tenant-isolation, encryption, bullmq]

# Dependency graph
requires:
  - phase: 01-03
    provides: Encryption utils (packages/core/src/utils/encryption.ts), storage utils (packages/core/src/utils/storage.ts)
  - phase: 01-04
    provides: Worker queue definitions (apps/worker/src/queues/definitions.ts), assertTenantId function
  - phase: 01-05
    provides: API server (apps/api/src/server.ts) with buildApp(), auth routes
provides:
  - Vitest workspace configuration covering all 4 test packages
  - Cross-tenant isolation integration test (packages/db)
  - AES-256-GCM encryption roundtrip unit tests (packages/core)
  - Storage path isolation unit tests (packages/core)
  - Worker tenant assertion unit tests with Redis/BullMQ mocks (apps/worker)
  - Auth endpoint integration test stubs (apps/api)
  - API key test stubs (apps/api)
affects: [02-billing, 03-sla, all future phases requiring test infrastructure]

# Tech tracking
tech-stack:
  added: [vitest ^4.1.0, @vitest/coverage-v8 ^4.1.0]
  patterns:
    - vi.mock with class constructor syntax for mocking BullMQ Queue/Worker
    - Dynamic import in test beforeAll to set env vars before module load
    - Separate vitest.config.ts per package with package-appropriate timeouts

key-files:
  created:
    - vitest.workspace.ts
    - packages/db/vitest.config.ts
    - packages/core/vitest.config.ts
    - apps/api/vitest.config.ts
    - apps/worker/vitest.config.ts
    - packages/db/src/__tests__/tenant-extension.test.ts
    - packages/core/src/__tests__/encryption.test.ts
    - packages/core/src/__tests__/storage.test.ts
    - apps/worker/src/__tests__/worker.test.ts
    - apps/api/src/__tests__/auth.test.ts
    - apps/api/src/__tests__/api-key.test.ts
  modified:
    - packages/db/package.json (added test script)
    - packages/core/package.json (added test script)
    - apps/api/package.json (added test script)
    - apps/worker/package.json (added test script)

key-decisions:
  - "BullMQ Queue mock must use class constructor syntax (not vi.fn().mockImplementation) — vitest requires actual constructor for 'new Queue()' calls"
  - "Encryption test uses dynamic import in it() blocks to ensure ENCRYPTION_KEY env var is set before module initialization"
  - "Worker test mocks both 'bullmq' and '../queues/connection.js' to prevent Redis connections during unit tests"
  - "Auth and tenant-extension tests are integration stubs — they require running PostgreSQL/Redis and are documented as such"

patterns-established:
  - "Pattern: Mock infrastructure dependencies (Redis, BullMQ) with vi.mock at module level for unit tests"
  - "Pattern: Integration tests use beforeAll/afterAll for setup/teardown of real DB records"
  - "Pattern: vitest.config.ts per package with package-specific timeout tuning (30s for DB, 15s for API, default for pure unit)"

requirements-completed: [TNCY-01, TNCY-05, AUTH-01, AUTH-07, INFR-01, INFR-04]

# Metrics
duration: 6min
completed: 2026-03-20
---

# Phase 01 Plan 06: Vitest Workspace and Phase 1 Test Stubs Summary

**Vitest 4.1.0 configured across monorepo workspace with 11 passing unit tests for encryption, storage paths, and worker tenant assertion; integration test stubs for cross-tenant isolation and auth ready for DB-connected execution**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T11:49:32Z
- **Completed:** 2026-03-20T11:55:21Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Vitest 4.1.0 installed at root and in all 4 test packages (db, core, api, worker) with workspace config
- 11 unit tests pass immediately without infrastructure: 6 core tests (encryption roundtrip, storage paths) + 5 worker tests (tenant assertion with mocked Redis/BullMQ)
- Integration test stubs created for cross-tenant isolation (packages/db) and auth endpoints (apps/api) — ready to run against seeded DB
- All packages have `test` script; `pnpm turbo test` pipeline wired

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vitest and create workspace configs** - `facf117` (chore)
2. **Task 2: Create test stubs for critical Phase 1 behaviors** - `c20edea` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `vitest.workspace.ts` - Monorepo workspace config pointing to all 4 test packages
- `packages/db/vitest.config.ts` - DB package config with 30s timeout for integration tests
- `packages/core/vitest.config.ts` - Core package config, default timeout
- `apps/api/vitest.config.ts` - API package config with 15s timeout
- `apps/worker/vitest.config.ts` - Worker package config, default timeout
- `packages/db/src/__tests__/tenant-extension.test.ts` - Cross-tenant isolation integration tests (TNCY-01, TNCY-05)
- `packages/core/src/__tests__/encryption.test.ts` - AES-256-GCM roundtrip unit tests (INFR-04)
- `packages/core/src/__tests__/storage.test.ts` - Tenant-prefixed storage path unit tests (INFR-03)
- `apps/worker/src/__tests__/worker.test.ts` - Worker tenant assertion unit tests with mocks (INFR-01)
- `apps/api/src/__tests__/auth.test.ts` - Auth endpoint integration stubs (AUTH-01)
- `apps/api/src/__tests__/api-key.test.ts` - API key auth stub (AUTH-07)
- `packages/db/package.json` - Added "test": "vitest run"
- `packages/core/package.json` - Added "test": "vitest run"
- `apps/api/package.json` - Added "test": "vitest run"
- `apps/worker/package.json` - Added "test": "vitest run"

## Decisions Made

- Used class constructor syntax in `vi.mock` for BullMQ `Queue` and `Worker` — `vi.fn().mockImplementation(() => ({}))` is not a valid constructor substitute in vitest; class syntax is required
- Dynamic import in encryption test `it()` blocks ensures `process.env.ENCRYPTION_KEY` is set before the module's `getKey()` executes
- Integration tests (tenant-extension, auth) follow the plan spec exactly — they are stubs requiring a running database, not intended to pass in CI without infrastructure

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed BullMQ Queue mock using invalid constructor pattern**
- **Found during:** Task 2 (worker test execution)
- **Issue:** `vi.fn().mockImplementation(() => ({ add: vi.fn(), close: vi.fn() }))` is not a valid constructor — vitest throws "is not a constructor" when `new Queue()` is called
- **Fix:** Replaced with `class MockQueue { add = vi.fn(); close = vi.fn(); constructor() {} }` pattern inside the `vi.mock` factory
- **Files modified:** `apps/worker/src/__tests__/worker.test.ts`
- **Verification:** `pnpm --filter @meridian/worker test` passes 5/5 tests
- **Committed in:** `c20edea` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Fix necessary for tests to run at all. No scope creep.

## Issues Encountered

None beyond the auto-fixed mock constructor bug above.

## User Setup Required

None - no external service configuration required for unit tests. Integration tests (tenant-extension, auth) require running PostgreSQL and Redis (via `docker-compose up`).

## Next Phase Readiness

- Vitest infrastructure is in place for all future phases
- Unit tests for core utilities pass and will catch regressions
- Cross-tenant isolation test is ready to validate against a running DB (ROADMAP success criterion #3)
- Phase 2 (billing) can add tests to the existing workspace structure

---
*Phase: 01-foundation*
*Completed: 2026-03-20*
