import { test, expect } from '@playwright/test';

/**
 * Phase 8 — CASR-01 / CASR-05 E2E scaffold (negative assertion).
 *
 * Wave 0 ships as `test.skip(...)` so `playwright test --list --grep
 * "asset-edit-no-tech-fields"` discovers exactly one test. Wave 5 (plan
 * 08-06) removes the `.skip` and implements the body.
 *
 * Wave 5 implementation plan (per PATTERNS.md section 28):
 *   1. Login as MSP admin via apps/web/tests/helpers.ts → loginAsMspAdmin(page).
 *   2. Navigate to /dashboard/assets and open any Asset.
 *   3. Click `Edit` (button role).
 *   4. NEGATIVE assertions: the following input labels MUST return count 0:
 *        - /hostname/i
 *        - /Operating System/i
 *        - /CPU Model/i
 *        - /CPU Cores/i
 *        - /RAM/i
 *      These fields are owned by CmdbCiServer post-Phase 8. The Asset edit
 *      form must not contain them at all (not disabled, not hidden — absent).
 *
 * Depends on Wave 3 (plan 08-04) having already stripped the fields from
 * apps/web/src/app/dashboard/assets/[id]/page.tsx.
 */
test.skip('Asset edit form has no hostname/OS/CPU/RAM inputs after Phase 8 (CASR-01)', async ({
  page,
}) => {
  // Wave 5 body — see Wave 5 implementation plan above.
  expect(page).toBeTruthy();
});
