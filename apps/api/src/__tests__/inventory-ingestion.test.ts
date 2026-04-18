import { describe, it } from 'vitest';

/**
 * Phase 8 — CASR-06 reroute scaffold.
 *
 * Integration-test target for POST /api/v1/agents/inventory after the route
 * is modified (Wave 1, plan 08-02) to call `upsertServerExtensionByAsset`
 * synchronously. Asset is NEVER touched by this path.
 *
 * Wave 1 pattern: mock `@meridian/db` Prisma; invoke the route handler via
 * Fastify `inject()`; assert via `txServerUpsert.mock.calls`. See
 * apps/api/src/__tests__/cmdb-service.test.ts for the mock scaffold shape.
 *
 * Every it.todo title matches the VALIDATION.md `-t "..."` filter strings.
 */
describe('POST /api/v1/agents/inventory (Phase 8 / CASR-06 reroute)', () => {
  it.todo('POST /agents/inventory writes to CmdbCiServer not Asset');
  it.todo('POST /agents/inventory auto-creates CI for orphan Asset');
});
