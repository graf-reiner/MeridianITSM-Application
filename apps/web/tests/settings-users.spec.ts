import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Settings > Users', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/users');
  });

  test('page loads and shows user list with search', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'New User' })).toBeVisible();
    await expect(page.getByPlaceholder('Search users...')).toBeVisible();
  });

  test('create a user, verify in list, then edit name', async ({ page }) => {
    const firstName = 'TestFirst';
    const lastName = uniqueName('Last');
    const email = `test-${Date.now()}@test.local`;

    // --- CREATE ---
    await page.getByRole('button', { name: 'New User' }).click();
    await page.locator('#firstName').fill(firstName);
    await page.locator('#lastName').fill(lastName);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('TestPass123!');
    await page.locator('#role').selectOption('agent');
    await page.getByRole('button', { name: /create user/i }).click();
    await expect(page.getByText(email)).toBeVisible({ timeout: 10000 });

    // --- EDIT ---
    const row = page.locator('tr', { hasText: email });
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('#firstName')).toHaveValue(firstName);
    const editedFirst = firstName + 'Edited';
    await page.locator('#firstName').fill(editedFirst);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(editedFirst).first()).toBeVisible({ timeout: 10000 });

    // --- DISABLE/ENABLE ---
    const updatedRow = page.locator('tr', { hasText: email });
    const disableBtn = updatedRow.getByRole('button', { name: 'Disable' });
    if (await disableBtn.isVisible()) {
      await disableBtn.click();
      await expect(updatedRow.getByRole('button', { name: 'Enable' })).toBeVisible({ timeout: 10000 });
    }
  });

  test('search filters the user list', async ({ page }) => {
    const searchBox = page.getByPlaceholder('Search users...');
    await searchBox.fill('admin@msp.local');
    await page.waitForTimeout(500);
    await expect(page.getByText('admin@msp.local')).toBeVisible();
  });
});
