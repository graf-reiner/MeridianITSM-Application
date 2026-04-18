import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

/**
 * Phase 8 — CASR-01 E2E negative assertion: the Asset edit form must NOT
 * expose hostname / operatingSystem / cpuModel / cpuCores / ramGb inputs.
 * Those fields are owned by CmdbCiServer (CI-side) post-Phase 8.
 *
 * Task 2 removed these inputs from apps/web/src/app/dashboard/assets/[id]/
 * page.tsx EditAssetForm. This spec locks the behavior.
 */
test('Asset edit form has no hostname/OS/CPU/RAM inputs after Phase 8 (CASR-01)', async ({
  page,
}) => {
  await loginAsAdmin(page, '/dashboard/assets');
  await page.waitForLoadState('networkidle');

  // Open the first asset.
  await page.locator('table tbody tr').first().click({ timeout: 10_000 });
  await page.waitForURL(/\/dashboard\/assets\/[^/]+$/, { timeout: 10_000 });

  // Click Edit — the form appears inline on the detail page.
  await page.getByRole('button', { name: /edit/i }).first().click();

  // Negative assertions — the following inputs MUST NOT exist.
  await expect(page.locator('input[name="hostname"]')).toHaveCount(0);
  await expect(page.locator('input[name="operatingSystem"]')).toHaveCount(0);
  await expect(page.locator('input[name="cpuModel"]')).toHaveCount(0);
  await expect(page.locator('input[name="cpuCores"]')).toHaveCount(0);
  await expect(page.locator('input[name="ramGb"]')).toHaveCount(0);
});
