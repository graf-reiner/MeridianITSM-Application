import { test, expect } from '@playwright/test';

/**
 * Phase 8 — CASR-05 / D-04 E2E scaffold (orphan empty state + Link-a-CI flow).
 *
 * Wave 0 ships as `test.skip(...)` so `playwright test --list --grep
 * "asset-link-ci"` discovers exactly one test. Wave 5 (plan 08-06) removes
 * the `.skip` and implements the body.
 *
 * Wave 5 implementation plan (per PATTERNS.md section 27):
 *   1. Login as MSP admin via apps/web/tests/helpers.ts → loginAsMspAdmin(page).
 *   2. Navigate to /dashboard/assets and open an orphan Asset (no linked CI)
 *      — seed fixture must provide AST-ORPHAN.
 *   3. Click the `Technical Profile` tab.
 *   4. Expect empty-state text matching /No linked Configuration Item/i.
 *   5. Expect `Link a CI` button visible; click it.
 *   6. Expect CIPicker modal opens (from apps/web/src/components/cmdb/CIPicker.tsx).
 *   7. Type "srv" in the search input; wait for
 *      /api/v1/cmdb/cis?search=srv response (ok).
 *   8. Click first option; expect PATCH /api/v1/cmdb/cis/:id to set assetId
 *      (the link write — caller handles the PATCH, CIPicker emits onSelect).
 *   9. Expect tab now renders hardware fields (linked-CI success).
 *
 * Multi-tenancy: /api/v1/cmdb/cis?search=... filters server-side by session
 * tenantId — no client-side tenant param. Documented in CIPicker.tsx header.
 */
test.skip('Orphan Asset shows Link-a-CI empty state and link flow works (Phase 8 / CASR-05 / D-04)', async ({
  page,
}) => {
  // Wave 5 body — see Wave 5 implementation plan above.
  expect(page).toBeTruthy();
});
