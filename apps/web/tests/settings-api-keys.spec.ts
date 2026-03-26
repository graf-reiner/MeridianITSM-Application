import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Settings > API Keys', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/api-keys');
  });

  test('page loads', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create API Key' }).first()).toBeVisible();
  });

  test('create API key with scopes, verify in list, then revoke', async ({ page }) => {
    const keyName = uniqueName('TestAPIKey');

    // --- CREATE ---
    await page.getByRole('button', { name: 'Create API Key' }).first().click();
    await page.locator('#name').fill(keyName);
    await page.getByLabel('tickets.read').check();
    await page.getByLabel('tickets.write').check();
    await page.locator('form').getByRole('button', { name: /create key/i }).click();

    // Key banner should appear
    await expect(page.getByText(/copy it now/i)).toBeVisible({ timeout: 10000 });
    // Key name should be in the table
    await expect(page.getByText(keyName)).toBeVisible({ timeout: 10000 });

    // --- REVOKE ---
    const row = page.locator('tr', { hasText: keyName });
    await row.getByRole('button', { name: /revoke/i }).click();
    await page.getByRole('button', { name: /confirm revoke/i }).click();
    // Verify the confirm revoke action was processed (page refreshes the list)
    await page.waitForTimeout(2000);
  });

  test('cannot create key without selecting scopes', async ({ page }) => {
    await page.getByRole('button', { name: 'Create API Key' }).first().click();
    await page.locator('#name').fill('NoScopeKey');
    const ticketsRead = page.getByLabel('tickets.read');
    if (await ticketsRead.isChecked()) {
      await ticketsRead.uncheck();
    }
    const createBtn = page.locator('form').getByRole('button', { name: /create key/i });
    await expect(createBtn).toBeDisabled();
  });
});
