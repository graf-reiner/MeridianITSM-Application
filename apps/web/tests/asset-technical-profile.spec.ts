import { test, expect } from '@playwright/test';

/**
 * Phase 8 — CASR-05 E2E scaffold.
 *
 * Wave 0 ships as `test.skip(...)` so `playwright test --list --grep
 * "asset-technical-profile"` discovers exactly one test. Wave 5 (plan 08-06)
 * removes the `.skip` and implements the body.
 *
 * Wave 5 implementation plan (per PATTERNS.md section 26):
 *   1. Login as MSP admin via apps/web/tests/helpers.ts → loginAsMspAdmin(page).
 *   2. Navigate to /dashboard/assets and click into an asset that is linked
 *      to a CmdbCiServer CI (seed fixture must provide one — see
 *      packages/db/src/seeds/cmdb-reference.ts for seed).
 *   3. Click the `Technical Profile` tab (button role, case-insensitive).
 *   4. Wait for `/api/v1/cmdb/cis/:id` response (ok).
 *   5. Expect rendered labels: Operating System, CPU, Memory (case-insensitive).
 *   6. Expect a software list with at least one row from
 *      /api/v1/cmdb/cis/:id/software (endpoint lands in Wave 5 plan 08-06).
 *
 * Multi-tenancy: loginAsMspAdmin locks the session into a single tenant;
 * /api/v1/cmdb/cis/:id server-side filters by tenantId (existing contract).
 */
test.skip('Asset Technical Profile tab renders linked CI hardware (Phase 8 / CASR-05)', async ({
  page,
}) => {
  // Wave 5 body — see Wave 5 implementation plan above.
  expect(page).toBeTruthy();
});
