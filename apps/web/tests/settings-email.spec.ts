import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Settings > Email Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/email');
  });

  test('page loads', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Add Account' }).first()).toBeVisible();
  });

  test('create email account with SMTP config, verify in list, edit, then delete', async ({ page }) => {
    const displayName = uniqueName('SupportMail');
    const emailAddr = `support-${Date.now()}@test.local`;
    const editedName = displayName + '-edited';

    // --- CREATE ---
    await page.getByRole('button', { name: 'Add Account' }).first().click();
    await page.locator('#displayName').fill(displayName);
    await page.locator('#emailAddress').fill(emailAddr);
    await page.locator('#smtpHost').fill('smtp.test.local');
    await page.locator('#smtpPort').fill('587');

    // Submit — use form submit button to avoid matching header "Add Account"
    await page.locator('form').getByRole('button', { name: /add account/i }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText(displayName)).toBeVisible({ timeout: 10000 });

    // --- EDIT ---
    const row = page.locator('tr', { hasText: displayName });
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('#displayName')).toHaveValue(displayName);
    await page.locator('#displayName').fill(editedName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(editedName)).toBeVisible({ timeout: 10000 });

    // --- DELETE (uses window.confirm) ---
    page.on('dialog', dialog => dialog.accept());
    const editedRow = page.locator('tr', { hasText: editedName });
    await editedRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(editedName)).not.toBeVisible({ timeout: 10000 });
  });
});
