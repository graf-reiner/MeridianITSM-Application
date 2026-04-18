import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

/**
 * Phase 8 — CASR-05 / D-04 E2E: orphan Asset empty state + CIPicker.
 *
 * Creates a fresh Asset (orphan — no linked CI) by submitting the new-asset
 * form, then asserts:
 *   1. Technical Profile tab shows the D-04 empty state
 *   2. Link-a-CI button opens the CIPicker modal
 *   3. Cancel closes the modal without mutation
 *
 * We do NOT complete the PATCH /cmdb/cis/:id flow here because that requires
 * a known-existing CI in the test tenant; the negative "opens the picker"
 * assertion is the minimum-viable D-04 contract proof.
 *
 * Multi-tenancy: loginAsAdmin locks into a single tenant; the /assets/new
 * submit creates the Asset within that session tenant (T-8-01-05).
 */
test('Orphan Asset shows Link-a-CI empty state and picker opens (Phase 8 / CASR-05 / D-04)', async ({
  page,
}) => {
  await loginAsAdmin(page, '/dashboard/assets/new');

  // Fill the minimum required fields. The asset form uses standard HTML inputs
  // with name attributes (Task 2 ensured name='serialNumber' etc). Minimum to
  // satisfy the form is typically manufacturer + serial; if validation fails,
  // the test will also detect that and surface it.
  const uniqueSerial = uniqueName('TEST-ORPHAN');
  const serialInput = page.locator('input[name="serialNumber"]');
  if (await serialInput.count() > 0) {
    await serialInput.fill(uniqueSerial);
  }
  const manufacturerInput = page.locator('input[name="manufacturer"]');
  if (await manufacturerInput.count() > 0) {
    await manufacturerInput.fill('Dell');
  }
  const modelInput = page.locator('input[name="model"]');
  if (await modelInput.count() > 0) {
    await modelInput.fill('Precision Test');
  }

  // Submit. The route creates the Asset and typically navigates to /dashboard/assets/:id
  const submitButton = page.locator('button[type="submit"]').first();
  await submitButton.click();

  // Wait for navigation to the new asset's detail page.
  await page.waitForURL(/\/dashboard\/assets\/[^/]+$/, { timeout: 15_000 });

  // Click the Technical Profile tab.
  await page.locator('[data-testid="tab-technical-profile"]').click();

  // Expect the empty state (no linked CI yet).
  await expect(page.locator('[data-testid="technical-profile-empty"]')).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.locator('[data-testid="link-ci-button"]')).toBeVisible();

  // Click Link-a-CI — CIPicker modal opens.
  await page.locator('[data-testid="link-ci-button"]').click();
  await expect(page.locator('[data-testid="ci-picker"]')).toBeVisible({ timeout: 3_000 });

  // Cancel without selecting (cleanup — we don't alter the DB link state).
  await page.locator('button', { hasText: /cancel/i }).last().click();
  await expect(page.locator('[data-testid="ci-picker"]')).not.toBeVisible();
});
