import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Settings > SLA Policies', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/sla');
  });

  test('page loads and shows SLA list', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'New SLA Policy' })).toBeVisible();
  });

  test('create SLA policy, verify in list, edit, then delete', async ({ page }) => {
    const policyName = uniqueName('SLAPolicy');
    const editedName = policyName + '-edited';

    // --- CREATE ---
    await page.getByRole('button', { name: 'New SLA Policy' }).click();
    await page.locator('#policyName').fill(policyName);

    // Fill priority time values (P1-P4 response/resolution)
    const numberInputs = page.locator('input[type="number"]');
    const timeValues = [15, 60, 30, 240, 60, 480, 120, 1440];
    const count = await numberInputs.count();
    for (let i = 0; i < Math.min(count, timeValues.length); i++) {
      await numberInputs.nth(i).fill(String(timeValues[i]));
    }

    await page.getByRole('button', { name: /create policy/i }).click();
    await expect(page.getByText(policyName)).toBeVisible({ timeout: 10000 });

    // --- EDIT ---
    const row = page.locator('tr', { hasText: policyName });
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('#policyName')).toHaveValue(policyName);
    await page.locator('#policyName').fill(editedName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(editedName)).toBeVisible({ timeout: 10000 });

    // --- DELETE (uses window.confirm) ---
    page.on('dialog', dialog => dialog.accept());
    const editedRow = page.locator('tr', { hasText: editedName });
    await editedRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(editedName)).not.toBeVisible({ timeout: 10000 });
  });

  test('create SLA with business hours', async ({ page }) => {
    const policyName = uniqueName('SLA-BizHours');

    await page.getByRole('button', { name: 'New SLA Policy' }).click();
    await page.locator('#policyName').fill(policyName);

    const numberInputs = page.locator('input[type="number"]');
    const count = await numberInputs.count();
    for (let i = 0; i < Math.min(count, 8); i++) {
      await numberInputs.nth(i).fill(String((i + 1) * 30));
    }

    // Enable business hours (label wraps checkbox)
    const bizHours = page.getByLabel(/business hours/i);
    if (await bizHours.isVisible()) {
      await bizHours.check();
      await expect(page.locator('#timezone')).toBeVisible();
    }

    await page.getByRole('button', { name: /create policy/i }).click();
    await expect(page.getByText(policyName)).toBeVisible({ timeout: 10000 });

    // Cleanup
    page.on('dialog', dialog => dialog.accept());
    const row = page.locator('tr', { hasText: policyName });
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(policyName)).not.toBeVisible({ timeout: 10000 });
  });
});
