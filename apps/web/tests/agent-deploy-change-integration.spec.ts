import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

/**
 * Agent deploy ↔ ITIL Change integration (Option C: policy toggle).
 *
 * The toggle itself loads and flips without requiring any pre-seeded data, so
 * the UI-only spec runs everywhere. The full deploy-flow specs depend on a
 * seeded Windows agent + uploaded agent update package; guard them behind
 * HAS_AGENT_FIXTURES so wave-merge gates don't fail on dev machines without
 * those fixtures.
 */
test.describe('Agent deploy → change toggle UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/agent-updates');
  });

  test('toggle renders and persists across reload', async ({ page }) => {
    const toggleRow = page.getByText('Require change approval for agent deployments');
    await expect(toggleRow).toBeVisible();

    const checkbox = page.locator('input[type="checkbox"]').first();
    const before = await checkbox.isChecked();

    await checkbox.click();
    await expect(checkbox).toHaveJSProperty('checked', !before);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('input[type="checkbox"]').first()).toHaveJSProperty('checked', !before);

    // Restore original state so other specs aren't affected.
    await page.locator('input[type="checkbox"]').first().click();
    await expect(page.locator('input[type="checkbox"]').first()).toHaveJSProperty('checked', before);
  });
});

test.describe('Agent deploy flow — OFF (audit-trail only)', () => {
  test.skip(!process.env.HAS_AGENT_FIXTURES, 'requires seeded agent + uploaded update package');

  test('deploy fires immediately and creates a STANDARD change for audit', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/agent-updates');
    // Ensure toggle is OFF (audit-trail mode)
    const checkbox = page.locator('input[type="checkbox"]').first();
    if (await checkbox.isChecked()) await checkbox.click();

    await page.goto('/dashboard/settings/agents', { waitUntil: 'networkidle' });
    // Pick platform + version + deploy to all
    await page.locator('#deployPlatform').selectOption('WINDOWS');
    await page.locator('#deployVersion').selectOption({ index: 1 });
    await page.getByRole('button', { name: /Deploy to All Agents/ }).click();
    await page.getByRole('button', { name: /Confirm Deploy/ }).click();

    await expect(page.getByText(/Update deployed/)).toBeVisible({ timeout: 10000 });

    // Verify a STANDARD change landed on the deployments list
    await page.goto('/dashboard/settings/agent-updates', { waitUntil: 'networkidle' });
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow.getByText(/STANDARD/)).toBeVisible();
  });
});

test.describe('Agent deploy flow — ON (approval gate)', () => {
  test.skip(!process.env.HAS_AGENT_FIXTURES, 'requires seeded agent + uploaded update package');

  test('deploy creates NORMAL change, agents NOT updated until APPROVED', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/agent-updates');
    const checkbox = page.locator('input[type="checkbox"]').first();
    if (!(await checkbox.isChecked())) await checkbox.click();

    await page.goto('/dashboard/settings/agents', { waitUntil: 'networkidle' });
    await page.locator('#deployPlatform').selectOption('WINDOWS');
    await page.locator('#deployVersion').selectOption({ index: 1 });
    // Pick first approver
    await page.getByText('Approvers required').waitFor();
    await page.locator('input[type="checkbox"]').nth(1).click();

    await page.getByRole('button', { name: /Deploy to All Agents/ }).click();
    await page.getByRole('button', { name: /Confirm Deploy/ }).click();

    await expect(page.getByText(/Change created, awaiting approval/)).toBeVisible({ timeout: 10000 });

    await page.goto('/dashboard/settings/agent-updates', { waitUntil: 'networkidle' });
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow.getByText(/awaiting approval/i)).toBeVisible();
    await expect(firstRow.getByText(/NORMAL/)).toBeVisible();
  });
});
